// =====================================================
// scripts/test_c_p2_clamp_finite.cpp
// =====================================================
//
// Membuktikan fix C-P2 (2026-11-12):
//   - clampFinite/isFiniteFloat: NaN/Inf (termasuk signaling NaN dan NaN
//     ber-payload) -> fallback, bukan clamp ke batas; nilai finite di luar
//     rentang -> batas terdekat; nilai valid di dalam rentang tidak berubah.
//     Uji bit-pattern tetap benar walau dikompilasi -ffast-math.
//   - Semua setter float AudioState: NaN/±Inf -> fallback; di luar rentang
//     -> batas; nilai valid -> tidak berubah; default tidak berubah.
//   - Pengaman DSPGraph: output non-finite satu node -> sampel dinolkan
//     (tidak merambat ke node hilir) + state node itu di-reset; node bersih
//     tidak ikut di-reset; sesudah reset, node pulih sendiri (NaN tidak
//     menetap sampai stop/reopen).
//
// Kompilasi:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_c_p2_clamp_finite.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     -o /tmp/test_c_p2_clamp_finite
//
// Uji ketahanan flag (harus tetap PASS — bukti helper tidak bergantung
// pada -fno-fast-math):
//   g++ -std=c++17 -O2 -ffast-math -I android/app/src/main/cpp \
//     scripts/test_c_p2_clamp_finite.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     -o /tmp/test_c_p2_clamp_finite_fast

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>

#include "core/AudioState.h"
#include "dsp/graph/DSPGraph.h"

using pristine::AudioState;
using pristine::DSPGraph;
using pristine::DSPNode;
using pristine::clampFinite;
using pristine::isFiniteFloat;

static int gPass = 0, gFail = 0;

static void check(const char* name, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", name);
    if (ok) ++gPass; else ++gFail;
}

static float bitsToFloat(uint32_t bits) {
    float v = 0.0f;
    std::memcpy(&v, &bits, sizeof(v));
    return v;
}

// =====================================================
// 1. isFiniteFloat — bit-pattern
// =====================================================

static void testIsFiniteFloat() {
    std::printf("isFiniteFloat:\n");

    check("0.0 finite", isFiniteFloat(0.0f));
    check("-0.0 finite", isFiniteFloat(-0.0f));
    check("1.0 finite", isFiniteFloat(1.0f));
    check("-123.456 finite", isFiniteFloat(-123.456f));
    check("denormal (0x00000001) finite",
        isFiniteFloat(bitsToFloat(0x00000001u)));
    check("FLT_MAX finite",
        isFiniteFloat(std::numeric_limits<float>::max()));
    check("+Inf (0x7F800000) non-finite",
        !isFiniteFloat(bitsToFloat(0x7F800000u)));
    check("-Inf (0xFF800000) non-finite",
        !isFiniteFloat(bitsToFloat(0xFF800000u)));
    check("quiet NaN (0x7FC00000) non-finite",
        !isFiniteFloat(bitsToFloat(0x7FC00000u)));
    check("signaling NaN (0x7F800001) non-finite",
        !isFiniteFloat(bitsToFloat(0x7F800001u)));
    check("NaN ber-payload (0x7F800123) non-finite",
        !isFiniteFloat(bitsToFloat(0x7F800123u)));
    check("NaN negatif (0xFFC00000) non-finite",
        !isFiniteFloat(bitsToFloat(0xFFC00000u)));
    check("std::nan non-finite",
        !isFiniteFloat(std::nan("")));
    check("std::infinity non-finite",
        !isFiniteFloat(std::numeric_limits<float>::infinity()));
}

// =====================================================
// 2. clampFinite
// =====================================================

