// scripts/test_fft.cpp
//
// Uji FFTPlan: buktikan ia benar-benar melakukan transformasi, bukan menyalin.
//
// Cara jalankan (dari akar proyek pristine):
//   g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/fft \
//       scripts/test_fft.cpp android/app/src/main/cpp/fft/FFTPlan.cpp \
//       -o "$TMPDIR/test_fft" && "$TMPDIR/test_fft"

#include "FFTPlan.h"

#include <cmath>
#include <cstdio>
#include <vector>

using namespace pristine;

static int gPassed = 0;
static int gFailed = 0;

static void check(bool ok, const char* what) {
    if (ok) {
        ++gPassed;
        std::printf("  PASS  %s\n", what);
    } else {
        ++gFailed;
        std::printf("  FAIL  %s\n", what);
    }
}

static bool nearly(float a, float b, float tol = 1e-4f) {
    return std::fabs(a - b) <= tol;
}

// =====================================================
// 1. DC: input konstan -> semua energi di bin 0
// =====================================================
static void testDC() {
    std::printf("\n[1] Sinyal DC (konstan 1.0)\n");

    const int n = 64;
    FFTPlan plan(n);

    std::vector<float> in(n, 1.0f);
    std::vector<Complex> out(n);

    plan.forward(in.data(), out.data());

    // X[0] = jumlah semua sampel = n
    check(nearly(out[0].real(), static_cast<float>(n), 1e-2f),
          "bin 0 = n (energi total)");

    // Sisanya harus nol
    float maxOther = 0.0f;
    for (int i = 1; i < n; ++i) {
        maxOther = std::max(maxOther, std::abs(out[i]));
    }
    check(maxOther < 1e-2f, "bin lain ~ 0");
}

// =====================================================
// 2. Sinusoid murni -> puncak di bin yang benar
// =====================================================
static void testSine() {
    std::printf("\n[2] Sinusoid 1 periode penuh di n=64\n");

    const int n = 64;
    const int k = 1; // 1 siklus per jendela

    FFTPlan plan(n);

    std::vector<float> in(n);
    for (int i = 0; i < n; ++i) {
        in[i] = std::sin(2.0f * static_cast<float>(M_PI) * k * i / n);
    }

    std::vector<Complex> out(n);
    plan.forward(in.data(), out.data());

    // Cari bin dengan magnitude terbesar (abaikan DC, sinyal ini murni AC)
    float best = 0.0f;
    int bestBin = -1;
    for (int i = 1; i < n / 2; ++i) {
        const float mag = std::abs(out[i]);
        if (mag > best) {
            best = mag;
            bestBin = i;
        }
    }

    check(bestBin == k, "puncak ada di bin 1");

    // Magnitudo puncak untuk sinusoid amplitudo 1 = n/2
    check(nearly(best, static_cast<float>(n) / 2.0f, 1.0f),
          "magnitudo puncak = n/2");

    // DC harus ~0 (sinyal rata-rata nol)
    check(std::abs(out[0]) < 1e-2f, "DC ~ 0");
}

// =====================================================
// 3. Parseval: energi domain waktu == domain frekuensi
// =====================================================
static void testParseval() {
    std::printf("\n[3] Teorema Parseval\n");

    const int n = 128;
    FFTPlan plan(n);

    std::vector<float> in(n);
    for (int i = 0; i < n; ++i) {
        in[i] = 0.7f * std::sin(0.3f * i) + 0.2f * std::cos(1.1f * i);
    }

    std::vector<Complex> out(n);
    plan.forward(in.data(), out.data());

    double energyTime = 0.0;
    for (int i = 0; i < n; ++i) {
        energyTime += static_cast<double>(in[i]) * in[i];
    }

    double energyFreq = 0.0;
    for (int i = 0; i < n; ++i) {
        energyFreq += std::norm(out[i]);
    }
    energyFreq /= n; // Parseval: sum|x|^2 = (1/n) sum|X|^2

    const double relErr =
        std::fabs(energyTime - energyFreq) / std::max(energyTime, 1e-9);

    std::printf("        waktu=%.6f  frekuensi=%.6f  relErr=%.2e\n",
                energyTime, energyFreq, relErr);
    check(relErr < 1e-4, "energi kedua domain sama (relErr < 1e-4)");
}

