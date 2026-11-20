// =====================================================
// dsp/convolution/ConvolverNode.cpp
// =====================================================
//
// Convolver / impulse response loader. Lihat header untuk kontrak
// lengkap.
//
// SPDX-License-Identifier: MIT

#include "ConvolverNode.h"

#include <algorithm>
#include <cmath>
#include <cstring>

// Log Android — pola yang sama dengan HRTFNode.cpp: NDK
// mendefinisikan PRISTINE_HAVE_LIBLOG lewat CMakeLists; di luar
// build Android LOGD menjadi no-op sehingga file ini bisa
// dikompilasi di mesin host untuk pengujian.
#if defined(PRISTINE_HAVE_LIBLOG)
#include <android/log.h>
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "ConvolverNode", __VA_ARGS__)
#else
#define LOGD(...) do {} while (0)
#endif

namespace pristine {

namespace {

// Setengah lebar jendela resample, dalam sampel input.
// Sama dengan HRTFNode (matematika yang sama — lihat header).
constexpr int kResampleHalfWidth = 16;

double blackmanWindow(double t) {
    // t dalam [-1, 1].
    return 0.42 - 0.5 * std::cos(M_PI * (t + 1.0))
        + 0.08 * std::cos(2.0 * M_PI * (t + 1.0));
}

double sinc(double x) {
    if (std::fabs(x) < 1e-9) {
        return 1.0;
    }
    return std::sin(M_PI * x) / (M_PI * x);
}

} // namespace

// =====================================================
// PREPARE
// =====================================================

void ConvolverNode::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate > 0 ? sampleRate : 48000;
    mMaxFrames = maxFrames > 0 ? maxFrames : 1920;

    mTmpL.assign(static_cast<size_t>(mMaxFrames), 0.0f);
    mTmpR.assign(static_cast<size_t>(mMaxFrames), 0.0f);

    mConvL.prepare(mSampleRate);
    mConvR.prepare(mSampleRate);

    // Rebuild kernel dari IR asli untuk laju stream ini (ganti track
    // / reopen bisa membawa laju baru). Gagal (IR tidak muat sesudah
    // resample) = node inert: convolver tanpa kernel = passthrough,
    // bukan bisu. IR asli tetap tersimpan — laju kembali normal,
    // prepare() berikut me-rebuild lagi.
    const bool staged = stageKernelForRate(mSampleRate);
    mSeenGeneration = -1;

    // Mulai dari wet 0: enable pertama selalu fade-in bersih.
    // mWetTarget TIDAK disentuh — milik applyConfig.
    mWetCurrent = 0.0f;

    LOGD(
        "prepare: rate=%d maxFrames=%d ir=%s staged=%s taps=%d",
        mSampleRate,
        mMaxFrames,
        hasIr() ? "loaded" : "none",
        staged ? "ok" : "no",
        irTapsForRate(mSampleRate)
    );
}

// =====================================================
// RESET
// =====================================================

void ConvolverNode::reset() {

    // Reset TIDAK menyentuh wet berjalan (pola ReverbNode/HRTFNode):
    // reset() dipanggil DSPGraph saat output non-finite atau ganti
    // mode — menyamakan wet ke target di sini akan memotong fade yang
    // sedang berjalan. Yang dibersihkan hanya delay line convolver.
    resetConvolvers();
}

void ConvolverNode::resetConvolvers() {
    mConvL.reset();
    mConvR.reset();
}

// =====================================================
// SET IR SOURCE
// =====================================================

void ConvolverNode::setIrSource(
    const std::vector<float>& samples,
    int sampleRateHz
) {

    std::lock_guard<std::mutex> lock(mIrMutex);
    mIrOriginal = samples;
    mIrRateHz = sampleRateHz;
    mIrLoaded.store(
        !samples.empty() && sampleRateHz > 0,
        std::memory_order_release
    );
}

// =====================================================
// STAGE KERNEL
// =====================================================

