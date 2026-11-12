// =====================================================
// scripts/test_c_smooth.cpp
// =====================================================
//
// Membuktikan smoothing parameter (C-SMOOTH, 2026-11-12) benar-benar
// bekerja — dan nilai akhirnya TIDAK berubah.
//
// Yang diuji:
//
//   1. GainNode (mode DSP, masterGain/balance):
//      - prime: buffer pertama langsung di target (tidak menyapu dari 1,0)
//      - langkah: sesudah target berubah, sample pertama bergerak satu
//        langkah one-pole (0,002f), BUKAN langsung ke target
//      - konvergen: sesudah cukup sample, gain persis target (bit-exact)
//      - reset(): men-snap ke target di tengah sapuan
//
//   2. EQProcessor (koefisien biquad):
//      - langkah: sesudah setBandGain, respons 1 kHz bergerak bertahap
//        (RMS 48 sample pertama masih dekat flat), BUKAN langsung penuh
//      - konvergen: steady-state sama dengan BiquadFilter referensi yang
//        memakai koefisien target langsung (dalam 2%)
//      - prepare(): men-snap — gain penuh sejak sample pertama (perilaku
//        startup sama seperti sebelum C-SMOOTH)
//      - flat: tetap identity
//
//   3. AudioPipeline mode Immersive (gain/balance inline):
//      - uji diferensial dua pipeline identik (chain deterministik, gain
//        diterapkan SESUDAH chain): rasio output B/A pada sample pertama
//        sesudah step mengikuti one-pole (1 - 0,5*0,998^(i+1)) / 0,5,
//        dan -> 2,0 persis sesudah settle
//      - prime: rasio 1,0 pada buffer pertama
//
//   4. AudioPipeline mode BitPerfect:
//      - output bit-exact sama dengan input walau masterGain 0,5 —
//        smoothing TIDAK PERNAH jalan di jalur ini.
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_c_smooth.cpp \
//     android/app/src/main/cpp/core/AudioPipeline.cpp \
//     android/app/src/main/cpp/core/ImmersiveStage.cpp \
//     android/app/src/main/cpp/dsp/DSPChain.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     android/app/src/main/cpp/dsp/tone/EQNode.cpp \
//     android/app/src/main/cpp/dsp/tone/GainNode.cpp \
//     android/app/src/main/cpp/dsp/EQProcessor.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     android/app/src/main/cpp/dsp/spatial/StereoWidenerNode.cpp \
//     android/app/src/main/cpp/dsp/dynamics/LimiterNode.cpp \
//     android/app/src/main/cpp/dsp/headphone/HeadphoneCorrectionNode.cpp \
//     android/app/src/main/cpp/dsp/immersive/SolfeggioResonator.cpp \
//     android/app/src/main/cpp/dsp/immersive/BrainwaveGenerator.cpp \
//     android/app/src/main/cpp/dsp/immersive/HarmonicExciter.cpp \
//     android/app/src/main/cpp/dsp/immersive/SpatialFieldProcessor.cpp \
//     android/app/src/main/cpp/dsp/immersive/BinauralRenderer.cpp \
//     -o /tmp/test_c_smooth && /tmp/test_c_smooth

#include <cmath>
#include <cstdio>
#include <vector>

#include "core/AudioPipeline.h"
#include "core/AudioTypes.h"
#include "core/DSPConfig.h"
#include "dsp/BiquadFilter.h"
#include "dsp/EQProcessor.h"
#include "dsp/tone/GainNode.h"

using namespace pristine;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) ++gPass; else ++gFail;
}

static constexpr double kPi = 3.14159265358979323846;
static constexpr float kSampleRate = 48000.0f;

static void fillSine(
    float* left, float* right, int frames,
    double hz, double amp, long long& phase
) {
    for (int i = 0; i < frames; ++i) {
        const float v = static_cast<float>(
            amp * std::sin(2.0 * kPi * hz * (double)phase / kSampleRate)
        );
        left[i] = v;
        right[i] = v;
        ++phase;
    }
}

// RMS paruh/segmen buffer (dipakai untuk mengukur respons steady-state
// tanpa transien awal).
static double rms(const float* x, int begin, int end) {
    double s = 0.0;
    for (int i = begin; i < end; ++i) s += (double)x[i] * (double)x[i];
    return std::sqrt(s / (double)(end - begin));
}

