// =====================================================
// dsp/hrtf/HRTFNode.cpp
// =====================================================
//
// HRTF virtual-speaker node. Lihat header untuk kontrak lengkap.
//
// SPDX-License-Identifier: MIT

#include "HRTFNode.h"

#include "hrir_kemar_dfc48.h"

#include <algorithm>
#include <cmath>
#include <cstring>

// Log Android — pola yang sama dengan fft/FFTPlan.cpp: NDK
// mendefinisikan PRISTINE_HAVE_LIBLOG lewat CMakeLists; di luar
// build Android LOGD menjadi no-op sehingga file ini bisa
// dikompilasi di mesin host untuk pengujian.
#if defined(PRISTINE_HAVE_LIBLOG)
#include <android/log.h>
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "HRTFNode", __VA_ARGS__)
#else
#define LOGD(...) do {} while (0)
#endif

namespace pristine {

namespace {

// Setengah lebar jendela resample, dalam sampel input.
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

void HRTFNode::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate > 0 ? sampleRate : 48000;
    mMaxFrames = maxFrames > 0 ? maxFrames : 1920;

    mTmpLL.assign(static_cast<size_t>(mMaxFrames), 0.0f);
    mTmpLR.assign(static_cast<size_t>(mMaxFrames), 0.0f);
    mTmpRL.assign(static_cast<size_t>(mMaxFrames), 0.0f);
    mTmpRR.assign(static_cast<size_t>(mMaxFrames), 0.0f);

    mKernelsReady = loadKernels(mSampleRate);
    resetConvolvers();

    // Mulai dari wet 0: enable pertama selalu fade-in bersih.
    // mWetTarget TIDAK disentuh — milik applyConfig.
    mWetCurrent = 0.0f;

