// =====================================================
// scripts/test_crossfade.cpp
// =====================================================
//
// Uji FadeEngine untuk fitur crossfade (2026-11-20):
//   [1] secondsToFrames: 0 dtk -> 0, 5 dtk @48 kHz -> 240000,
//       clamp 12 dtk (20 dtk -> 12 dtk), negatif/NaN -> 0,
//       rate 0 -> 0, tanpa overflow uint32 (768 kHz * 12 dtk).
//   [2] Kurva S-curve untuk fade-out crossfade: gain awal 1,
//       gain akhir 0, monoton turun; fade-in: 0 -> 1, monoton naik.
//   [3] FadeEngine::crossfade() (sebelumnya dead code — 0 pemanggil
//       di seluruh cpp/): mix dua buffer = out*gOut + in*gIn;
//       di tengah kurva Linear, output = rata-rata kedua buffer.
//   [4] Kurva durasi 0/1 frame = identitas (tanpa fade, tanpa NaN).
//   [5] Durasi crossfade 12 dtk @48 kHz = 576000 frame (batas atas
//       alokasi kurva yang dibangun loadTrack()).
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_crossfade.cpp \
//     android/app/src/main/cpp/playback/FadeEngine.cpp \
//     -o "$TMPDIR/test_crossfade" && "$TMPDIR/test_crossfade"

#include <cmath>
#include <cstdio>
#include <cstdint>
#include <vector>

#include "playback/FadeEngine.h"

using pristine::playback::FadeCurve;
using pristine::playback::FadeEngine;

static int g_failures = 0;

#define CHECK(cond)                                                     \
    do {                                                                \
        if (!(cond)) {                                                  \
            std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
            ++g_failures;                                               \
        }                                                               \
    } while (0)

static bool near(float a, float b, float eps = 1e-5f) {
    return std::fabs(a - b) <= eps;
}