// =====================================================
// 1. GainNode
// =====================================================

static void testGainNode() {
    std::printf("GainNode (DSP masterGain/balance):\n");

    GainNode node;
    node.prepare(48000, 1920);

    DSPConfig cfg;
    cfg.masterGain = 0.5f;
    cfg.balance = 0.0f;

    std::vector<float> l(1920), r(1920);

    // Prime: buffer pertama langsung di target 0,5 (tidak menyapu dari 1,0).
    node.applyConfig(cfg);
    std::fill(l.begin(), l.end(), 1.0f);
    std::fill(r.begin(), r.end(), 1.0f);
    node.process(l.data(), r.data(), 480);
    check("prime: buffer pertama langsung 0,5", l[0] == 0.5f && l[479] == 0.5f);

    // Langkah: target 0,5 -> 1,0. Sample pertama = satu langkah one-pole
    // (0,5 + 0,5*0,002 = 0,501), BUKAN 1,0.
    cfg.masterGain = 1.0f;
    node.applyConfig(cfg);
    std::fill(l.begin(), l.end(), 1.0f);
    std::fill(r.begin(), r.end(), 1.0f);
    node.process(l.data(), r.data(), 480);
    check("step: sample pertama 0,501 (bukan 1,0)",
        std::fabs(l[0] - 0.501f) < 1e-6f);
    check("step: naik monoton, belum sampai 1,0",
        l[0] < l[479] && l[479] < 1.0f);

    // Konvergen: sesudah cukup sample, persis target.
    for (int i = 0; i < 40; ++i) {
        std::fill(l.begin(), l.end(), 1.0f);
        node.process(l.data(), r.data(), 480);
    }
    check("settle: gain persis 1,0", l[0] == 1.0f && l[479] == 1.0f);

    // Balance: target kiri 0 (balance +1). Kiri meluruh menuju 0.
    cfg.balance = 1.0f;
    node.applyConfig(cfg);
    std::fill(l.begin(), l.end(), 1.0f);
    std::fill(r.begin(), r.end(), 1.0f);
    node.process(l.data(), r.data(), 480);
    check("balance: kiri meluruh dari 1,0 (bukan langsung 0)",
        l[0] > 0.9f && l[0] < 1.0f && l[479] < l[0]);
    check("balance: kanan tetap 1,0", r[0] == 1.0f);
    for (int i = 0; i < 40; ++i) {
        std::fill(l.begin(), l.end(), 1.0f);
        node.process(l.data(), r.data(), 480);
    }
    check("balance: kiri persis 0 sesudah settle", l[0] == 0.0f);

    // reset() men-snap di tengah sapuan.
    cfg.masterGain = 0.25f;
    cfg.balance = 0.0f;
    node.applyConfig(cfg);
    std::fill(l.begin(), l.end(), 1.0f);
    node.process(l.data(), r.data(), 48); // baru mulai menyapu dari 1,0
    node.reset();
    std::fill(l.begin(), l.end(), 1.0f);
    node.process(l.data(), r.data(), 480);
    check("reset: snap ke target 0,25", l[0] == 0.25f && l[479] == 0.25f);
}

// =====================================================
// 2. EQProcessor
// =====================================================