// =====================================================
// 4. Round-trip: forward lalu inverse -> kembali ke asal
// =====================================================
static void testRoundTrip() {
    std::printf("\n[4] Round-trip forward -> inverse\n");

    const int n = 256;
    FFTPlan plan(n);

    std::vector<float> in(n);
    for (int i = 0; i < n; ++i) {
        in[i] = std::sin(0.1f * i) + 0.3f * std::cos(0.7f * i) + 0.05f * i / n;
    }

    std::vector<Complex> freq(n);
    std::vector<float> back(n);

    plan.forward(in.data(), freq.data());
    plan.inverse(freq.data(), back.data());

    float maxErr = 0.0f;
    for (int i = 0; i < n; ++i) {
        maxErr = std::max(maxErr, std::fabs(back[i] - in[i]));
    }

    std::printf("        error maksimum = %.2e\n", maxErr);
    check(maxErr < 1e-4f, "sinyal kembali utuh (error < 1e-4)");
}

// =====================================================
// 5. Ukuran non-pangkat-dua ditolak dengan jujur
// =====================================================
static void testInvalidSize() {
    std::printf("\n[5] Ukuran bukan pangkat dua\n");

    FFTPlan plan(100);
    check(!plan.isValid(), "plan(100) ditandai tidak valid");
    check(plan.getSize() == 0, "getSize() = 0 saat tidak valid");

    // forward() pada plan tidak valid tidak boleh crash
    std::vector<float> in(100, 1.0f);
    std::vector<Complex> out(100);
    plan.forward(in.data(), out.data());
    check(true, "forward() pada plan tidak valid tidak crash");
}

// =====================================================
// 6. Berbagai ukuran pangkat dua
// =====================================================
static void testSizes() {
    std::printf("\n[6] Berbagai ukuran pangkat dua\n");

    const int sizes[] = {2, 4, 8, 16, 256, 1024, 2048};

    for (int n : sizes) {
        FFTPlan plan(n);

        // Sinyal DC: X[0] harus = n, sisanya 0
        std::vector<float> in(n, 1.0f);
        std::vector<Complex> out(n);
        plan.forward(in.data(), out.data());

        float maxOther = 0.0f;
        for (int i = 1; i < n; ++i) {
            maxOther = std::max(maxOther, std::abs(out[i]));
        }

        char label[64];
        std::snprintf(label, sizeof(label), "n=%d: bin0=%.1f, sisanya<0.01", n,
                      static_cast<double>(out[0].real()));
        check(nearly(out[0].real(), static_cast<float>(n), 0.05f) &&
                  maxOther < 0.01f,
              label);
    }
}

// =====================================================
// 7. FFT size 2048 (yang dipakai visualizer) selesai cepat
// =====================================================
static void testRealisticSize() {
    std::printf("\n[7] Ukuran nyata visualizer (n=2048)\n");

    const int n = 2048;
    FFTPlan plan(n);
    check(plan.isValid(), "n=2048 valid");

    std::vector<float> in(n);
    for (int i = 0; i < n; ++i) {
        in[i] = std::sin(2.0f * static_cast<float>(M_PI) * 10 * i / n);
    }

    std::vector<Complex> out(n);
    plan.forward(in.data(), out.data());

    float best = 0.0f;
    int bestBin = -1;
    for (int i = 1; i < n / 2; ++i) {
        const float mag = std::abs(out[i]);
        if (mag > best) {
            best = mag;
            bestBin = i;
        }
    }

    check(bestBin == 10, "puncak di bin 10 (sesuai input)");
    check(nearly(best, static_cast<float>(n) / 2.0f, 2.0f),
          "magnitudo puncak = n/2");
}

int main() {
    std::printf("=====================================\n");
    std::printf(" TEST FFTPlan (radix-2)\n");
    std::printf("=====================================\n");

    testDC();
    testSine();
    testParseval();
    testRoundTrip();
    testInvalidSize();
    testSizes();
    testRealisticSize();

    std::printf("\n=====================================\n");
    std::printf(" HASIL: %d lulus, %d gagal\n", gPassed, gFailed);
    std::printf("=====================================\n");

    return gFailed == 0 ? 0 : 1;
}
