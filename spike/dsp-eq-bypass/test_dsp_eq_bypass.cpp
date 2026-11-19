// =====================================================
// spike/dsp-eq-bypass/test_dsp_eq_bypass.cpp
// =====================================================
//
// Harness host untuk sakelar master EQ (P0-1, 2026-11-19):
// DSPChain dengan `DSPConfig.enabled = false` harus passthrough
// BIT-EXACT walau gain EQ non-netral, dan toggle on -> off -> on
// harus pulih dengan benar.
//
//   1. enabled=true + EQ +6 dB semua band: output BERUBAH (EQ jalan).
//   2. enabled=false + EQ yang sama: output BIT-EXACT (memcmp == 0).
//   3. Toggle on -> off -> on: berubah -> bit-exact -> berubah lagi.
//   4. Config default: enabled=true (perilaku lama untuk jalur yang
//      tidak pernah menyetel flag).
//   5. Chunk bervariasi (1..512) saat bypass: tetap bit-exact.
//
// Bangun & jalankan: lihat spike/dsp-eq-bypass/README.md.
// Yang TIDAK dibuktikan di sini: kompilasi NDK, bunyi di headphone,
// CPU di POCO M6, gate output, jalur JNI/Kotlin/JS.
//
// SPDX-License-Identifier: MIT

#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>
#include <vector>

#include "core/DSPConfig.h"
#include "dsp/DSPChain.h"

namespace {

int gChecks = 0;
int gFailures = 0;

void check(bool ok, const char* name) {
    ++gChecks;
    if (!ok) {
        ++gFailures;
        std::printf("FAIL: %s\n", name);
    } else {
        std::printf("ok: %s\n", name);
    }
}

std::vector<float> randomSignal(
    size_t n,
    float amplitude,
    unsigned seed
) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-amplitude, amplitude);
    std::vector<float> out(n);
    for (size_t i = 0; i < n; ++i) {
        out[i] = dist(rng);
    }
    return out;
}

bool bitExact(
    const std::vector<float>& a,
    const std::vector<float>& b
) {
    return a.size() == b.size() &&
           std::memcmp(a.data(), b.data(), a.size() * sizeof(float)) == 0;
}

float maxAbsDiff(
    const std::vector<float>& a,
    const std::vector<float>& b
) {
    float m = 0.0f;
    for (size_t i = 0; i < a.size(); ++i) {
        m = std::fmax(m, std::fabs(a[i] - b[i]));
    }
    return m;
}

// Sinyal stereo -> DSPChain dalam chunk, kembalikan hasil.
void runChain(
    pristine::DSPChain& chain,
    const std::vector<float>& inL,
    const std::vector<float>& inR,
    std::vector<float>& outL,
    std::vector<float>& outR,
    int chunk
) {
    outL = inL;
    outR = inR;
    const size_t n = inL.size();
    for (size_t off = 0; off < n; off += static_cast<size_t>(chunk)) {
        const int c = static_cast<int>(
            std::min<size_t>(static_cast<size_t>(chunk), n - off)
        );
        chain.process(outL.data() + off, outR.data() + off, c);
    }
}

// Config EQ non-netral: +6 dB di semua 10 band, sisanya netral.
pristine::DSPConfig loudEqConfig(bool enabled) {
    pristine::DSPConfig cfg;
    cfg.enabled = enabled;
    cfg.eqGain.fill(6.0f);
    cfg.masterGain = 1.0f;
    cfg.stereoWidth = 1.0f;
    cfg.balance = 0.0f;
    cfg.bassBoost = 0.0f;
    cfg.reverbPreset = 0;
    cfg.hrtfEnabled = false;
    cfg.limiterEnabled = true;
    return cfg;
}

constexpr int kSampleRate = 48000;
constexpr int kMaxFrames = 512;
constexpr size_t kFrames = 4096;

void testDefaultEnabled() {
    pristine::DSPConfig cfg;
    check(cfg.enabled, "default DSPConfig.enabled == true");
}

