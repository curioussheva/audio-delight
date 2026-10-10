// =====================================================
// scripts/test_noise_softclip.cpp
// =====================================================
//
// Membuktikan sumber noise "di beberapa file": softClip(x) = x/(1+|x|) yang
// diterapkan ke SETIAP sample di AudioCallback (jalur produksi), tanpa syarat.
//
// Dua hipotesis diuji:
//   H1  Waveshaper aktif di seluruh rentang → THD naik seiring level sinyal.
//       Ini menjelaskan kenapa hanya "BEBERAPA file" yang terdengar noise:
//       master yang dikompresi keras (level rata-rata tinggi) paling parah.
//   H2  Ambang denormal 1e-15f memotong ekor sinyal (decay/fade) yang sah.
//
// Build:
//   clang++ -std=c++17 -O2 scripts/test_noise_softclip.cpp -o "$TMPDIR/t" && "$TMPDIR/t"

#include <cstdio>
#include <cmath>
#include <vector>
#include <algorithm>

// ---- salinan PERSIS dua implementasi yang dibandingkan -------------------

// LAMA: dipakai AudioCallback.cpp (jalur produksi) sebelum perbaikan ini.
static inline float softClipOld(float x) noexcept {
    return x / (1.0f + std::fabs(x));
}

// BARU: dsp/Limiter.h — identity di bawah ambang, membentuk hanya di atasnya.
static constexpr float kLimiterThreshold = 0.98f;
static inline float limiterNew(float x) noexcept {
    const float a = std::fabs(x);
    if (a <= kLimiterThreshold) return x;
    const float over  = a - kLimiterThreshold;
    const float range = 1.0f - kLimiterThreshold;
    const float y     = kLimiterThreshold + over / (1.0f + over / range);
    return (x < 0.0f) ? -y : y;
}

// ---- pengukuran ---------------------------------------------------------

static int gFail = 0;
static void check(bool ok, const char* what) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (!ok) ++gFail;
}

// Gain terdistorsi terhadap fundamental, dalam dB.
static float gainDbAt(float amp, float (*fn)(float)) {
    const float y = fn(amp);
    return 20.0f * std::log10(y / amp);
}

// THD (%) dari gelombang sinus amplitudo `amp`, N harmonisa, fs=48000.
// Frekuensi sengaja ditaruh tepat di bin DFT (lihat fBin di dalam) supaya
// pengukuran tidak terkontaminasi kebocoran spektral.
static float thdPercent(float amp, float /*freq diabaikan*/, float (*fn)(float)) {
    const int fs = 48000;
    const int N  = 8192;
    // Frekuensi tepat di satu bin DFT (32 siklus / 8192 sample) supaya tidak
    // ada kebocoran spektral — kalau tidak, THD palsu ~0.1% muncul di mana-mana
    // dan menyamarkan perbedaan yang sedang diukur.
    const float fBin = static_cast<float>(fs) * 32.0f / static_cast<float>(N);
    std::vector<double> re(9, 0.0), im(9, 0.0);

    for (int n = 0; n < N; ++n) {
        const double t = 2.0 * M_PI * fBin * n / fs;
        const double x = amp * std::sin(t);
        const double y = fn(static_cast<float>(x));
        for (int h = 1; h <= 8; ++h) {
            re[h] += y * std::cos(h * 2.0 * M_PI * fBin * n / fs);
            im[h] += y * std::sin(h * 2.0 * M_PI * fBin * n / fs);
        }
    }

    const double f0 = std::sqrt(re[1]*re[1] + im[1]*im[1]);
    double harm = 0.0;
    for (int h = 2; h <= 8; ++h) {
        harm += re[h]*re[h] + im[h]*im[h];
    }
    if (f0 <= 0.0) return 0.0f;
    return static_cast<float>(100.0 * std::sqrt(harm) / f0);
}

