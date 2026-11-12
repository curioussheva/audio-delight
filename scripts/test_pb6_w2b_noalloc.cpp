// scripts/test_pb6_w2b_noalloc.cpp
//
// Uji PB6-W2B (2026-11-12): pre-alokasi buffer audio thread — buktikan
// push()/pull() PlaybackRateProcessor (WSOLA) dan PitchShifter (phase
// vocoder) TIDAK mengalokasi sama sekali dalam steady state, supaya
// bad_alloc di noexcept tidak pernah bisa men-terminate render().
//
// Latar: resize() rateScratch_ di render(), insert()/resize()/push_back()
// vector streaming WSOLA + PitchShifter semuanya jalan di audio thread
// (noexcept). Fix-nya: pre-alokasi sekali di ctor/initialize() (bukan
// audio thread) + guard di render(). Test ini menghitung alokasi heap
// lewat override global operator new selama fase streaming — angka 0
// berarti tidak ada pertumbuhan vector di jalur audio.
//
// Cara jalankan (dari akar proyek):
//   g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/playback \
//       -Iandroid/app/src/main/cpp \
//       scripts/test_pb6_w2b_noalloc.cpp \
//       android/app/src/main/cpp/playback/PlaybackRateProcessor.cpp \
//       android/app/src/main/cpp/playback/PitchShifter.cpp \
//       android/app/src/main/cpp/fft/FFTPlan.cpp \
//       -o /tmp/test_pb6_w2b_noalloc && /tmp/test_pb6_w2b_noalloc
//
// Cakupan: laju 0.5x/2.0x dan rasio pitch 0.5/2.0 (ujung rentang), callback
// 1920 frame (kMaxFramesPerCallback) dan 3840 frame (burst maks Oboe
// @192 kHz, C-C2) — termasuk ganti laju/rasio di tengah stream (reset()
// harus mempertahankan kapasitas). 3840 frame @2.0x kini MUAT di guard
// (16448), bukan dibisukan seperti di guard 7744 lama. Envelope WSOLA
// meniru guard render(): push dilewati bila inputSamples > 16448
// (callback itu dibisukan render). PlaybackController::render() sendiri
// TIDAK diuji di sini (butuh android/log.h + FFmpegDecoder + PCMQueue) —
// verifikasi guard + assign 16448 butuh build GH / device.

#include "PlaybackRateProcessor.h"
#include "PitchShifter.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <vector>

using namespace pristine::playback;

// ---- penghitung alokasi heap (override global operator new) -------------
// Satu counter, tanpa alokasi di jalurnya sendiri (__atomic built-in).
static size_t gAllocCount = 0;

