// =====================================================
// spike/dsp-eq-bypass/test_pipeline_eq_bypass.cpp
// =====================================================
//
// Harness host untuk pemetaan flag di AudioPipeline (P0-1, 2026-11-19):
// `AudioPipeline::applyDSPConfig` harus memetakan
// `DSPParameters.eqEnabled` -> `DSPConfig.enabled`, dan dedup
// `dspConfigEquals` harus mendeteksi perubahan flag itu (toggle
// terkirim, bukan ditelan sebagai "config sama").
//
// Dibuktikan TIDAK LANGSUNG (dspConfigEquals + mDspConfig bersifat
// privat): lewat perilaku `AudioPipeline::process()` mode DSP —
// bit-exact saat eqEnabled=false, berubah saat eqEnabled=true.
// Perilaku ini hanya mungkin bila pemetaan + dedup keduanya benar:
// tanpa pemetaan, off tetap memproses; tanpa dedup, toggle true
// sesudah off tidak terkirim ulang ke DSPChain.
//
//   1. eqEnabled=false + EQ +6 dB: process() BIT-EXACT.
//   2. eqEnabled=true (toggle, config lain sama): process() BERUBAH —
//      membuktikan dedup mendeteksi perubahan flag.
//   3. eqEnabled=false lagi: BIT-EXACT lagi.
//   4. Default DSPParameters.eqEnabled == true (perilaku lama).
//
// Catatan: buffer pertama sesudah prepare() TIDAK di-fade (noteMode
// hanya mencatat mode; fade 8 ms hanya saat ganti mode sungguhan),
// jadi bit-exact di sini bukan artefak fade.
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

#include "core/AudioPipeline.h"
#include "core/AudioTypes.h"

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

// Parameter DSP mode dengan EQ non-netral (+6 dB semua band).
pristine::DSPParameters loudEqParams(bool eqEnabled) {
    pristine::DSPParameters p;
    p.processingMode = pristine::ProcessingMode::DSP;
    p.eqEnabled = eqEnabled;
    for (int i = 0; i < 10; ++i) {
        p.eqGains[i] = 6.0f;
    }
    p.bassBoostGain = 0.0f;
    p.masterGain = 1.0f;
    p.balance = 0.0f;
    p.stereoWidth = 1.0f;
    p.reverbPreset = 0;
    p.hrtfEnabled = false;
    p.limiterEnabled = true;
    p.headphoneCorrectionEnabled = false;
    return p;
}

constexpr int kSampleRate = 48000;
constexpr int kMaxFrames = 512;
constexpr size_t kFrames = 4096;

void testDefaultEqEnabled() {
    pristine::DSPParameters p;
    check(p.eqEnabled, "default DSPParameters.eqEnabled == true");
}

void testPipelineToggle() {
    pristine::AudioPipeline pipeline;
    pipeline.prepare(kSampleRate, kMaxFrames);

    const std::vector<float> inL =
        randomSignal(kFrames, 0.5f, 31337);
    const std::vector<float> inR =
        randomSignal(kFrames, 0.5f, 2718);

    // process() dalam chunk 512 — buffer pertama sesudah prepare()
    // tidak di-fade, jadi bit-exact benar-benar berarti bypass.
    auto run = [&](const pristine::DSPParameters& params,
                   std::vector<float>& outL,
                   std::vector<float>& outR) {
        outL = inL;
        outR = inR;
        for (size_t off = 0; off < kFrames; off += kMaxFrames) {
            pipeline.process(
                outL.data() + off,
                outR.data() + off,
                kMaxFrames,
                params
            );
        }
    };

    std::vector<float> outL, outR;

    // 1. off -> bit-exact (pemetaan false terbukti)
    run(loudEqParams(false), outL, outR);
    check(bitExact(inL, outL), "pipeline eqEnabled=false: L bit-exact");
    check(bitExact(inR, outR), "pipeline eqEnabled=false: R bit-exact");

    // 2. on (toggle, sisanya identik) -> berubah (dedup mendeteksi
    // perubahan flag dan mengirim ulang config ke DSPChain)
    run(loudEqParams(true), outL, outR);
    const float dL = maxAbsDiff(inL, outL);
    const float dR = maxAbsDiff(inR, outR);
    std::printf("  pipeline eqEnabled=true: maxDiff L=%.4f R=%.4f\n", dL, dR);
    check(dL > 1e-3f, "pipeline eqEnabled=true: EQ mengubah L");
    check(dR > 1e-3f, "pipeline eqEnabled=true: EQ mengubah R");

    // 3. off lagi -> bit-exact lagi (toggle pulih lewat dedup)
    run(loudEqParams(false), outL, outR);
    check(bitExact(inL, outL), "pipeline eqEnabled=false(2): L bit-exact");
    check(bitExact(inR, outR), "pipeline eqEnabled=false(2): R bit-exact");

    // 4. on lagi -> berubah lagi
    run(loudEqParams(true), outL, outR);
    check(
        maxAbsDiff(inL, outL) > 1e-3f,
        "pipeline eqEnabled=true(2): EQ mengubah L lagi"
    );
}

} // namespace

int main() {
    testDefaultEqEnabled();
    testPipelineToggle();

    std::printf(
        "%d checks, %d failures\n", gChecks, gFailures
    );
    return gFailures == 0 ? 0 : 1;
}