static void testClampFinite() {
    std::printf("clampFinite:\n");

    check("NaN -> fallback",
        clampFinite(std::nan(""), 0.0f, 4.0f, 1.0f) == 1.0f);
    check("+Inf -> fallback",
        clampFinite(std::numeric_limits<float>::infinity(),
            0.0f, 4.0f, 1.0f) == 1.0f);
    check("-Inf -> fallback",
        clampFinite(-std::numeric_limits<float>::infinity(),
            0.0f, 4.0f, 1.0f) == 1.0f);
    check("signaling NaN -> fallback",
        clampFinite(bitsToFloat(0x7F800001u), 0.0f, 4.0f, 1.0f) == 1.0f);
    check("di bawah lo -> lo",
        clampFinite(-5.0f, 0.0f, 4.0f, 1.0f) == 0.0f);
    check("di atas hi -> hi",
        clampFinite(9.0f, 0.0f, 4.0f, 1.0f) == 4.0f);
    check("di dalam rentang tidak berubah",
        clampFinite(2.5f, 0.0f, 4.0f, 1.0f) == 2.5f);
    check("tepat di lo tidak berubah",
        clampFinite(0.0f, 0.0f, 4.0f, 1.0f) == 0.0f);
    check("tepat di hi tidak berubah",
        clampFinite(4.0f, 0.0f, 4.0f, 1.0f) == 4.0f);
    check("-0.0 di dalam rentang (finite, bukan fallback)",
        clampFinite(-0.0f, -1.0f, 1.0f, 9.0f) == 0.0f);
}

// =====================================================
// 3. Setter AudioState
// =====================================================