static void testEQProcessor() {
    std::printf("EQProcessor (koefisien biquad):\n");

    const int kFrames = 20000;
    std::vector<float> l(kFrames), r(kFrames);
    long long phase = 0;

    // Flat: tetap identity.
    {
        EQProcessor eq;
        eq.prepare(48000);
        fillSine(l.data(), r.data(), kFrames, 1000.0, 0.5, phase);
        std::vector<float> in = l;
        eq.process(l.data(), r.data(), kFrames);
        double maxErr = 0.0;
        for (int i = 0; i < kFrames; ++i)
            maxErr = std::max(maxErr, (double)std::fabs(l[i] - in[i]));
        check("flat: identity (err < 1e-5)", maxErr < 1e-5);
    }

    // Langkah: band 1 kHz +12 dB. 48 sample pertama masih dekat flat
    // (koefisien baru bergerak ~9%), steady-state penuh.
    {
        EQProcessor eq;
        eq.prepare(48000);
        eq.setBandGain(5, 12.0f); // band 1000 Hz
        phase = 0;
        fillSine(l.data(), r.data(), kFrames, 1000.0, 0.5, phase);
        const double inRms = rms(l.data(), 0, kFrames);
        eq.process(l.data(), r.data(), kFrames);
        const double earlyRms = rms(l.data(), 0, 48);
        const double lateRms = rms(l.data(), kFrames - 480, kFrames);
        check("step: 48 sample pertama masih dekat flat (<1,5x)",
            earlyRms / inRms < 1.5);
        // 12 dB = 3,981x.
        check("settle: steady-state ~3,98x (12 dB, toleransi 5%)",
            std::fabs(lateRms / inRms - 3.981071f) / 3.981071f < 0.05);

        // Referensi: BiquadFilter langsung dengan koefisien target.
        BiquadFilter ref;
        ref.setPeakingEQ(1000.0f, 1.414f, 12.0f, 48000.0f);
        phase = 0;
        std::vector<float> rl(kFrames);
        fillSine(rl.data(), r.data(), kFrames, 1000.0, 0.5, phase);
        for (int i = 0; i < kFrames; ++i) rl[i] = ref.process(rl[i]);
        const double refRms = rms(rl.data(), kFrames - 480, kFrames);
        check("settle: sama dengan referensi koefisien target (2%)",
            std::fabs(lateRms - refRms) / refRms < 0.02);
    }

    // prepare() men-snap: gain penuh sejak sample pertama.
    {
        EQProcessor eq;
        eq.prepare(48000);
        eq.setBandGain(5, 12.0f);
        eq.prepare(48000); // re-prepare -> snap
        phase = 0;
        fillSine(l.data(), r.data(), 480, 1000.0, 0.5, phase);
        const double inRms = rms(l.data(), 0, 480);
        eq.process(l.data(), r.data(), 480);
        const double outRms = rms(l.data(), 0, 480);
        check("prepare: snap, gain penuh sejak sample pertama (>3,5x)",
            outRms / inRms > 3.5);
    }

    // Bass boost: langkah bertahap juga, steady ~2x (6 dB @100 Hz).
    {
        EQProcessor eq;
        eq.prepare(48000);
        eq.setBassBoost(6.0f);
        phase = 0;
        fillSine(l.data(), r.data(), kFrames, 100.0, 0.5, phase);
        const double inRms = rms(l.data(), 0, kFrames);
        eq.process(l.data(), r.data(), kFrames);
        const double earlyRms = rms(l.data(), 0, 48);
        const double lateRms = rms(l.data(), kFrames - 480, kFrames);
        check("bass: 48 sample pertama masih dekat flat (<1,5x)",
            earlyRms / inRms < 1.5);
        // Low shelf RBJ: di frekuensi corner (100 Hz) responsnya hanya
        // SETENGAH gain dB (+3 dB, bukan +6 dB) — gain penuh baru jauh di
        // bawah corner. 3 dB = 1,4125x.
        check("bass: steady-state ~1,41x (+3 dB di corner, toleransi 5%)",
            std::fabs(lateRms / inRms - 1.41254) / 1.41254 < 0.05);
    }
}

// =====================================================
// 3 & 4. AudioPipeline: Immersive gain + BitPerfect
// =====================================================

