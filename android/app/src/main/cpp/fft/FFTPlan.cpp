#include "FFTPlan.h"

// Log Android.
//
// Tidak bisa dideteksi lewat makro: Termux juga mendefinisikan `__ANDROID__`
// DAN `__ANDROID_API__` (ini memang Android), tapi tidak menyediakan liblog -
// jadi `<android/log.h>` ketemu sementara `__android_log_print` gagal saat
// linking. `ANDROID_NDK` juga tidak bisa dipakai karena ada sebagai environment
// variable di shell ini.
//
// Karena itu deteksinya eksplisit: NDK mendefinisikan PRISTINE_HAVE_LIBLOG
// lewat CMakeLists (lihat target_compile_definitions). Di luar build Android,
// makro LOGD menjadi no-op - sehingga file ini bisa dikompilasi di mesin host
// untuk pengujian, memakai source yang sama persis.
#if defined(PRISTINE_HAVE_LIBLOG)
#include <android/log.h>
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "FFTPlan", __VA_ARGS__)
#else
#define LOGD(...) do {} while (0)
#endif

#include <cmath>

namespace pristine {

// =====================================================
// FFT RADIX-2 IN-PLACE (Decimation In Time)
// =====================================================
//
// Sebelumnya kelas ini adalah stub: `forward()` hanya menyalin input ke output
// dan `mCfg` selalu nullptr dengan komentar "kiss_fft_cfg" yang tidak pernah
// dialokasikan. Akibatnya magnitude keluaran = |x[n]| (transformasi identitas),
// bukan spektrum - visualizer menggambar garis datar.
//
// kissfft tidak ada di proyek ini, jadi implementasinya ditulis sendiri dan
// tidak menambah dependensi. Tabel twiddle dihitung sekali di konstruktor
// (bukan per frame), dan bit-reversal juga disiapkan sekali, supaya tidak ada
// alokasi maupun loop mahal di jalur yang dipanggil berulang.
//
// Kompleksitas: O(n log n). Untuk n = 2048 ini jauh di bawah budget frame.

FFTPlan::FFTPlan(int n)
    : mSize(n), mLevels(0), mBitRev(), mTwiddle(), mScratch() {

    if (mSize <= 0 || (mSize & (mSize - 1)) != 0) {
        LOGD("FFTPlan: ukuran %d bukan pangkat dua - plan tidak valid", n);
        mSize = 0;
        return;
    }

    // levels = log2(n)
    while ((1 << mLevels) < mSize) {
        ++mLevels;
    }

    // Tabel bit-reversal: bitRev[i] = i dengan bit-nya dibalik.
    mBitRev.resize(mSize);
    for (int i = 0; i < mSize; ++i) {
        int rev = 0;
        for (int b = 0; b < mLevels; ++b) {
            if (i & (1 << b)) {
                rev |= 1 << (mLevels - 1 - b);
            }
        }
        mBitRev[i] = rev;
    }

    // Tabel twiddle: exp(-2*pi*i*k/n) untuk k = 0 .. n/2-1.
    // Sumbu imajiner negatif karena ini forward FFT (konvensi e^{-i wt}).
    mTwiddle.resize(mSize / 2);
    const double twoPi = 2.0 * M_PI;
    for (int k = 0; k < mSize / 2; ++k) {
        const double angle = -twoPi * k / mSize;
        mTwiddle[k] = Complex(
            static_cast<float>(std::cos(angle)),
            static_cast<float>(std::sin(angle))
        );
    }

    mScratch.resize(mSize);

    LOGD("FFTPlan siap: n=%d, levels=%d", mSize, mLevels);
}

FFTPlan::~FFTPlan() = default;

void FFTPlan::forward(const float* realInput, Complex* complexOutput) {

    if (!realInput || !complexOutput) return;

    if (mSize == 0) {
        // Plan tidak valid (ukuran bukan pangkat dua). Biarkan output apa
        // adanya daripada menulis sampah - pemanggil yang harus memeriksa.
        LOGD("FFTPlan::forward dipanggil pada plan tidak valid");
        return;
    }

    // 1) Muat input real ke scratch dengan urutan bit-reversed.
    //    Sumbu imajiner nol karena inputnya sinyal real.
    for (int i = 0; i < mSize; ++i) {
        mScratch[i] = Complex(realInput[mBitRev[i]], 0.0f);
    }

    // 2) Butterfly per level.
    for (int level = 1; level <= mLevels; ++level) {

        const int half = 1 << (level - 1);
        const int step = mSize >> level;

        for (int start = 0; start < mSize; start += (half << 1)) {
            for (int k = 0; k < half; ++k) {

                const Complex w = mTwiddle[k * step];
                const Complex even = mScratch[start + k];
                const Complex odd = mScratch[start + k + half];
                const Complex t = w * odd;

                mScratch[start + k] = even + t;
                mScratch[start + k + half] = even - t;
            }
        }
    }

    // 3) Salin keluar.
    for (int i = 0; i < mSize; ++i) {
        complexOutput[i] = mScratch[i];
    }
}

void FFTPlan::inverse(const Complex* complexInput, float* realOutput) {

    if (!complexInput || !realOutput) return;

    if (mSize == 0) {
        LOGD("FFTPlan::inverse dipanggil pada plan tidak valid");
        return;
    }

    // Konjugasi -> forward -> konjugasi -> bagi n, tanpa tabel twiddle
    // terpisah untuk inverse.
    for (int i = 0; i < mSize; ++i) {
        mScratch[i] = std::conj(complexInput[mBitRev[i]]);
    }

    for (int level = 1; level <= mLevels; ++level) {

        const int half = 1 << (level - 1);
        const int step = mSize >> level;

        for (int start = 0; start < mSize; start += (half << 1)) {
            for (int k = 0; k < half; ++k) {

                const Complex w = mTwiddle[k * step];
                const Complex even = mScratch[start + k];
                const Complex odd = mScratch[start + k + half];
                const Complex t = w * odd;

                mScratch[start + k] = even + t;
                mScratch[start + k + half] = even - t;
            }
        }
    }

    const float scale = 1.0f / static_cast<float>(mSize);
    for (int i = 0; i < mSize; ++i) {
        realOutput[i] = std::conj(mScratch[i]).real() * scale;
    }
}

} // namespace pristine