static void testAudioStateSetters() {
    std::printf("AudioState setters:\n");

    AudioState state;

    // Default tidak berubah.
    check("default masterGain 1.0", state.masterGain() == 1.0f);
    check("default balance 0.0", state.balance() == 0.0f);
    check("default stereoWidth 1.0", state.stereoWidth() == 1.0f);
    check("default solfeggioFreq 528.0", state.solfeggioFreq() == 528.0f);
    check("default brainwaveFreq 0.0", state.brainwaveFreq() == 0.0f);
    check("default resonanceIntensity 0.5",
        state.resonanceIntensity() == 0.5f);
    check("default bassBoost 0.0", state.bassBoost() == 0.0f);
    check("default eqGain[0] 0.0", state.eqGain(0) == 0.0f);

    const float nan = std::nan("");
    const float inf = std::numeric_limits<float>::infinity();

    // --- masterGain [0, 4] fallback 1.0 ---
    state.setMasterGain(nan);
    check("masterGain NaN -> 1.0", state.masterGain() == 1.0f);
    state.setMasterGain(inf);
    check("masterGain +Inf -> 1.0", state.masterGain() == 1.0f);
    state.setMasterGain(-inf);
    check("masterGain -Inf -> 1.0", state.masterGain() == 1.0f);
    state.setMasterGain(-2.0f);
    check("masterGain -2 -> 0", state.masterGain() == 0.0f);
    state.setMasterGain(9.0f);
    check("masterGain 9 -> 4", state.masterGain() == 4.0f);
    state.setMasterGain(2.5f);
    check("masterGain 2.5 tetap", state.masterGain() == 2.5f);

    // --- balance [-1, 1] fallback 0.0 ---
    state.setBalance(nan);
    check("balance NaN -> 0.0", state.balance() == 0.0f);
    state.setBalance(inf);
    check("balance +Inf -> 0.0", state.balance() == 0.0f);
    state.setBalance(-3.0f);
    check("balance -3 -> -1", state.balance() == -1.0f);
    state.setBalance(3.0f);
    check("balance 3 -> 1", state.balance() == 1.0f);
    state.setBalance(-0.5f);
    check("balance -0.5 tetap", state.balance() == -0.5f);

    // --- stereoWidth [0, 2] fallback 1.0 ---
    state.setStereoWidth(nan);
    check("stereoWidth NaN -> 1.0", state.stereoWidth() == 1.0f);
    state.setStereoWidth(-1.0f);
    check("stereoWidth -1 -> 0", state.stereoWidth() == 0.0f);
    state.setStereoWidth(5.0f);
    check("stereoWidth 5 -> 2", state.stereoWidth() == 2.0f);
    state.setStereoWidth(1.75f);
    check("stereoWidth 1.75 tetap", state.stereoWidth() == 1.75f);

    // --- solfeggioFreq [20, 2000] fallback 528 ---
    state.setSolfeggioFreq(nan);
    check("solfeggio NaN -> 528", state.solfeggioFreq() == 528.0f);
    state.setSolfeggioFreq(inf);
    check("solfeggio +Inf -> 528", state.solfeggioFreq() == 528.0f);
    state.setSolfeggioFreq(5.0f);
    check("solfeggio 5 -> 20", state.solfeggioFreq() == 20.0f);
    state.setSolfeggioFreq(30000.0f);
    check("solfeggio 30000 -> 2000", state.solfeggioFreq() == 2000.0f);
    state.setSolfeggioFreq(417.0f);
    check("solfeggio 417 tetap", state.solfeggioFreq() == 417.0f);

    // --- brainwaveFreq [0, 40] fallback 0.0 ---
    state.setBrainwaveFreq(nan);
    check("brainwave NaN -> 0.0", state.brainwaveFreq() == 0.0f);
    state.setBrainwaveFreq(-5.0f);
    check("brainwave -5 -> 0", state.brainwaveFreq() == 0.0f);
    state.setBrainwaveFreq(100.0f);
    check("brainwave 100 -> 40", state.brainwaveFreq() == 40.0f);
    state.setBrainwaveFreq(10.0f);
    check("brainwave 10 tetap", state.brainwaveFreq() == 10.0f);

    // --- resonanceIntensity [0, 1] fallback 0.5 ---
    state.setResonanceIntensity(nan);
    check("resonance NaN -> 0.5", state.resonanceIntensity() == 0.5f);
    state.setResonanceIntensity(-1.0f);
    check("resonance -1 -> 0", state.resonanceIntensity() == 0.0f);
    state.setResonanceIntensity(2.0f);
    check("resonance 2 -> 1", state.resonanceIntensity() == 1.0f);
    state.setResonanceIntensity(0.75f);
    check("resonance 0.75 tetap", state.resonanceIntensity() == 0.75f);

    // --- eqGain [-24, 24] fallback 0.0 ---
    state.setEqGain(3, nan);
    check("eqGain NaN -> 0.0", state.eqGain(3) == 0.0f);
    state.setEqGain(3, inf);
    check("eqGain +Inf -> 0.0", state.eqGain(3) == 0.0f);
    state.setEqGain(3, -100.0f);
    check("eqGain -100 -> -24", state.eqGain(3) == -24.0f);
    state.setEqGain(3, 100.0f);
    check("eqGain 100 -> 24", state.eqGain(3) == 24.0f);
    state.setEqGain(3, -12.0f);
    check("eqGain -12 (batas UI) tetap", state.eqGain(3) == -12.0f);
    state.setEqGain(3, 12.0f);
    check("eqGain +12 (batas UI) tetap", state.eqGain(3) == 12.0f);
    state.setEqGain(-1, 5.0f);
    check("eqGain band -1 ditolak", state.eqGain(-1) == 0.0f);
    state.setEqGain(10, 5.0f);
    check("eqGain band 10 ditolak", state.eqGain(10) == 0.0f);

    // --- bassBoost [0, 12] fallback 0.0 ---
    state.setBassBoost(nan);
    check("bassBoost NaN -> 0.0", state.bassBoost() == 0.0f);
    state.setBassBoost(inf);
    check("bassBoost +Inf -> 0.0", state.bassBoost() == 0.0f);
    state.setBassBoost(-6.0f);
    check("bassBoost -6 -> 0", state.bassBoost() == 0.0f);
    state.setBassBoost(100.0f);
    check("bassBoost 100 -> 12", state.bassBoost() == 12.0f);
    state.setBassBoost(6.0f);
    check("bassBoost 6 tetap", state.bassBoost() == 6.0f);
}

// =====================================================
// 4. Pengaman DSPGraph
// =====================================================
//
// PoisonNode: meniru node yang koefisiennya rusak — proses pertama
// mengeluarkan NaN/Inf (state DF-II teracuni). Sesudah reset() dipanggil
// (koefisien "diperbaiki" dari luar), proses berikutnya bersih: ini
// membuktikan NaN tidak menetap di state.

class PoisonNode : public DSPNode {
public:
    int resetCount = 0;
    bool poisoned = true;

