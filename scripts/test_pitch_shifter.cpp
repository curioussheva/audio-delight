// scripts/test_pitch_shifter.cpp
//
// Uji PitchShifter (phase vocoder, Fase R, 2026-11-11): buktikan pitch
// berubah TANPA tempo berubah (frame masuk = frame keluar), frekuensi
// keluaran sesuai rasio, citra stereo utuh, tanpa NaN/Inf.
//
// Latar: tidak ada pitch shifter di codebase (grep "pitch" hanya muncul di
// komentar WSOLA — WSOLA justru MEMPERTAHANKAN pitch). Retune A=432 butuh
// pitch shift murni. Test ini gagal sebelum Fase R (tidak ada kelasnya)
// dan lolos sesudahnya.
//
// Cara jalankan (dari akar proyek):
//   g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/playback \
//       -Iandroid/app/src/main/cpp \
//       scripts/test_pitch_shifter.cpp \
//       android/app/src/main/cpp/playback/PitchShifter.cpp \
//       android/app/src/main/cpp/fft/FFTPlan.cpp \
//       -o /tmp/test_pitch_shifter && /tmp/test_pitch_shifter

#include "PitchShifter.h"

#include <cmath>
#include <cstdio>
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
constexpr float kPi = 3.14159265358979323846f;

// Dorong seluruh input lewat prosesor (chunk 512 frame, seperti render),
// lalu tarik sampai kering (flush dengan nol supaya sisa jendela keluar).
static std::vector<float> runThrough(PitchShifter& ps,
                                     const std::vector<float>& in,
                                     uint32_t channels) {
    std::vector<float> out;
    std::vector<float> buf(4096 * channels);
    const size_t frames = in.size() / channels;
    size_t pushed = 0;
    while (pushed < frames) {
        const size_t n = std::min<size_t>(512, frames - pushed);
        ps.push(in.data() + pushed * channels, n, channels);
        pushed += n;
        const size_t got = ps.pull(buf.data(), 4096, channels);
        out.insert(out.end(), buf.begin(), buf.begin() + got * channels);
    }
    // Flush: dorong nol supaya sisa input (< 1 jendela) ikut diproses.
    std::vector<float> zeros(8192 * channels, 0.0f);
    ps.push(zeros.data(), 8192, channels);
    for (;;) {
        const size_t got = ps.pull(buf.data(), 4096, channels);
        if (got == 0) break;
        out.insert(out.end(), buf.begin(), buf.begin() + got * channels);
    }
    return out;
}

// Frekuensi (Hz) via zero-crossing di jendela [t0, t1) detik, channel 0.
static double measureFreq(const std::vector<float>& audio, uint32_t channels,
                          double t0, double t1) {
    const size_t f0 = static_cast<size_t>(t0 * kSampleRate);
    const size_t f1 = static_cast<size_t>(t1 * kSampleRate);
    size_t crossings = 0;
    for (size_t f = f0 + 1; f < f1 && f * channels < audio.size(); ++f) {
        const float a = audio[(f - 1) * channels];
        const float b = audio[f * channels];
        if ((a < 0.0f && b >= 0.0f) || (a >= 0.0f && b < 0.0f)) ++crossings;
    }
    return crossings / 2.0 / (t1 - t0);
}

static double rms(const std::vector<float>& audio, uint32_t channels,
                  double t0, double t1) {
    const size_t f0 = static_cast<size_t>(t0 * kSampleRate);
    const size_t f1 = static_cast<size_t>(t1 * kSampleRate);
    double sum = 0.0;
    size_t n = 0;
    for (size_t f = f0; f < f1 && f * channels < audio.size(); ++f) {
        const float v = audio[f * channels];
        sum += v * v;
        ++n;
    }
    return n ? std::sqrt(sum / n) : 0.0;
}