int main() {
    // ---- [1] secondsToFrames ----
    CHECK(FadeEngine::secondsToFrames(48000, 0.0f) == 0);
    CHECK(FadeEngine::secondsToFrames(48000, 5.0f) == 240000);
    CHECK(FadeEngine::secondsToFrames(44100, 1.0f) == 44100);
    CHECK(FadeEngine::secondsToFrames(48000, 12.0f) == 576000);
    // Clamp atas: 20 dtk -> 12 dtk (batas setting).
    CHECK(FadeEngine::secondsToFrames(48000, 20.0f) == 576000);
    // Negatif / NaN / rate 0 -> 0 frame (tanpa fade).
    CHECK(FadeEngine::secondsToFrames(48000, -3.0f) == 0);
    CHECK(FadeEngine::secondsToFrames(48000, NAN) == 0);
    CHECK(FadeEngine::secondsToFrames(0, 5.0f) == 0);
    // Tanpa overflow uint32: 768 kHz * 12 dtk = 9216000 frame.
    CHECK(FadeEngine::secondsToFrames(768000, 12.0f) == 9216000);
    // Setengah detik (langkah slider 0,5 dtk) @48 kHz.
    CHECK(FadeEngine::secondsToFrames(48000, 0.5f) == 24000);

    // ---- [2] Kurva S-curve fade-out/in crossfade 5 dtk ----
    FadeEngine engine;
    const uint32_t frames =
        FadeEngine::secondsToFrames(48000, 5.0f);
    engine.generateCurve(FadeCurve::SCurve, frames);
    CHECK(engine.durationFrames() == 240000);
    CHECK(!engine.empty());
    CHECK(near(engine.fadeOutGainAt(0), 1.0f));
    CHECK(near(engine.fadeOutGainAt(frames - 1), 0.0f));
    CHECK(near(engine.fadeInGainAt(0), 0.0f));
    CHECK(near(engine.fadeInGainAt(frames - 1), 1.0f));
    // Monoton: fade-out turun, fade-in naik (cek tiap 1000 frame).
    {
        float prevOut = 2.0f, prevIn = -1.0f;
        bool outMono = true, inMono = true;
        for (uint32_t f = 0; f < frames; f += 1000) {
            const float o = engine.fadeOutGainAt(f);
            const float i = engine.fadeInGainAt(f);
            if (o > prevOut + 1e-6f) outMono = false;
            if (i < prevIn - 1e-6f) inMono = false;
            // Komplemen S-curve: in + out = 1 di semua titik.
            if (!near(o + i, 1.0f)) {
                std::printf("FAIL komplemen f=%u: out=%.6f in=%.6f\n",
                            f, o, i);
                ++g_failures;
            }
            prevOut = o;
            prevIn = i;
        }
        CHECK(outMono);
        CHECK(inMono);
    }
    // Tengah kurva S-curve: gain = 0,5.
    CHECK(near(engine.fadeOutGainAt(frames / 2), 0.5f, 1e-3f));
    CHECK(near(engine.fadeInGainAt(frames / 2), 0.5f, 1e-3f));

    // ---- [3] crossfade() mix dua buffer (kurva Linear, 4 frame) ----
    {
        FadeEngine lin;
        lin.generateCurve(FadeCurve::Linear, 4);
        // fadeOut: 1, 2/3, 1/3, 0 ; fadeIn: 0, 1/3, 2/3, 1.
        const float outBuf[8] = {10, 10, 10, 10, 10, 10, 10, 10};
        const float inBuf[8] = {20, 20, 20, 20, 20, 20, 20, 20};
        float mixed[8] = {};
        lin.crossfade(outBuf, inBuf, mixed, 4, 2);
        CHECK(near(mixed[0], 10.0f));  // frame 0: 10*1 + 20*0
        CHECK(near(mixed[2], 10.0f * (2.0f / 3.0f) +
                                20.0f * (1.0f / 3.0f)));
        CHECK(near(mixed[4], 10.0f * (1.0f / 3.0f) +
                                20.0f * (2.0f / 3.0f)));
        CHECK(near(mixed[6], 20.0f));  // frame 3: 10*0 + 20*1
    }
    // crossfade() tanpa kurva (empty) tidak menulis apa-apa — guard
    // anti-clipping: tanpa kurva kedua gain = 1, output = jumlah.
    {
        FadeEngine empty;
        const float outBuf[2] = {10, 10};
        const float inBuf[2] = {20, 20};
        float mixed[2] = {7, 7};
        empty.crossfade(outBuf, inBuf, mixed, 1, 2);
        CHECK(near(mixed[0], 7.0f));
        CHECK(near(mixed[1], 7.0f));
    }

    // ---- [4] Durasi 0/1 frame = identitas, tanpa NaN ----
    {
        FadeEngine tiny;
        tiny.generateCurve(FadeCurve::SCurve, 1);
        CHECK(near(tiny.fadeInGainAt(0), 1.0f));
        CHECK(near(tiny.fadeOutGainAt(0), 1.0f));
        float buf[2] = {3.0f, -3.0f};
        tiny.applyFadeIn(buf, 1, 2);
        CHECK(near(buf[0], 3.0f));
        CHECK(near(buf[1], -3.0f));
    }

    // ---- [5] Batas atas alokasi kurva: 12 dtk @48 kHz ----
    {
        FadeEngine big;
        const uint32_t f12 =
            FadeEngine::secondsToFrames(48000, 12.0f);
        CHECK(f12 == 576000);
        big.generateCurve(FadeCurve::SCurve, f12);
        CHECK(big.durationFrames() == 576000);
        CHECK(near(big.fadeOutGainAt(0), 1.0f));
        CHECK(near(big.fadeOutGainAt(f12 - 1), 0.0f));
    }

    if (g_failures == 0) {
        std::printf("test_crossfade: SEMUA LULUS\n");
        return 0;
    }
    std::printf("test_crossfade: %d KEGAGALAN\n", g_failures);
    return 1;
}