    LOGD(
        "prepare: rate=%d maxFrames=%d kernels=%s trim=%.4f",
        mSampleRate,
        mMaxFrames,
        mKernelsReady ? "ok" : "FAILED",
        static_cast<double>(kHrirTrimGain)
    );
}

// =====================================================
// RESET
// =====================================================

void HRTFNode::reset() {

    // Reset TIDAK menyentuh wet berjalan (pola ReverbNode): reset()
    // dipanggil DSPGraph saat output non-finite atau ganti mode —
    // menyamakan wet ke target di sini akan memotong fade yang
    // sedang berjalan. Yang dibersihkan hanya delay line convolver.
    resetConvolvers();
}

void HRTFNode::resetConvolvers() {
    mConvLL.reset();
    mConvLR.reset();
    mConvRL.reset();
    mConvRR.reset();
}

// =====================================================
// LOAD KERNELS
// =====================================================

bool HRTFNode::loadKernels(int sampleRate) {

    // Trim dilipat ke kernel saat load (bukan per sampel): toggle
    // HRTF tidak menimbulkan lompatan loudness (trim +0,39 dB,
    // terukur dari energi HRIR — lihat hrir_kemar_dfc48.h).
    auto loadOne = [this](
        const float* kernel,
        UniformPartitionedConvolver& conv
    ) {
        std::vector<float> scaled(
            kHrirNumTaps,
            0.0f
        );
        for (size_t i = 0; i < kHrirNumTaps; ++i) {
            scaled[i] = kernel[i] * kHrirTrimGain;
        }
        return conv.setKernel(scaled.data(), static_cast<int>(kHrirNumTaps));
    };

    if (sampleRate == kHrirSampleRateHz) {
        return loadOne(kHrirLeftSpeakerLeftEar, mConvLL)
            && loadOne(kHrirLeftSpeakerRightEar, mConvLR)
            && loadOne(kHrirRightSpeakerLeftEar, mConvRL)
            && loadOne(kHrirRightSpeakerRightEar, mConvRR);
    }

    // Laju lain: resample ke laju stream. Panjang hasil harus muat
    // satu partisi konvolver (<= 256 tap); 96 kHz -> 512 tap tidak
    // muat -> node inert (passthrough), dicatat di log.
    const int outLen = static_cast<int>(
        std::llround(
            static_cast<double>(kHrirNumTaps)
            * static_cast<double>(sampleRate)
            / static_cast<double>(kHrirSampleRateHz)
        )
    );
    if (
        outLen < 1
        || outLen > UniformPartitionedConvolver::kMaxKernelLength
    ) {
        LOGD(
            "loadKernels: rate %d butuh %d tap (maks %d) — HRTF nonaktif",
            sampleRate,
            outLen,
            UniformPartitionedConvolver::kMaxKernelLength
        );
        return false;
    }

    const float* sources[4] = {
        kHrirLeftSpeakerLeftEar,
        kHrirLeftSpeakerRightEar,
        kHrirRightSpeakerLeftEar,
        kHrirRightSpeakerRightEar,
    };
    UniformPartitionedConvolver* convs[4] = {
        &mConvLL,
        &mConvLR,
        &mConvRL,
        &mConvRR,
    };

    std::vector<float> resampled(static_cast<size_t>(outLen), 0.0f);
    std::vector<float> scaled(static_cast<size_t>(outLen), 0.0f);
    for (int k = 0; k < 4; ++k) {
        if (!resampleKernel(
                sources[k],
                static_cast<int>(kHrirNumTaps),
                kHrirSampleRateHz,
                resampled.data(),
                outLen,
                sampleRate
            )
        ) {
            return false;
        }
        float peak = 0.0f;
        for (int i = 0; i < outLen; ++i) {
            scaled[static_cast<size_t>(i)] =
                resampled[static_cast<size_t>(i)] * kHrirTrimGain;
            peak = std::fmax(
                peak,
                std::fabs(scaled[static_cast<size_t>(i)])
            );
        }
        // Kernel hasil resample yang sunyi = ada yang salah.
        if (!(peak > 0.0f) || !std::isfinite(peak)) {
            return false;
        }
        if (!convs[k]->setKernel(scaled.data(), outLen)) {
            return false;
        }
    }
    return true;
}

bool HRTFNode::resampleKernel(
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
// PROCESS
// =====================================================

void HRTFNode::process(
    float* left,
    float* right,
    int count
) {

    if (!left || !right || count <= 0) {
        return;
    }

    // Wet settle di 0: passthrough bit-exact, biaya NOL. (Pola yang
    // sama dengan ReverbNode preset 0.)
    if (
        mWetTarget <= kSettledEps
        && mWetCurrent <= kSettledEps
    ) {
        return;
    }

    // Kernel gagal dimuat: inert, jangan membisukan audio.
    if (!mKernelsReady) {
        return;
    }

    int offset = 0;
    int remaining = count;
    while (remaining > 0) {
        const int n = std::min(remaining, mMaxFrames);

        // Empat konvolusi (tiap-tiap menunda satu blok — keempatnya
        // sama, jadi hasil penjumlahannya tetap selaras waktu).
        mConvLL.process(left + offset, mTmpLL.data(), n);
        mConvLR.process(left + offset, mTmpLR.data(), n);
        mConvRL.process(right + offset, mTmpRL.data(), n);
        mConvRR.process(right + offset, mTmpRR.data(), n);

        for (int i = 0; i < n; ++i) {
            // Haluskan wet one-pole (pola GainNode/ReverbNode):
            // toggle tidak mengklik. Di dalam ambang, snap persis.
            if (std::fabs(mWetTarget - mWetCurrent) > kSettledEps) {
                mWetCurrent +=
                    (mWetTarget - mWetCurrent) * kSmooth;
            } else {
                mWetCurrent = mWetTarget;
            }

            const float wetL = mTmpLL[static_cast<size_t>(i)]
                + mTmpRL[static_cast<size_t>(i)];
            const float wetR = mTmpLR[static_cast<size_t>(i)]
                + mTmpRR[static_cast<size_t>(i)];
            const float dryL = left[offset + i];
            const float dryR = right[offset + i];

            left[offset + i] =
                dryL * (1.0f - mWetCurrent) + wetL * mWetCurrent;
            right[offset + i] =
                dryR * (1.0f - mWetCurrent) + wetR * mWetCurrent;
        }

        offset += n;
        remaining -= n;
    }
}

// =====================================================
// APPLY CONFIG
// =====================================================

void HRTFNode::applyConfig(
    const DSPConfig& config
) {

    // SENGAJA TIDAK memakai setEnabled(): graph melewatkan node
    // yang disabled, sehingga fade-out tidak mungkin terjadi
    // (potong keras = klik). Node selalu dikunjungi graph; yang
    // diatur hanya target wet — early-return di process() yang
    // memberi passthrough bit-exact saat settle di 0.
    const float target = config.hrtfEnabled ? 1.0f : 0.0f;
    if (target != mWetTarget) {
        if (target > 0.5f) {
            // OFF -> ON: bersihkan state convolver dulu (pola
            // ReverbNode 0 -> preset) — ekor basi dari pemakaian
            // sebelumnya tidak boleh meledak keluar.
            resetConvolvers();
        }
        mWetTarget = target;
    }
}

} // namespace pristine