void testEnabledAppliesEq() {
    pristine::DSPChain chain;
    chain.prepare(kSampleRate, kMaxFrames);
    chain.applyConfig(loudEqConfig(true));

    const std::vector<float> inL =
        randomSignal(kFrames, 0.5f, 1234);
    const std::vector<float> inR =
        randomSignal(kFrames, 0.5f, 5678);
    std::vector<float> outL, outR;
    runChain(chain, inL, inR, outL, outR, kMaxFrames);

    const float dL = maxAbsDiff(inL, outL);
    const float dR = maxAbsDiff(inR, outR);
    std::printf("  enabled=true: maxDiff L=%.4f R=%.4f\n", dL, dR);
    check(dL > 1e-3f, "enabled=true: EQ mengubah L");
    check(dR > 1e-3f, "enabled=true: EQ mengubah R");
}

void testDisabledBitExact() {
    pristine::DSPChain chain;
    chain.prepare(kSampleRate, kMaxFrames);
    chain.applyConfig(loudEqConfig(false));

    const std::vector<float> inL =
        randomSignal(kFrames, 0.5f, 1234);
    const std::vector<float> inR =
        randomSignal(kFrames, 0.5f, 5678);
    std::vector<float> outL, outR;
    runChain(chain, inL, inR, outL, outR, kMaxFrames);

    check(bitExact(inL, outL), "enabled=false: L bit-exact");
    check(bitExact(inR, outR), "enabled=false: R bit-exact");
}

void testToggleRestores() {
    pristine::DSPChain chain;
    chain.prepare(kSampleRate, kMaxFrames);

    const std::vector<float> inL =
        randomSignal(kFrames, 0.5f, 99);
    const std::vector<float> inR =
        randomSignal(kFrames, 0.5f, 77);
    std::vector<float> outL, outR;

    // on -> berubah
    chain.applyConfig(loudEqConfig(true));
    runChain(chain, inL, inR, outL, outR, kMaxFrames);
    check(
        maxAbsDiff(inL, outL) > 1e-3f,
        "toggle on(1): EQ mengubah sinyal"
    );

    // off -> bit-exact
    chain.applyConfig(loudEqConfig(false));
    runChain(chain, inL, inR, outL, outR, kMaxFrames);
    check(bitExact(inL, outL), "toggle off: L bit-exact");
    check(bitExact(inR, outR), "toggle off: R bit-exact");

    // on lagi -> berubah lagi (state biquad pulih, bukan macet bypass)
    chain.applyConfig(loudEqConfig(true));
    runChain(chain, inL, inR, outL, outR, kMaxFrames);
    check(
        maxAbsDiff(inL, outL) > 1e-3f,
        "toggle on(2): EQ mengubah sinyal lagi"
    );

    // off lagi -> bit-exact lagi
    chain.applyConfig(loudEqConfig(false));
    runChain(chain, inL, inR, outL, outR, kMaxFrames);
    check(bitExact(inL, outL), "toggle off(2): L bit-exact");
}

void testDisabledAllChunkSizes() {
    pristine::DSPChain chain;
    chain.prepare(kSampleRate, kMaxFrames);
    chain.applyConfig(loudEqConfig(false));

    const std::vector<float> inL =
        randomSignal(kFrames, 0.5f, 4242);
    const std::vector<float> inR =
        randomSignal(kFrames, 0.5f, 2424);
    std::vector<float> outL, outR;

    bool allExact = true;
    for (int chunk = 1; chunk <= kMaxFrames; chunk *= 2) {
        runChain(chain, inL, inR, outL, outR, chunk);
        if (!bitExact(inL, outL) || !bitExact(inR, outR)) {
            allExact = false;
            std::printf("  chunk=%d: TIDAK bit-exact\n", chunk);
        }
    }
    // + chunk acak di luar kelipatan 2
    for (int chunk : {3, 7, 100, 333, 511}) {
        runChain(chain, inL, inR, outL, outR, chunk);
        if (!bitExact(inL, outL) || !bitExact(inR, outR)) {
            allExact = false;
            std::printf("  chunk=%d: TIDAK bit-exact\n", chunk);
        }
    }
    check(allExact, "enabled=false: bit-exact semua ukuran chunk");
}

} // namespace

int main() {
    testDefaultEnabled();
    testEnabledAppliesEq();
    testDisabledBitExact();
    testToggleRestores();
    testDisabledAllChunkSizes();

    std::printf(
        "%d checks, %d failures\n", gChecks, gFailures
    );
    return gFailures == 0 ? 0 : 1;
}