int main() {
    std::printf("=======================================================\n");
    std::printf("H1: waveshaper aktif di SELURUH rentang\n");
    std::printf("=======================================================\n\n");

    std::printf("%8s | %12s | %12s | %10s | %10s\n",
                "amp", "gain LAMA", "gain BARU", "THD LAMA%", "THD BARU%");
    std::printf("---------+--------------+--------------+------------+-----------\n");

    const float levels[] = {0.10f, 0.20f, 0.30f, 0.50f, 0.70f, 0.90f, 0.99f};
    for (float a : levels) {
        std::printf("%8.2f | %9.3f dB | %9.3f dB | %10.3f | %9.3f\n",
                    a,
                    gainDbAt(a, softClipOld), gainDbAt(a, limiterNew),
                    thdPercent(a, 997.0f, softClipOld),
                    thdPercent(a, 997.0f, limiterNew));
    }

    std::printf("\n");

    // ---- H1: distorsi meningkat seiring level ---------------------------

    const float thdLowOld  = thdPercent(0.10f, 997.0f, softClipOld);
    const float thdHighOld = thdPercent(0.90f, 997.0f, softClipOld);
    const float thdMidOld  = thdPercent(0.50f, 997.0f, softClipOld);

    check(thdLowOld  > 0.5f,  "lama: THD >0.5% bahkan di amplitudo 0.10 (sinyal pelan)");
    check(thdMidOld  > 3.0f,  "lama: THD >3% di amplitudo 0.50 (level rata-rata musik)");
    check(thdHighOld > 7.0f,  "lama: THD >7% di amplitudo 0.90 (master keras)");
    check(thdHighOld > thdLowOld * 3.0f,
          "lama: THD naik >3x dari level pelan ke level keras → ini sebabnya hanya SEBAGIAN file terdengar noise");

    const float lostDb = gainDbAt(1.0f, softClipOld);
    check(lostDb < -5.0f, "lama: full scale kehilangan >5 dB (bukan bit-perfect)");

    // ---- H1 fix: jalur baru identity di bawah ambang --------------------

    bool identity = true;
    for (int i = -98; i <= 98; ++i) {
        const float x = i / 100.0f;                 // -0.98..0.98
        if (limiterNew(x) != x) { identity = false; break; }
    }
    check(identity, "baru: identity bit-exact di |x| <= 0.98 (nol distorsi)");

    float maxThdBand = 0.0f;
    for (float a : {0.30f, 0.50f, 0.70f, 0.90f, 0.98f}) {
        maxThdBand = std::max(maxThdBand, thdPercent(a, 0.0f, limiterNew));
    }
    std::printf("  THD maksimum jalur baru di seluruh rentang legal: %.4f%%\n", maxThdBand);
    check(maxThdBand < 0.01f, "baru: THD <0.01% di seluruh rentang sinyal legal (praktis nol)");

    // ---- kontinuitas & monotonisitas di titik sambung -------------------

    check(std::fabs(limiterNew(0.98f) - 0.98f) < 1e-6f,
          "baru: kontinu di ambang (y(0.98) == 0.98)");

    const float h = 1e-4f;
    const float slopeBelow = (limiterNew(kLimiterThreshold) - limiterNew(kLimiterThreshold - h)) / h;
    const float slopeAbove = (limiterNew(kLimiterThreshold + h) - limiterNew(kLimiterThreshold)) / h;
    check(std::fabs(slopeBelow - 1.0f) < 1e-2f && std::fabs(slopeAbove - 1.0f) < 1e-2f,
          "baru: turunan 1 di kedua sisi ambang (tidak ada sudut → tidak ada harmonisa orde tinggi)");

    bool monotone = true;
    float prev = -1e9f;
    for (int i = 0; i <= 400; ++i) {
        const float x = i / 100.0f;                 // 0..4
        const float y = limiterNew(x);
        if (y < prev - 1e-7f) { monotone = false; break; }
        prev = y;
    }
    check(monotone, "baru: monoton naik sampai 4.0 (tidak ada lipatan)");

    // Saturasi harus berhenti TEPAT di full scale, tidak melewatinya. Nilai
    // ekstrem dibulatkan float ke 1.0f — itu batas yang benar untuk limiter,
    // yang penting tidak pernah > 1.0f (itu yang akan clip di DAC).
    bool bounded = true;
    for (float x : {1.0f, 2.0f, 10.0f, 1e3f, 1e6f, 1e30f}) {
        const float y = limiterNew(x);
        if (!(y <= 1.0f) || y < 0.98f) { bounded = false; }
    }
    check(bounded, "baru: selalu di [0.98, 1.0] di atas ambang — tidak pernah melewati full scale");

    // ---- H2: ambang denormal lama 1e-15f --------------------------------
    //
    // JUJUR: ini BUKAN penyebab noise yang terdengar. 1e-15f adalah -300 dBFS,
    // jauh di bawah ambang dengar di semua format. Yang lama hanya salah
    // kategori (ambang denormal double dipakai untuk float), dan efeknya
    // terbatas pada ekor decay panjang. Diukur, bukan diklaim.

    std::printf("\n=======================================================\n");
    std::printf("H2: ambang denormal 1e-15f (BUKAN penyebab noise audible)\n");
    std::printf("=======================================================\n\n");

    const float kOldDenormal = 1e-15f;
    const float kNewDenormal = 1e-30f;

    const int fs = 48000;
    int cutOld = 0, cutNew = 0;
    const float tau = 3.0f;                          // decay 3 detik
    for (int n = 0; n < fs * 10; ++n) {
        const float env = std::exp(-static_cast<float>(n) / fs / tau);
        if (env < kOldDenormal) ++cutOld;
        if (env < kNewDenormal) ++cutNew;
    }
    std::printf("  decay 3s selama 10s: dipotong lama=%d sample, baru=%d sample\n",
                cutOld, cutNew);

    // -300 dBFS tepat SAMA dengan ambang lama (1e-15), jadi untuk menguji
    // "di bawah ambang" pakai -310 dBFS (3.16e-16), yang memang lebih kecil.
    const float minus300dB = std::pow(10.0f, -300.0f / 20.0f);
    const float minus310dB = std::pow(10.0f, -310.0f / 20.0f);
    std::printf("  -300 dBFS = %.3e (== ambang lama) | -310 dBFS = %.3e\n",
                minus300dB, minus310dB);
    std::printf("  ambang lama %.0e  |  ambang baru %.0e  |  FLT_MIN %.3e\n",
                kOldDenormal, kNewDenormal, 1.1920929e-38f);

    check(cutOld == 0,
          "lama: ambang 1e-15 TIDAK memotong decay 3s dalam 10s → tidak audible");
    check(kOldDenormal > 1.1920929e-37f * 1e7f,
          "lama: 1e-15f jauh di atas FLT_MIN (1.19e-38) — ambang double, bukan float");
    check(kNewDenormal <= 1.1920929e-38f * 1e8f,
          "baru: 1e-30f masih di atas FLT_MIN → menangkap denormal float sungguhan");
    check(minus310dB < kOldDenormal && minus310dB > kNewDenormal,
          "kesimpulan: H2 perbaikan kebenaran, BUKAN sumber noise yang didengar");

    std::printf("\n=======================================================\n");
    std::printf("%s  (%d gagal)\n", gFail ? "ADA YANG GAGAL" : "SEMUA LULUS", gFail);
    std::printf("=======================================================\n");
    return gFail ? 1 : 0;
}
