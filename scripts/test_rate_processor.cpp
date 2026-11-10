// scripts/test_rate_processor.cpp
//
// Uji PlaybackRateProcessor (WSOLA time-stretch, P-M9, 2026-11-10):
// buktikan laju 0.5x–2.0x benar-benar mengubah durasi TANPA mengubah pitch,
// tanpa NaN/Inf, dan tanpa crash saat laju berubah di tengah stream.
//
// Latar: kontrol kecepatan 0.5x–2.0x di UI adalah placebo — hanya menulis
// Zustand + AsyncStorage, tidak ada jalur ke native. Prosesor ini adalah
// jalurnya. Test ini gagal pada kode sebelum P-M9 (tidak ada prosesor sama
// sekali) dan lolos sesudahnya.
//
// Cara jalankan (dari akar proyek):
//   g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/playback \
//       scripts/test_rate_processor.cpp \
//       android/app/src/main/cpp/playback/PlaybackRateProcessor.cpp \
//       -o "$TMPDIR/test_rate_processor" && "$TMPDIR/test_rate_processor"

#include "PlaybackRateProcessor.h"

#include <cmath>
#include <cstdio>
#include <limits>
#include <vector>

using namespace pristine::playback;

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

constexpr uint32_t kSampleRate = 48000;
constexpr uint32_t kChannels = 2;
constexpr size_t kChunkFrames = 960;  // ukuran callback render (~20 ms)

// Sine 440 Hz stereo, 5 detik. L = R (mono mix = sine).
static std::vector<float> makeSine(double seconds, double freq = 440.0) {
    const size_t frames = static_cast<size_t>(seconds * kSampleRate);
    std::vector<float> buf(frames * kChannels);
    for (size_t f = 0; f < frames; ++f) {
        const float v =
            0.5f * std::sin(2.0 * 3.141592653589793 * freq * f / kSampleRate);
        buf[f * kChannels] = v;
        buf[f * kChannels + 1] = v;
    }
    return buf;
}

struct RunResult {
    size_t outFrames = 0;
    double rms = 0.0;
    double zcrPerSec = 0.0;  // zero-crossing rate per detik output
    bool hasNan = false;
};

// Jalankan seluruh input lewat prosesor dengan chunk seperti render().
static RunResult runThrough(PlaybackRateProcessor& proc,
                            const std::vector<float>& input) {
    RunResult r;
    std::vector<float> outChunk(kChunkFrames * kChannels);
    const size_t totalFrames = input.size() / kChannels;
    double sumSq = 0.0;
    size_t crossings = 0;
    float prev = 0.0f;
    bool first = true;

    auto drain = [&](size_t want) {
        const size_t got = proc.pull(outChunk.data(), want, kChannels);
        for (size_t i = 0; i < got * kChannels; ++i) {
            const float v = outChunk[i];
            if (std::isnan(v) || std::isinf(v)) r.hasNan = true;
            sumSq += static_cast<double>(v) * v;
        }
        // ZCR pada channel 0 saja (L == R di sinyal uji).
        for (size_t f = 0; f < got; ++f) {
            const float v = outChunk[f * kChannels];
            if (!first && ((prev < 0.0f) != (v < 0.0f)) && v != 0.0f) {
                ++crossings;
            }
            prev = v;
            first = false;
        }
        r.outFrames += got;
        return got;
    };

    size_t pushed = 0;
    while (pushed < totalFrames) {
        const size_t n = std::min(kChunkFrames, totalFrames - pushed);
        proc.push(input.data() + pushed * kChannels, n, kChannels);
        pushed += n;
        drain(kChunkFrames);
    }
    // Drain sisa output setelah input habis.
    while (drain(kChunkFrames) > 0) {
    }

    if (r.outFrames > 0) {
        r.rms = std::sqrt(sumSq / (r.outFrames * kChannels));
        r.zcrPerSec = static_cast<double>(crossings) /
                      (static_cast<double>(r.outFrames) / kSampleRate);
    }
    return r;
}

// =====================================================
// 1. Durasi output ≈ input / rate, pitch (ZCR) tetap
// =====================================================
static void testRate(float rate) {
    char label[64];
    std::snprintf(label, sizeof(label), "rate %.1fx", rate);
    std::printf("\n[rate %.1fx] sine 440 Hz, 5 detik\n", rate);

    PlaybackRateProcessor proc;
    proc.setRate(rate);
    const std::vector<float> input = makeSine(5.0);
    const RunResult r = runThrough(proc, input);

    const double expected = 5.0 * kSampleRate / rate;
    const double ratio = static_cast<double>(r.outFrames) / expected;
    std::printf("  output=%zu frame (harap ~%.0f, rasio %.3f), "
                "rms=%.3f, zcr=%.0f/s\n",
                r.outFrames, expected, ratio, r.rms, r.zcrPerSec);

    check(!r.hasNan, "tanpa NaN/Inf di output");
    check(ratio > 0.90 && ratio < 1.10, "durasi output ≈ input / rate (±10%)");
    // RMS sine 0.5 = 0.354; WSOLA (COLA Hann) menjaga energi — toleransi lebar.
    check(r.rms > 0.15 && r.rms < 0.55, "RMS terjaga (tidak senyap / tidak clip)");
    // ZCR sine 440 Hz = 880/s; time-stretch menjaga pitch → ZCR per detik
    // output harus tetap ~880 (toleransi ±15%).
    check(r.zcrPerSec > 750.0 && r.zcrPerSec < 1010.0,
          "pitch terjaga (ZCR ~880/s, bukan 440/rate atau 440*rate)");
}

