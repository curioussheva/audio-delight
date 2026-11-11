// scripts/test_audio_file_analyzer.cpp
//
// Harness untuk logika MURNI AudioFileAnalyzer (header-only):
// findCutoffHz + lsbZeroRatio16 + dbfs. Tidak butuh FFmpeg —
// analyzeFile() sendiri (open/seek/decode) hanya bisa diuji di device
// / build GH, karena FFmpegDecoder butuh libav*.
//
// Kompilasi:
//   g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/decoder \
//     scripts/test_audio_file_analyzer.cpp -o /tmp/test_analyzer
//   /tmp/test_analyzer

#include "AudioFileAnalyzer.h"

#include <cmath>
#include <cstdio>
#include <random>
#include <vector>

using namespace pristine::analyzer;

namespace {

int g_pass = 0;
int g_fail = 0;

void check(bool cond, const char* name) {
    if (cond) {
        ++g_pass;
        std::printf("  PASS %s\n", name);
    } else {
        ++g_fail;
        std::printf("  FAIL %s\n", name);
    }
}

bool near(double a, double b, double tol) {
    return std::fabs(a - b) <= tol;
}

// Spektrum sintetis: konten kuat sampai bin `lastContent`, lantai -100 dB
// relatif di atasnya (simulasi dither/noise). fftSize 8192, rate 96000.
std::vector<float> synthMagnitudes(int lastContent, double floorRel = 1e-5) {
    std::vector<float> mag(static_cast<size_t>(kFftSize) / 2, 0.0f);
    for (int b = 1; b <= lastContent; ++b) {
        mag[static_cast<size_t>(b)] = 2048.0f; // ~0 dBFS
    }
    for (int b = lastContent + 1; b < kFftSize / 2; ++b) {
        mag[static_cast<size_t>(b)] = static_cast<float>(2048.0 * floorRel);
    }
    return mag;
}

void testCutoff() {
    std::printf("[1] findCutoffHz\n");
    const double rate = 96000.0;
    const double binHz = rate / kFftSize; // 11.71875 Hz/bin

    // Konten sampai 20 kHz (bin 1706) -> cutoff ~20 kHz.
    auto m20k = synthMagnitudes(1706);
    const double c20k = findCutoffHz(m20k, rate, kFftSize);
    check(near(c20k, 1706 * binHz, binHz),
          "cutoff 20 kHz terukur");
    std::printf("      cutoff=%.1f Hz (harap ~%.1f)\n", c20k, 1706 * binHz);

    // Konten sampai 22,05 kHz (bin 1881, tembok CD) -> cutoff ~22,05 kHz.
    auto m22k = synthMagnitudes(1881);
    const double c22k = findCutoffHz(m22k, rate, kFftSize);
    check(near(c22k, 1881 * binHz, binHz),
          "cutoff 22,05 kHz terukur (tembok CD)");
    std::printf("      cutoff=%.1f Hz (harap ~%.1f)\n", c22k, 1881 * binHz);

    // Lantai -100 dB di atas konten TIDAK boleh terhitung (ambang -60 dB).
    // Kalau cutoff malah nyaris Nyquist (48 kHz), ambang bocor oleh noise.
    check(c20k < 24000.0, "lantai -100 dB tidak terhitung konten");

    // Spektrum nol semua -> 0 (tidak bisa dinilai, bukan "cutoff 0").
    std::vector<float> zeros(static_cast<size_t>(kFftSize) / 2, 0.0f);
    check(findCutoffHz(zeros, rate, kFftSize) == 0.0, "sunyi -> 0");

    // Puncak di bawah kMinPeakMagnitude -> 0.
    auto tiny = synthMagnitudes(1706);
    for (auto& v : tiny) v *= 0.0001f; // puncak 0.2 < 0.5
    check(findCutoffHz(tiny, rate, kFftSize) == 0.0,
          "puncak terlalu kecil -> 0");

    // Input kosong / rate invalid -> 0, bukan crash.
    check(findCutoffHz({}, rate, kFftSize) == 0.0, "magnitudes kosong -> 0");
    check(findCutoffHz(m20k, 0.0, kFftSize) == 0.0, "rate 0 -> 0");
}

void testLsb() {
    std::printf("[2] lsbZeroRatio16\n");

    // Semua sampel di grid 16-bit (kelipatan 1/32768) -> rasio 1.
    std::vector<float> grid;
    for (int i = 0; i < 10000; ++i) {
        grid.push_back(static_cast<float>(i % 2000 - 1000) / 32768.0f);
    }
    check(near(lsbZeroRatio16(grid), 1.0, 1e-9),
          "grid 16-bit -> rasio 1,0");

    // Sampel 24-bit asli (kelipatan 1/2^23, bit bawah acak) -> rasio ~0.
    std::mt19937 rng(12345);
    std::vector<float> real24;
    for (int i = 0; i < 10000; ++i) {
        const int32_t v =
            static_cast<int32_t>(rng()) % (2 * 8388608) - 8388608;
        real24.push_back(static_cast<float>(v) / 8388608.0f);
    }
    const double r24 = lsbZeroRatio16(real24);
    check(r24 < 0.01, "24-bit asli -> rasio ~0");
    std::printf("      rasio 24-bit=%.4f (harap < 0,01)\n", r24);

    // Kosong -> 0, bukan NaN.
    check(lsbZeroRatio16({}) == 0.0, "kosong -> 0");
}

void testDbfs() {
    std::printf("[3] dbfs\n");
    check(near(dbfs(1.0), 0.0, 1e-9), "1,0 -> 0 dB");
    check(near(dbfs(0.5), -6.0206, 1e-3), "0,5 -> -6,02 dB");
    check(dbfs(0.0) == -120.0, "0 -> -120 dB");
    check(dbfs(-1.0) == -120.0, "negatif -> -120 dB");
}

} // namespace

int main() {
    std::printf("== test_audio_file_analyzer ==\n");
    testCutoff();
    testLsb();
    testDbfs();
    std::printf("\n%d PASS, %d FAIL\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