static void testAudioPipeline() {
    std::printf("AudioPipeline (Immersive gain / BitPerfect):\n");

    const int kBuf = 960;
    std::vector<float> inL(kBuf), inR(kBuf);
    long long phase = 0;

    DSPParameters params;
    params.processingMode = ProcessingMode::Immersive;
    params.masterGain = 0.5f;
    params.balance = 0.0f;
    params.resonanceIntensity = 0.0f;
    params.brainwaveFreq = 0.0f;
    params.stereoWidth = 1.0f;
    params.limiterEnabled = false;

    // Dua pipeline identik, input identik. Chain deterministik dan gain
    // diterapkan SESUDAH chain, jadi rasio output B/A = rasio gain halus.
    AudioPipeline pipeA, pipeB;
    pipeA.prepare(48000, 1920);
    pipeB.prepare(48000, 1920);

    std::vector<float> aL(kBuf), aR(kBuf), bL(kBuf), bR(kBuf);

    // Buffer 1: keduanya gain 0,5 (prime) -> rasio 1,0.
    phase = 0;
    fillSine(inL.data(), inR.data(), kBuf, 440.0, 0.5, phase);
    aL = inL; aR = inR; bL = inL; bR = inR;
    pipeA.process(aL.data(), aR.data(), kBuf, params);
    pipeB.process(bL.data(), bR.data(), kBuf, params);
    double ratio0 = 0.0;
    for (int i = 0; i < kBuf; ++i) {
        if (std::fabs(aL[i]) > 0.1) { ratio0 = bL[i] / aL[i]; break; }
    }
    check("immersive prime: rasio B/A = 1,0 di buffer pertama",
        std::fabs(ratio0 - 1.0) < 1e-6);

    // Buffer 2: B pindah ke gain 1,0. Rasio pada sample ke-i (satu langkah
    // one-pole per sample dari 0,5):
    //   gainB[i] = 1 - 0,5 * 0,998^(i+1)   ->   rasio = gainB[i] / 0,5
    // Sample 0 = 1,002; makin jauh makin mendekati 2,0. Ukur pada sample
    // pertama yang terukur (|aL| > 0,1) dan bandingkan dengan ekspektasi
    // untuk indeks itu — BUKAN dengan 1,002 buta.
    params.masterGain = 1.0f;
    phase = 0;
    fillSine(inL.data(), inR.data(), kBuf, 440.0, 0.5, phase);
    aL = inL; aR = inR; bL = inL; bR = inR;
    DSPParameters paramsA = params;
    paramsA.masterGain = 0.5f;
    pipeA.process(aL.data(), aR.data(), kBuf, paramsA);
    pipeB.process(bL.data(), bR.data(), kBuf, params);
    double ratioStep = 0.0;
    int stepIdx = -1;
    for (int i = 0; i < kBuf; ++i) {
        if (std::fabs(aL[i]) > 0.1) { ratioStep = bL[i] / aL[i]; stepIdx = i; break; }
    }
    const double expectedStep =
        (1.0 - 0.5 * std::pow(0.998, stepIdx + 1)) / 0.5;
    check("immersive step: rasio = one-pole pada indeks itu (bukan 2,0)",
        stepIdx >= 0 && std::fabs(ratioStep - expectedStep) < 1e-4);

    // Settle: rasio -> 2,0 persis.
    for (int i = 0; i < 40; ++i) {
        phase = 0;
        fillSine(inL.data(), inR.data(), kBuf, 440.0, 0.5, phase);
        aL = inL; aR = inR; bL = inL; bR = inR;
        pipeA.process(aL.data(), aR.data(), kBuf, paramsA);
        pipeB.process(bL.data(), bR.data(), kBuf, params);
    }
    double ratioSettled = 0.0;
    for (int i = 0; i < kBuf; ++i) {
        if (std::fabs(aL[i]) > 0.1) { ratioSettled = bL[i] / aL[i]; break; }
    }
    check("immersive settle: rasio = 2,0 persis",
        std::fabs(ratioSettled - 2.0) < 1e-6);

    // BitPerfect: output bit-exact sama dengan input walau masterGain 0,5.
    AudioPipeline pipeBP;
    pipeBP.prepare(48000, 1920);
    DSPParameters bp = params;
    bp.processingMode = ProcessingMode::BitPerfect;
    bp.masterGain = 0.5f;
    phase = 0;
    fillSine(inL.data(), inR.data(), kBuf, 440.0, 0.5, phase);
    std::vector<float> outL = inL, outR = inR;
    pipeBP.process(outL.data(), outR.data(), kBuf, bp);
    bool exact = true;
    for (int i = 0; i < kBuf; ++i) {
        if (outL[i] != inL[i] || outR[i] != inR[i]) { exact = false; break; }
    }
    check("bitperfect: output bit-exact walau masterGain 0,5", exact);
}

int main() {
    testGainNode();
    testEQProcessor();
    testAudioPipeline();
    std::printf("C-SMOOTH: %d pass, %d fail\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