bool ConvolverNode::stageKernelForRate(int streamRateHz) {

    std::vector<float> original;
    int originalRate = 0;
    {
        std::lock_guard<std::mutex> lock(mIrMutex);
        if (!mIrLoaded.load(std::memory_order_acquire)) {
            return false;
        }
        original = mIrOriginal;
        originalRate = mIrRateHz;
    }

    if (
        original.empty() ||
        originalRate <= 0 ||
        streamRateHz <= 0
    ) {
        return false;
    }

    const int outLen = static_cast<int>(
        std::llround(
            static_cast<double>(original.size()) *
            static_cast<double>(streamRateHz) /
            static_cast<double>(originalRate)
        )
    );
    if (
        outLen < 1 ||
        outLen > UniformPartitionedConvolver::kMaxMultiKernelLength
    ) {
        LOGD(
            "stageKernelForRate: rate %d butuh %d tap (maks %d) — "
            "node inert",
            streamRateHz,
            outLen,
            UniformPartitionedConvolver::kMaxMultiKernelLength
        );
        return false;
    }

    std::vector<float> resampled(
        static_cast<size_t>(outLen),
        0.0f
    );
    if (originalRate == streamRateHz) {
        resampled = original;
    } else if (!resampleKernel(
            original.data(),
            static_cast<int>(original.size()),
            originalRate,
            resampled.data(),
            outLen,
            streamRateHz
        )
    ) {
        return false;
    }

    // Stage ke kedua kanal (live-safe: FFT di thread ini, pasang di
    // process() berikutnya). Satu kanal gagal = anggap gagal — state
    // lama dipertahankan di kanal yang belum tersentuh.
    if (!mConvL.setKernelPartitioned(
            resampled.data(),
            outLen
        )
    ) {
        return false;
    }
    if (!mConvR.setKernelPartitioned(
            resampled.data(),
            outLen
        )
    ) {
        return false;
    }
    return true;
}

// =====================================================
// RESAMPLE KERNEL
// =====================================================

bool ConvolverNode::resampleKernel(
    const float* in,
    int inLen,
    int inRate,
    float* out,
    int outLen,
    int outRate
) {

    if (
        !in || !out
        || inLen <= 0 || outLen <= 0
        || inRate <= 0 || outRate <= 0
    ) {
        return false;
    }

    // Blackman-windowed sinc, satu jalan. fc = cutoff anti-alias
    // dalam satuan Nyquist input (downsample: fc < 1).
    const double ratio =
        static_cast<double>(inRate) / static_cast<double>(outRate);
    const double fc = std::min(
        1.0,
        static_cast<double>(outRate) / static_cast<double>(inRate)
    );
    const int A = kResampleHalfWidth;

    for (int j = 0; j < outLen; ++j) {
        const double p = static_cast<double>(j) * ratio;
        const int center = static_cast<int>(std::floor(p));
        double sum = 0.0;
        for (int k = center - A + 1; k <= center + A; ++k) {
            const double x = p - static_cast<double>(k);
            const double w = blackmanWindow(x / static_cast<double>(A));
            const double h = fc * sinc(fc * x) * w;
            const double xv =
                (k >= 0 && k < inLen)
                    ? static_cast<double>(in[k])
                    : 0.0;
            sum += xv * h;
        }
        out[j] = static_cast<float>(sum);
    }

    for (int j = 0; j < outLen; ++j) {
        if (!std::isfinite(out[j])) {
            return false;
        }
    }
    return true;
}

// =====================================================
// CLEAR IR
// =====================================================

void ConvolverNode::clearIr() {

    std::lock_guard<std::mutex> lock(mIrMutex);
    mIrOriginal.clear();
    mIrRateHz = 0;
    mIrLoaded.store(false, std::memory_order_release);
}

// =====================================================
// INFO
// =====================================================

int ConvolverNode::irTapsForRate(int streamRateHz) const {

    std::lock_guard<std::mutex> lock(mIrMutex);
    if (
        !mIrLoaded.load(std::memory_order_acquire) ||
        mIrOriginal.empty() ||
        mIrRateHz <= 0 ||
        streamRateHz <= 0
    ) {
        return 0;
    }
    return static_cast<int>(
        std::llround(
            static_cast<double>(mIrOriginal.size()) *
            static_cast<double>(streamRateHz) /
            static_cast<double>(mIrRateHz)
        )
    );
}

// =====================================================
// PROCESS
// =====================================================