    void prepare(int, int) override {}
    void reset() override {
        ++resetCount;
        poisoned = false;
    }
    void process(float* left, float* right, int frames) override {
        for (int i = 0; i < frames; ++i) {
            left[i] = 0.5f;
            right[i] = 0.5f;
        }
        if (poisoned) {
            left[2] = std::nan("");
            right[5] =
                std::numeric_limits<float>::infinity();
        }
    }
};

class CleanNode : public DSPNode {
public:
    int resetCount = 0;
    bool sawNonFinite = false;

    void prepare(int, int) override {}
    void reset() override { ++resetCount; }
    void process(float* left, float* right, int frames) override {
        for (int i = 0; i < frames; ++i) {
            // Node hilir: mencatat bila menerima NaN/Inf dari hulu.
            if (!isFiniteFloat(left[i]) || !isFiniteFloat(right[i])) {
                sawNonFinite = true;
            }
            left[i] += 0.25f;
            right[i] += 0.25f;
        }
    }
};

static void testGraphGuard() {
    std::printf("DSPGraph guard:\n");

    DSPGraph graph;
    graph.prepare(48000, 1920);

    auto* poison = new PoisonNode();
    auto* clean = new CleanNode();
    graph.addNode(std::unique_ptr<DSPNode>(poison));
    graph.addNode(std::unique_ptr<DSPNode>(clean));

    float left[8];
    float right[8];
    for (int i = 0; i < 8; ++i) {
        left[i] = 0.1f;
        right[i] = 0.1f;
    }

    // Buffer 1: poison mengeluarkan NaN/Inf.
    graph.process(left, right, 8);

    check("sampel NaN dinolkan sebelum node hilir (kiri)",
        left[2] == 0.25f);  // 0.0 (dinolkan) + 0.25 dari CleanNode
    check("sampel Inf dinolkan sebelum node hilir (kanan)",
        right[5] == 0.25f);
    check("sampel valid lain tidak disentuh",
        left[0] == 0.75f && right[0] == 0.75f);  // 0.5 (PoisonNode) + 0.25
    check("node hilir tidak pernah melihat NaN/Inf",
        !clean->sawNonFinite);
    check("node peracun di-reset tepat 1x", poison->resetCount == 1);
    check("node bersih TIDAK ikut di-reset", clean->resetCount == 0);

    // Buffer 2: koefisien sudah "diperbaiki" (reset mematikan poison).
    // Tanpa pengaman, state DF-II yang teracuni akan tetap NaN — di sini
    // output harus bersih dan tidak ada reset tambahan.
    for (int i = 0; i < 8; ++i) {
        left[i] = 0.1f;
        right[i] = 0.1f;
    }
    graph.process(left, right, 8);

    bool allFinite = true;
    for (int i = 0; i < 8; ++i) {
        if (!isFiniteFloat(left[i]) || !isFiniteFloat(right[i])) {
            allFinite = false;
        }
    }
    check("buffer ke-2 bersih (pulih tanpa stop/reopen)", allFinite);
    check("tidak ada reset tambahan di buffer ke-2",
        poison->resetCount == 1 && clean->resetCount == 0);

    // Kontrol: graph berisi node bersih saja — output bit-identik,
    // tanpa reset sama sekali.
    DSPGraph cleanGraph;
    cleanGraph.prepare(48000, 1920);
    auto* cleanOnly = new CleanNode();
    cleanGraph.addNode(std::unique_ptr<DSPNode>(cleanOnly));
    for (int i = 0; i < 8; ++i) {
        left[i] = 0.1f;
        right[i] = 0.1f;
    }
    cleanGraph.process(left, right, 8);
    check("jalur normal: output tak berubah, tanpa reset",
        left[0] == 0.35f && right[0] == 0.35f &&
        cleanOnly->resetCount == 0);
}

int main() {
    std::printf("== C-P2: clampFinite + setter AudioState + guard DSPGraph ==\n");

    testIsFiniteFloat();
    testClampFinite();
    testAudioStateSetters();
    testGraphGuard();

    std::printf("== %d PASS, %d FAIL ==\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