void* operator new(std::size_t n) {
    __atomic_add_fetch(&gAllocCount, 1, __ATOMIC_RELAXED);
    void* p = std::malloc(n ? n : 1);
    if (!p) throw std::bad_alloc();
    return p;
}
void* operator new[](std::size_t n) {
    __atomic_add_fetch(&gAllocCount, 1, __ATOMIC_RELAXED);
    void* p = std::malloc(n ? n : 1);
    if (!p) throw std::bad_alloc();
    return p;
}
void* operator new(std::size_t n, const std::nothrow_t&) noexcept {
    __atomic_add_fetch(&gAllocCount, 1, __ATOMIC_RELAXED);
    return std::malloc(n ? n : 1);
}
void* operator new[](std::size_t n, const std::nothrow_t&) noexcept {
    __atomic_add_fetch(&gAllocCount, 1, __ATOMIC_RELAXED);
    return std::malloc(n ? n : 1);
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete[](void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
void operator delete[](void* p, std::size_t) noexcept { std::free(p); }

static size_t allocCount() {
    return __atomic_load_n(&gAllocCount, __ATOMIC_RELAXED);
}
static void resetAllocCount() {
    __atomic_store_n(&gAllocCount, 0, __ATOMIC_RELAXED);
}

// ---- harness ------------------------------------------------------------
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
// 16448 = 4096 frame (frame callback Oboe penuh, bukan kMax 1920 —
// render() dipanggil dengan numFrames penuh sebelum chunking pipeline;
// burst 3840 @192 kHz muat dengan margin) x laju maks 2.0 x 2 ch + 64.
constexpr size_t kRateScratchSamples = 4096 * 2 * 2 + 64;

// Sine 440 Hz stereo, N detik.
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

// Alirkan `seconds` detik lewat prosesor dalam chunk callbackFrames.
// Mengembalikan {alokasi selama fase ukur, rms output, frame output}.
struct StreamResult {
    size_t allocs = 0;
    double rms = 0.0;
    size_t outFrames = 0;
};

// WSOLA: push = callbackFrames * rate (seperti render: baca frames*rate
// dari queue); bila inputSamples > 16448, render meng-guard (bisukan) dan
// prosesor tidak dipanggil — simulasi yang sama di sini (skip push/pull).
static StreamResult streamRate(float rate, size_t callbackFrames,
                               double warmupSec, double measureSec) {
    // Input harus cukup untuk KONSUMSI (bukan output): di laju R, input
    // yang didorong = R x frame output.
    const std::vector<float> in =
        makeSine((warmupSec + measureSec) * rate + 1.0);
    PlaybackRateProcessor proc;
    proc.setRate(rate);
    std::vector<float> out(callbackFrames * kChannels);

    const auto runFor = [&](double seconds, bool measure) {
        size_t allocsBefore = 0;
        if (measure) {
            resetAllocCount();
            allocsBefore = 0;
        }
        size_t inPos = 0;  // frame
        double sumSq = 0.0;
        size_t outFrames = 0;
        const size_t totalFrames =
            static_cast<size_t>(seconds * kSampleRate);
        size_t doneOut = 0;
        while (doneOut < totalFrames) {
            const size_t want = std::min(callbackFrames, totalFrames - doneOut);
            const size_t inputFrames =
                static_cast<size_t>(static_cast<float>(want) * rate + 0.5f);
            const size_t inputSamples = inputFrames * kChannels;
            if (inputSamples <= kRateScratchSamples) {
                proc.push(in.data() + inPos * kChannels, inputFrames,
                          kChannels);
                inPos += inputFrames;
                const size_t got = proc.pull(out.data(), want, kChannels);
                for (size_t i = 0; i < got * kChannels; ++i) {
                    sumSq += static_cast<double>(out[i]) * out[i];
                }
                outFrames += got;
            }
            // else: guard render — callback dibisukan, prosesor tak jalan.
            doneOut += want;
        }
        StreamResult r;
        r.allocs = measure ? allocCount() - allocsBefore : 0;
        r.rms = outFrames > 0
                    ? std::sqrt(sumSq / (outFrames * kChannels))
                    : 0.0;
        r.outFrames = outFrames;
        return r;
    };

    (void)runFor(warmupSec, false);  // pemanasan: capai high-water mark
    return runFor(measureSec, true);
}

// PitchShifter: push = callbackFrames (frame-count preserving); tidak ada
// guard render di jalur ini, jadi push mentah sampai 3840 frame.
static StreamResult streamPitch(float ratio, size_t callbackFrames,
                                double warmupSec, double measureSec) {
    const std::vector<float> in =
        makeSine(warmupSec + measureSec + 1.0);
    PitchShifter ps;
    ps.setRatio(ratio);
    std::vector<float> out(callbackFrames * kChannels);

    const auto runFor = [&](double seconds, bool measure) {
        if (measure) resetAllocCount();
        size_t inPos = 0;  // frame
        double sumSq = 0.0;
        size_t outFrames = 0;
        const size_t totalFrames =
            static_cast<size_t>(seconds * kSampleRate);
        size_t done = 0;
        while (done < totalFrames) {
            const size_t want = std::min(callbackFrames, totalFrames - done);
            ps.push(in.data() + inPos * kChannels, want, kChannels);
            inPos += want;
            const size_t got = ps.pull(out.data(), want, kChannels);
            for (size_t i = 0; i < got * kChannels; ++i) {
                sumSq += static_cast<double>(out[i]) * out[i];
            }
            outFrames += got;
            done += want;
        }
        StreamResult r;
        r.allocs = measure ? allocCount() : 0;
        r.rms = outFrames > 0
                    ? std::sqrt(sumSq / (outFrames * kChannels))
                    : 0.0;
        r.outFrames = outFrames;
        return r;
    };

    (void)runFor(warmupSec, false);
    return runFor(measureSec, true);
}

int main() {
    std::printf("PB6-W2B no-alloc test\n");

    // Aritmetika ukuran rateScratch_ (yang di-assign di initialize()).
    check(kRateScratchSamples == 16448, "16448 = 4096*2.0*2+64");
    // Envelope guard: 1920 frame @2.0x muat, 3840 frame @2.0x muat
    // (tidak lagi dibisukan seperti di guard 7744 lama), begitu pula
    // batas 4096 frame @2.0x.
    check(1920u * 2u * 2u <= kRateScratchSamples,
          "guard: 1920f @2.0x muat di 16448");
    check(3840u * 2u * 2u <= kRateScratchSamples,
          "guard: 3840f @2.0x muat di 16448 (tidak dibisukan)");
    check(4096u * 2u * 2u <= kRateScratchSamples,
          "guard: 4096f @2.0x muat di 16448");

    char label[128];
    for (float rate : {0.5f, 2.0f}) {
        for (size_t cb : {1920u, 3840u}) {
            StreamResult r = streamRate(rate, cb, 1.0, 5.0);
            std::snprintf(label, sizeof(label),
                          "WSOLA %.1fx cb=%zu: 0 alokasi (5 dtk)",
                          rate, cb);
            check(r.allocs == 0, label);
            std::snprintf(label, sizeof(label),
                          "WSOLA %.1fx cb=%zu: output hidup (rms=%.3f)",
                          rate, cb, r.rms);
            check(r.rms > 0.01 && std::isfinite(r.rms), label);
            // outFrames hampir penuh = callback benar-benar diproses,
            // bukan dibisukan guard. RMS saja tidak cukup: total 240000
            // frame habis dibagi 3840 kecuali ekor 1920 — ekor itu saja
            // lolos guard 7744 lama dan RMS-nya tetap >0,01 walau 62/63
            // callback dibisukan (baseline: outFrames=1920, tetap PASS).
            // Ambang 80% (192000/240000) jauh di atas kasus bisu itu dan
            // di bawah minimum sah yang teramati (218624, 0.5x cb=3840).
            std::snprintf(label, sizeof(label),
                          "WSOLA %.1fx cb=%zu: output hampir penuh (%zu/240000 frame)",
                          rate, cb, r.outFrames);
            check(r.outFrames >= 192000, label);
        }
    }

    for (float ratio : {0.5f, 2.0f}) {
        for (size_t cb : {1920u, 3840u}) {
            StreamResult r = streamPitch(ratio, cb, 1.0, 5.0);
            std::snprintf(label, sizeof(label),
                          "Pitch %.1fx cb=%zu: 0 alokasi (5 dtk)",
                          ratio, cb);
            check(r.allocs == 0, label);
            std::snprintf(label, sizeof(label),
                          "Pitch %.1fx cb=%zu: output hidup (rms=%.3f)",
                          ratio, cb, r.rms);
            check(r.rms > 0.01 && std::isfinite(r.rms), label);
        }
    }

    // Ganti laju/rasio di tengah stream: reset() harus mempertahankan
    // kapasitas (clear, bukan dealloc) — fase ukur sesudah ganti tetap 0.
    {
        const std::vector<float> in = makeSine(6.0);
        PlaybackRateProcessor proc;
        proc.setRate(0.5f);
        std::vector<float> out(3840 * kChannels);
        for (size_t f = 0; f < 48000; f += 1920) {
            proc.push(in.data() + f * 2 * kChannels, 960, kChannels);
            (void)proc.pull(out.data(), 1920, kChannels);
        }
        proc.setRate(2.0f);  // reset() di tengah jalan
        resetAllocCount();
        size_t outFrames = 0;
        for (size_t f = 0; f < 48000 * 2; f += 1920) {
            const size_t idx = (f * 2) % (in.size() / kChannels);
            proc.push(in.data() + idx * kChannels, 3840, kChannels);
            outFrames += proc.pull(out.data(), 1920, kChannels);
        }
        check(allocCount() == 0,
              "WSOLA: 0 alokasi sesudah ganti laju 0.5x->2.0x");
        check(outFrames > 0, "WSOLA: output jalan sesudah ganti laju");
    }
    {
        const std::vector<float> in = makeSine(6.0);
        PitchShifter ps;
        ps.setRatio(0.5f);
        std::vector<float> out(3840 * kChannels);
        for (size_t f = 0; f < 48000; f += 1920) {
            ps.push(in.data() + f * kChannels, 1920, kChannels);
            (void)ps.pull(out.data(), 1920, kChannels);
        }
        ps.setRatio(2.0f);  // reset() di tengah jalan
        resetAllocCount();
        size_t outFrames = 0;
        for (size_t f = 0; f < 48000; f += 1920) {
            ps.push(in.data() + f * kChannels, 1920, kChannels);
            outFrames += ps.pull(out.data(), 1920, kChannels);
        }
        check(allocCount() == 0,
              "Pitch: 0 alokasi sesudah ganti rasio 0.5x->2.0x");
        check(outFrames > 0, "Pitch: output jalan sesudah ganti rasio");
    }

    std::printf("PB6-W2B no-alloc: %d lolos, %d gagal\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
