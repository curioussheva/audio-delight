// scripts/test_fft_parity.cpp
//
// Padanan C++ dari VisualizerFFTParityTest.kt.
//
// Kotlin (`NativeVisualizerBridge.kt`) dan C++ (`cpp/fft/FFTPlan.cpp`) berisi
// dua implementasi FFT radix-2 yang sama. Dua salinan algoritma adalah cara
// klasik untuk diam-diam menyimpang, jadi uji ini menjalankan keduanya atas
// input yang identik dan membandingkan angka keluarannya.
//
// Sisi C++ dijalankan di sini (Termux punya g++, tidak punya kotlinc).
// Sisi Kotlin dijalankan di CI lewat gradle. Kalau output keduanya berbeda,
// salah satu berubah tanpa yang lain.
//
// Jalankan:
//   g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/fft \
//       scripts/test_fft_parity.cpp \
//       android/app/src/main/cpp/fft/FFTPlan.cpp -o "$TMPDIR/parity" && "$TMPDIR/parity"

#include "FFTPlan.h"

#include <cmath>
#include <cstdio>
#include <vector>

using namespace pristine;

static int gPassed = 0;
static int gFailed = 0;

static void check(bool ok, const char* what) {
    if (ok) { ++gPassed; std::printf("  PASS  %s\n", what); }
    else    { ++gFailed; std::printf("  FAIL  %s\n", what); }
}

// =====================================================
// Salinan algoritma Kotlin (tanpa normalisasi, magnitude dipisah)
// =====================================================
static void kotlinFft(std::vector<float>& re, std::vector<float>& im) {
    const int n = static_cast<int>(re.size());

    int j = 0;
    for (int i = 1; i < n; ++i) {
        int bit = n >> 1;
        while ((j & bit) != 0) {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }

    for (int len = 2; len <= n; len <<= 1) {
        const double ang = -2.0 * M_PI / len;
        const float wRe = static_cast<float>(std::cos(ang));
        const float wIm = static_cast<float>(std::sin(ang));

        for (int i = 0; i < n; i += len) {
            float curRe = 1.0f, curIm = 0.0f;
            for (int k = 0; k < len / 2; ++k) {
                const float uRe = re[i + k];
                const float uIm = im[i + k];
                const float vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
                const float vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;

                re[i + k] = uRe + vRe;
                im[i + k] = uIm + vIm;
                re[i + k + len / 2] = uRe - vRe;
                im[i + k + len / 2] = uIm - vIm;

                const float nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}

int main() {
    std::printf("=====================================\n");
    std::printf(" PARITAS FFT: Kotlin vs C++\n");
    std::printf("=====================================\n\n");

    const int n = 2048;
    const int k = 10;

    // Input identik: sinusoid 10 siklus per jendela
    std::vector<float> input(n);
    for (int i = 0; i < n; ++i) {
        input[i] = static_cast<float>(
            std::sin(2.0 * M_PI * k * i / n)
        );
    }

    // ---------- Sisi C++ (FFTPlan) ----------
    FFTPlan plan(n);
    std::vector<Complex> cppOut(n);
    plan.forward(input.data(), cppOut.data());

    // ---------- Sisi Kotlin (algoritma yang sama, ditulis ulang) ----------
    std::vector<float> re(input);
    std::vector<float> im(n, 0.0f);
    kotlinFft(re, im);

    // ---------- Bandingkan spektrum penuh ----------
    std::printf("[1] Perbandingan magnitudo seluruh bin\n");

    float maxDiff = 0.0f;
    float maxMag = 0.0f;
    for (int i = 0; i < n / 2; ++i) {
        const float cppMag = std::abs(cppOut[i]) / (n / 2.0f);
        const float ktMag =
            std::sqrt(re[i] * re[i] + im[i] * im[i]) / (n / 2.0f);

        maxDiff = std::max(maxDiff, std::fabs(cppMag - ktMag));
        maxMag = std::max(maxMag, cppMag);
    }

    std::printf("        selisih maksimum = %.3e (skala 0..%.3f)\n",
                maxDiff, maxMag);

    {
        char buf[96];
        std::snprintf(buf, sizeof(buf),
                      "kedua implementasi sama (selisih < 1e-5)");
        check(maxDiff < 1e-5f, buf);
    }

    // ---------- Bandingkan puncak ----------
    std::printf("\n[2] Puncak spektrum\n");

    auto peakOf = [&](bool useCpp) {
        float best = 0.0f;
        int bestBin = -1;
        for (int i = 1; i < n / 2; ++i) {
            const float mag = useCpp
                ? std::abs(cppOut[i]) / (n / 2.0f)
                : std::sqrt(re[i] * re[i] + im[i] * im[i]) / (n / 2.0f);
            if (mag > best) { best = mag; bestBin = i; }
        }
        return std::pair<int, float>(bestBin, best);
    };

    const auto cppPeak = peakOf(true);
    const auto ktPeak = peakOf(false);

    std::printf("        C++    : bin %d, magnitudo %.4f\n", cppPeak.first, cppPeak.second);
    std::printf("        Kotlin : bin %d, magnitudo %.4f\n", ktPeak.first, ktPeak.second);

    check(cppPeak.first == k && ktPeak.first == k,
          "kedua sisi menemukan puncak di bin yang sama");
    check(std::fabs(cppPeak.second - ktPeak.second) < 1e-5f,
          "magnitudo puncak kedua sisi sama");

    // ---------- Nilai referensi untuk uji Kotlin di CI ----------
    std::printf("\n[3] Nilai referensi (dipakai uji Kotlin di CI)\n");
    std::printf("        bin 0        = %.6f\n", std::abs(cppOut[0]) / (n / 2.0f));
    std::printf("        bin %d (puncak) = %.6f\n", k, cppPeak.second);
    std::printf("        bin 100      = %.6f\n", std::abs(cppOut[100]) / (n / 2.0f));

    std::printf("\n=====================================\n");
    std::printf(" HASIL: %d lulus, %d gagal\n", gPassed, gFailed);
    std::printf("=====================================\n");

    return gFailed == 0 ? 0 : 1;
}