void ConvolverNode::process(
    float* left,
    float* right,
    int frames
) {

    if (!left || !right || frames <= 0) {
        return;
    }

    // Pasang kernel yang diumumkan setKernelPartitioned SEBELUM
    // membaca generasi di bawah — kalau tidak, generasi baru
    // terlihat satu panggilan terlambat dan wet yang sudah settle
    // ditenggelamkan lagi tanpa sebab (lihat installPendingKernel
    // di header convolver).
    mConvL.installPendingKernel();
    mConvR.installPendingKernel();

    // Swap kernel terdeteksi (IR baru terpasang): tenggelamkan wet
    // potongan ekor kernel lama. Generasi awal -1 supaya kernel
    // pertama sesudah prepare() juga terdeteksi (wet sudah 0 dari
    // prepare(), jadi tidak ada efek samping).
    const int generation = mConvL.kernelGeneration();
    if (generation != mSeenGeneration) {
        mSeenGeneration = generation;
        mWetCurrent = 0.0f;
    }

    // Target efektif dibaca tiap buffer (bukan hanya di applyConfig):
    // clearIr() dari thread UI tidak memanggil applyConfig — tanpa
    // ini, IR yang sudah dihapus tetap berbunyi sampai ada perubahan
    // config lain. mIrLoaded atomic, jadi aman dibaca audio thread.
    const bool irLive =
        mIrLoaded.load(std::memory_order_acquire);
    const float target =
        (mWetTarget > 0.5f && irLive) ? 1.0f : 0.0f;

    // Wet settle di 0: passthrough bit-exact, biaya NOL. (Pola yang
    // sama dengan ReverbNode preset 0 / HRTFNode wet 0.)
    if (
        target <= kSettledEps
        && mWetCurrent <= kSettledEps
    ) {
        return;
    }

    int offset = 0;
    int remaining = frames;
    while (remaining > 0) {
        const int n = std::min(remaining, mMaxFrames);

        // Kedua convolver menunda tepat satu blok (sama) — hasil
        // penjumlahannya tetap selaras waktu. Tanpa kernel (belum
        // ada IR / rebuild gagal): process() convolver = passthrough,
        // jadi campuran di bawah = dry apa adanya.
        mConvL.process(left + offset, mTmpL.data(), n);
        mConvR.process(right + offset, mTmpR.data(), n);

        for (int i = 0; i < n; ++i) {
            // Haluskan wet one-pole (pola GainNode/ReverbNode/HRTFNode):
            // toggle tidak mengklik. Di dalam ambang, snap persis.
            if (std::fabs(target - mWetCurrent) > kSettledEps) {
                mWetCurrent +=
                    (target - mWetCurrent) * kSmooth;
            } else {
                mWetCurrent = target;
            }

            const float dryL = left[offset + i];
            const float dryR = right[offset + i];

            left[offset + i] =
                dryL * (1.0f - mWetCurrent) +
                mTmpL[static_cast<size_t>(i)] * mWetCurrent;
            right[offset + i] =
                dryR * (1.0f - mWetCurrent) +
                mTmpR[static_cast<size_t>(i)] * mWetCurrent;
        }

        offset += n;
        remaining -= n;
    }
}

// =====================================================
// APPLY CONFIG
// =====================================================

void ConvolverNode::applyConfig(
    const DSPConfig& config
) {

    // SENGAJA TIDAK memakai setEnabled(): graph melewatkan node
    // yang disabled, sehingga fade-out tidak mungkin terjadi
    // (potong keras = klik). Node selalu dikunjungi graph; yang
    // diatur hanya target wet — early-return di process() yang
    // memberi passthrough bit-exact saat settle di 0.
    const float target = config.convolverEnabled ? 1.0f : 0.0f;
    if (target != mWetTarget) {
        if (target > 0.5f) {
            // OFF -> ON: bersihkan state convolver dulu (pola
            // ReverbNode 0 -> preset / HRTFNode OFF -> ON) — ekor
            // basi dari pemakaian sebelumnya tidak boleh meledak
            // keluar.
            resetConvolvers();
        }
        mWetTarget = target;
    }
}

} // namespace pristine