static std::vector<float> makeSine(double freqHz, double seconds,
                                   uint32_t channels, int delayR = 0) {
    const size_t frames = static_cast<size_t>(seconds * kSampleRate);
    std::vector<float> out(frames * channels, 0.0f);
    for (size_t f = 0; f < frames; ++f) {
        const float s = std::sin(2.0f * kPi * static_cast<float>(freqHz) *
                                 static_cast<float>(f) / kSampleRate);
        out[f * channels] = s;
        if (channels == 2) {
            const int rf = static_cast<int>(f) - delayR;
            out[f * channels + 1] =
                rf >= 0 ? std::sin(2.0f * kPi * static_cast<float>(freqHz) *
                                   static_cast<float>(rf) / kSampleRate)
                        : 0.0f;
        }
    }
    return out;
}

int main() {
    std::printf("PitchShifter (phase vocoder, Fase R)\n");

    // T1: 440 Hz -> 432 Hz (rasio 432/440). Ini tes utamanya.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        const auto in = makeSine(440.0, 2.0, 2);
        const auto out = runThrough(ps, in, 2);
        const double f = measureFreq(out, 2, 0.5, 1.5);
        std::printf("  T1 freq terukur: %.2f Hz (harap 432)\n", f);
        check(f > 431.0 && f < 433.0, "T1 440 Hz -> 432 Hz (+-1 Hz)");
    }

    // T2: rasio 1.0 merekonstruksi input (frekuensi + RMS).
    {
        PitchShifter ps;
        ps.setRatio(1.0f);
        const auto in = makeSine(440.0, 2.0, 2);
        const auto out = runThrough(ps, in, 2);
        const double f = measureFreq(out, 2, 0.5, 1.5);
        const double rIn = rms(in, 2, 0.5, 1.5);
        const double rOut = rms(out, 2, 0.5, 1.5);
        std::printf("  T2 freq %.2f Hz, RMS in %.4f out %.4f\n", f, rIn, rOut);
        check(f > 439.0 && f < 441.0, "T2 rasio 1.0: frekuensi tetap 440");
        check(rOut / rIn > 0.95 && rOut / rIn < 1.05,
              "T2 rasio 1.0: RMS tetap (+-5%)");
    }

    // T3: frame-count preserving dalam steady state. Produksi terkuantisasi
    // per hop (512 frame): satu dorongan 48000 frame = 93,75 hop, jadi
    // yield per dorongan berayun 47616 (93 hop) / 48128 (94 hop) — yang
    // diuji adalah TOTAL kumulatif (rata-rata 1:1) + lag pipeline terbatas.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        const auto in = makeSine(440.0, 5.0, 2);  // 240000 frame
        std::vector<float> buf(8192 * 2);
        size_t totalOut = 0;
        size_t yields[5] = {0, 0, 0, 0, 0};
        for (int part = 0; part < 5; ++part) {
            ps.push(in.data() + part * 48000 * 2, 48000, 2);
            size_t got = 0;
            for (;;) {
                const size_t n = ps.pull(buf.data(), 8192, 2);
                if (n == 0) break;
                got += n;
            }
            yields[part] = got;
            totalOut += got;
        }
        const size_t steadyTotal =
            yields[1] + yields[2] + yields[3] + yields[4];
        std::printf("  T3 yields: %zu %zu %zu %zu %zu, steady total %zu "
                    "(harap 192000+-512), lag %zu\n",
                    yields[0], yields[1], yields[2], yields[3], yields[4],
                    steadyTotal, 240000 - totalOut);
        check(steadyTotal >= 192000 - 512 && steadyTotal <= 192000 + 512,
              "T3 steady state: 4 detik masuk = 4 detik keluar (+-512)");
        check(240000 - totalOut >= 1500 && 240000 - totalOut < 6000,
              "T3 lag pipeline terbatas (1500..6000 frame)");
    }

    // T4: diam -> diam.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        std::vector<float> zeros(8192 * 2, 0.0f);
        const auto out = runThrough(ps, zeros, 2);
        float maxAbs = 0.0f;
        for (float v : out) maxAbs = std::max(maxAbs, std::fabs(v));
        std::printf("  T4 maxAbs diam: %.2e\n", maxAbs);
        check(maxAbs < 1e-6f, "T4 diam -> diam");
    }

    // T5: noise — tanpa NaN/Inf, magnitudo waras.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        std::vector<float> noise(48000 * 2);
        uint32_t s = 12345;
        for (float& v : noise) {
            s = s * 1664525u + 1013904223u;
            v = (static_cast<float>((s >> 9) & 0x7FFFFF) / 0x7FFFFF - 0.5f) *
                1.6f;
        }
        const auto out = runThrough(ps, noise, 2);
        bool finite = true;
        float maxAbs = 0.0f;
        for (float v : out) {
            if (!std::isfinite(v)) finite = false;
            maxAbs = std::max(maxAbs, std::fabs(v));
        }
        std::printf("  T5 noise: finite=%d maxAbs=%.3f\n", (int)finite, maxAbs);
        check(finite && maxAbs < 2.0f, "T5 noise: finite, maxAbs < 2.0");
    }

    // T6: citra stereo utuh — R tertinggal 10 sampel dari L sebelum dan
    // sesudah shift (korelasi silang, jendela steady-state).
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        const auto in = makeSine(440.0, 2.0, 2, 10);
        const auto out = runThrough(ps, in, 2);
        int bestLag = 0;
        double bestCorr = -1e30;
        const size_t f0 = static_cast<size_t>(0.5 * kSampleRate);
        const size_t f1 = static_cast<size_t>(1.5 * kSampleRate);
        for (int lag = -20; lag <= 20; ++lag) {
            double c = 0.0;
            for (size_t f = f0; f < f1; ++f) {
                const int rf = static_cast<int>(f) - lag;
                if (rf < 0) continue;
                c += out[f * 2] * out[static_cast<size_t>(rf) * 2 + 1];
            }
            if (c > bestCorr) {
                bestCorr = c;
                bestLag = lag;
            }
        }
        std::printf("  T6 lag korelasi puncak: %d (harap -10)\n", bestLag);
        check(bestLag >= -11 && bestLag <= -9,
              "T6 stereo: delay R 10 sampel dipertahankan");
    }

    // T7: oktaf naik — mekanisme berskala, bukan kebetulan di 0.98.
    {
        PitchShifter ps;
        ps.setRatio(2.0f);
        const auto in = makeSine(440.0, 2.0, 2);
        const auto out = runThrough(ps, in, 2);
        const double f = measureFreq(out, 2, 0.5, 1.5);
        std::printf("  T7 freq terukur: %.2f Hz (harap 880)\n", f);
        check(f > 875.0 && f < 885.0, "T7 440 Hz -> 880 Hz (+-5 Hz)");
    }

    // T8: RMS dipertahankan pada rasio retune (tanpa penguatan/pelemahan).
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        const auto in = makeSine(440.0, 2.0, 2);
        const auto out = runThrough(ps, in, 2);
        const double rIn = rms(in, 2, 0.5, 1.5);
        const double rOut = rms(out, 2, 0.5, 1.5);
        std::printf("  T8 RMS in %.4f out %.4f (rasio %.3f)\n", rIn, rOut,
                    rOut / rIn);
        check(rOut / rIn > 0.85 && rOut / rIn < 1.15,
              "T8 RMS dipertahankan (+-15%)");
    }

    // T9: reset() membersihkan state — pull langsung 0 sesudah reset.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        const auto in = makeSine(440.0, 1.0, 2);
        std::vector<float> buf(4096 * 2);
        ps.push(in.data(), 4096, 2);
        (void)ps.pull(buf.data(), 4096, 2);
        ps.reset();
        const size_t got = ps.pull(buf.data(), 4096, 2);
        check(got == 0, "T9 reset: pull 0 sesudah reset");
    }

    // T10: rasio tidak valid diabaikan.
    {
        PitchShifter ps;
        ps.setRatio(432.0f / 440.0f);
        ps.setRatio(0.0f);
        ps.setRatio(std::nanf(""));
        ps.setRatio(5.0f);
        check(std::fabs(ps.ratio() - 432.0f / 440.0f) < 1e-6f,
              "T10 rasio 0/NaN/5.0 diabaikan");
    }

    std::printf("Hasil: %d PASS, %d FAIL\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