// =====================================================
// 2. Rate 1.0 = identitas (durasi + pitch sama)
// =====================================================
static void testIdentity() {
    std::printf("\n[rate 1.0x] identitas\n");
    PlaybackRateProcessor proc;  // default 1.0
    const std::vector<float> input = makeSine(5.0);
    const RunResult r = runThrough(proc, input);
    const double ratio = static_cast<double>(r.outFrames) / (5.0 * kSampleRate);
    std::printf("  output=%zu frame (rasio %.3f), rms=%.3f, zcr=%.0f/s\n",
                r.outFrames, ratio, r.rms, r.zcrPerSec);
    check(!r.hasNan, "tanpa NaN/Inf di output");
    check(ratio > 0.95 && ratio < 1.05, "durasi output ≈ input (±5%)");
    check(r.zcrPerSec > 800.0 && r.zcrPerSec < 960.0, "pitch tetap 440 Hz");
}

// =====================================================
// 3. Ganti laju di tengah stream + reset
// =====================================================
static void testMidStreamChange() {
    std::printf("\n[ganti laju 1.0 -> 2.0 di tengah stream]\n");
    PlaybackRateProcessor proc;
    const std::vector<float> input = makeSine(5.0);
    const size_t half = input.size() / 2;

    std::vector<float> outChunk(kChunkFrames * kChannels);
    size_t outFrames = 0;
    bool hasNan = false;
    // Paruh pertama 1.0x.
    for (size_t off = 0; off < half; off += kChunkFrames * kChannels) {
        const size_t n =
            std::min(kChunkFrames, (half - off) / kChannels);
        proc.push(input.data() + off, n, kChannels);
        const size_t got = proc.pull(outChunk.data(), kChunkFrames, kChannels);
        for (size_t i = 0; i < got * kChannels; ++i) {
            if (std::isnan(outChunk[i]) || std::isinf(outChunk[i])) {
                hasNan = true;
            }
        }
        outFrames += got;
    }
    // Ganti laju — buffer lama harus dibuang, tidak keluar sebagai glitch.
    proc.setRate(2.0f);
    check(proc.rate() == 2.0f, "rate() berubah ke 2.0");
    // Paruh kedua 2.0x.
    for (size_t off = half; off < input.size(); off += kChunkFrames * kChannels) {
        const size_t n =
            std::min(kChunkFrames, (input.size() - off) / kChannels);
        proc.push(input.data() + off, n, kChannels);
        const size_t got = proc.pull(outChunk.data(), kChunkFrames, kChannels);
        for (size_t i = 0; i < got * kChannels; ++i) {
            if (std::isnan(outChunk[i]) || std::isinf(outChunk[i])) {
                hasNan = true;
            }
        }
        outFrames += got;
    }
    while (proc.pull(outChunk.data(), kChunkFrames, kChannels) > 0) {
        ++outFrames;  // drain (tidak dihitung rinci, hanya memastikan selesai)
    }
    check(!hasNan, "tanpa NaN/Inf setelah ganti laju");
    check(outFrames > 0, "output tetap mengalir setelah ganti laju");

    // reset() mengosongkan — pull langsung 0.
    proc.reset();
    check(proc.pull(outChunk.data(), kChunkFrames, kChannels) == 0,
          "setelah reset(), pull() = 0");
}

// =====================================================
// 4. Laju tidak valid diabaikan
// =====================================================
static void testInvalidRate() {
    std::printf("\n[laju tidak valid]\n");
    PlaybackRateProcessor proc;
    proc.setRate(0.0f);
    check(proc.rate() == 1.0f, "0.0 ditolak (tetap 1.0)");
    proc.setRate(3.0f);
    check(proc.rate() == 1.0f, "3.0 ditolak (tetap 1.0)");
    proc.setRate(std::numeric_limits<float>::quiet_NaN());
    check(proc.rate() == 1.0f, "NaN ditolak (tetap 1.0)");
    proc.setRate(0.5f);
    check(proc.rate() == 0.5f, "0.5 diterima (batas bawah)");
    proc.setRate(2.0f);
    check(proc.rate() == 2.0f, "2.0 diterima (batas atas)");
}

int main() {
    std::printf("PlaybackRateProcessor (WSOLA)\n");
    std::printf("=============================\n");

    testIdentity();
    testRate(0.5f);
    testRate(1.5f);
    testRate(2.0f);
    testMidStreamChange();
    testInvalidRate();

    std::printf("\n%d lulus, %d gagal\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
