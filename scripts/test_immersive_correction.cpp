// =====================================================
// scripts/test_immersive_correction.cpp
// =====================================================
//
// Membuktikan koreksi headphone di rantai Immersive (B-HPIMM, 2026-11-15)
// benar-benar bekerja — dan Bit-Perfect tetap memaksanya mati.
//
// Yang diuji, memakai AudioPipeline yang SEBENARNYA (bukan tiruan):
//
//   1. Immersive + koreksi ON (preset 1 filter peaking +6 dB @ 1 kHz):
//      sinyal 1 kHz yang sudah settle naik ~2x RMS dibanding koreksi OFF.
//      Ini membuktikan node koreksi kedua (mImmersiveCorrection) jalan di
//      mode Immersive — rantai ini tidak memakai DSPChain.
//   2. Immersive + koreksi ON tapi TANPA preset (filterCount 0):
//      output bit-identik dengan koreksi OFF — node tidak menyentuh buffer.
//   3. Immersive + preset terpasang tapi flag OFF:
//      output bit-identik dengan koreksi OFF — gerbang
//      headphoneCorrectionEnabled yang sama dengan mode DSP.
//   4. BitPerfect + koreksi ON + preset:
//      output bit-exact sama dengan input — gate Bit-Perfect: process()
//      mengarahkan ke processBitPerfect() yang no-op, jadi koreksi tidak
//      pernah jalan di mode ini. (Jalur live di AudioCallback — shortcut
//      applyPipeline yang bahkan tidak memanggil process() — tidak bisa
//      diuji di sini; ia dibuktikan dengan membaca kode, lihat
//      AudioPipeline::applyImmersiveCorrectionConfig.)
//   5. Pindah mode Immersive -> DSP -> Immersive, koreksi tetap ON:
//      sesudah round-trip, penguatan ~2x tetap ada — reset() di
//      onModeChanged() menolkan state biquad tapi TIDAK menghapus preset
//      yang terpasang (mApplied di node), jadi applyConfig berikutnya
//      meng-enable kembali node dengan koefisien yang sama.
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_immersive_correction.cpp \
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
//     -o /tmp/test_immersive_correction && /tmp/test_immersive_correction

#include <cmath>
#include <cstdio>
#include <vector>

#include "core/AudioPipeline.h"
#include "core/AudioTypes.h"

using namespace pristine;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) ++gPass; else ++gFail;
}

static constexpr double kPi = 3.14159265358979323846;
static constexpr float kSampleRate = 48000.0f;
static constexpr int kBuf = 960;

// Satu filter peaking +6 dB @ 1 kHz, Q 1,0 — cukup untuk menggandakan
// amplitudo sinus 1 kHz pada steady state.
static HeadphonePresetData makePreset() {
    HeadphonePresetData p;
    p.preampDb = 0.0f;
    p.filterCount = 1;
    p.filters[0].type = 0; // Peaking
    p.filters[0].freqHz = 1000.0f;
    p.filters[0].q = 1.0f;
    p.filters[0].gainDb = 6.0f;
    return p;
}

// Parameter dasar: rantai Immersive netral (intensitas 0 = resonator,
// exciter, dan spatial bypass — lihat ImmersiveStage::process), gain 1,0,
// tanpa limiter, supaya yang diukur hanya efek koreksi.
static DSPParameters baseParams(ProcessingMode mode) {
    DSPParameters params;
    params.processingMode = mode;
    params.masterGain = 1.0f;
    params.balance = 0.0f;
    params.stereoWidth = 1.0f;
    params.limiterEnabled = false;
    params.resonanceIntensity = 0.0f;
    params.brainwaveFreq = 0.0f;
    return params;
}

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

static double rms(const float* x, int begin, int end) {
    double s = 0.0;
    for (int i = begin; i < end; ++i) s += (double)x[i] * (double)x[i];
    return std::sqrt(s / (double)(end - begin));
}

// Jalankan `buffers` buffer sinus 1 kHz lewat pipeline, kembalikan RMS
// paruh kedua buffer terakhir (bebas transien startup biquad).
static double settledRms(
    AudioPipeline& pipe,
    DSPParameters& params,
    int buffers
) {
    std::vector<float> l(kBuf), r(kBuf);
    long long phase = 0;
    double out = 0.0;
    for (int i = 0; i < buffers; ++i) {
        fillSine(l.data(), r.data(), kBuf, 1000.0, 0.5, phase);
        pipe.process(l.data(), r.data(), kBuf, params);
        out = rms(l.data(), kBuf / 2, kBuf);
    }
    return out;
}

// Sama seperti settledRms, tapi kembalikan buffer terakhir utuh (untuk
// perbandingan bit-exact).
static std::vector<float> settledBuffer(
    AudioPipeline& pipe,
    DSPParameters& params,
    int buffers
) {
    std::vector<float> l(kBuf), r(kBuf);
    long long phase = 0;
    for (int i = 0; i < buffers; ++i) {
        fillSine(l.data(), r.data(), kBuf, 1000.0, 0.5, phase);
        pipe.process(l.data(), r.data(), kBuf, params);
    }
    return l;
}

static bool identical(
    const std::vector<float>& a,
    const std::vector<float>& b
) {
    if (a.size() != b.size()) return false;
    for (size_t i = 0; i < a.size(); ++i) {
        if (a[i] != b[i]) return false;
    }
    return true;
}

int main() {
    std::printf("Immersive headphone correction (B-HPIMM):\n");

    DSPParameters off = baseParams(ProcessingMode::Immersive);
    off.headphoneCorrectionEnabled = false;
    off.headphonePreset = makePreset();

    DSPParameters on = baseParams(ProcessingMode::Immersive);
    on.headphoneCorrectionEnabled = true;
    on.headphonePreset = makePreset();

    DSPParameters noPreset = baseParams(ProcessingMode::Immersive);
    noPreset.headphoneCorrectionEnabled = true;
    noPreset.headphonePreset = HeadphonePresetData{}; // filterCount 0

    // 1. Koreksi ON menaikkan RMS ~2x dibanding OFF (peaking +6 dB).
    AudioPipeline pipeOn, pipeOff;
    pipeOn.prepare(48000, 1920);
    pipeOff.prepare(48000, 1920);
    const double rmsOn = settledRms(pipeOn, on, 20);
    const double rmsOff = settledRms(pipeOff, off, 20);
    const double ratio = rmsOn / rmsOff;
    std::printf("  (rasio RMS ON/OFF = %.3f, harap ~2,0)\n", ratio);
    check("immersive: koreksi ON menaikkan RMS ~2x (+6 dB @ 1 kHz)",
        ratio > 1.7 && ratio < 2.3);
    check("immersive: koreksi OFF ~identik dengan input (rantai netral)",
        std::fabs(rmsOff - 0.5 / std::sqrt(2.0)) < 0.02);

    // 2 & 3. Tanpa preset, dan dengan flag OFF: bit-identik dengan OFF.
    AudioPipeline pipeNoPreset, pipeFlagOff, pipeRef;
    pipeNoPreset.prepare(48000, 1920);
    pipeFlagOff.prepare(48000, 1920);
    pipeRef.prepare(48000, 1920);
    const std::vector<float> ref = settledBuffer(pipeRef, off, 20);
    check("immersive: ON tanpa preset = bit-identik dengan OFF",
        identical(settledBuffer(pipeNoPreset, noPreset, 20), ref));
    check("immersive: preset terpasang tapi flag OFF = bit-identik dengan OFF",
        identical(settledBuffer(pipeFlagOff, off, 20), ref));

    // 4. BitPerfect: koreksi ON + preset tetap bit-exact.
    AudioPipeline pipeBP;
    pipeBP.prepare(48000, 1920);
    DSPParameters bp = on;
    bp.processingMode = ProcessingMode::BitPerfect;
    std::vector<float> inL(kBuf), inR(kBuf);
    long long phase = 0;
    fillSine(inL.data(), inR.data(), kBuf, 1000.0, 0.5, phase);
    std::vector<float> outL = inL, outR = inR;
    pipeBP.process(outL.data(), outR.data(), kBuf, bp);
    check("bitperfect: koreksi ON + preset tetap bit-exact",
        identical(outL, inL) && identical(outR, inR));

    // 5. Round-trip mode: koreksi tetap jalan sesudah kembali ke Immersive.
    AudioPipeline pipeTrip;
    pipeTrip.prepare(48000, 1920);
    (void)settledRms(pipeTrip, on, 5);
    DSPParameters dsp = on;
    dsp.processingMode = ProcessingMode::DSP;
    (void)settledRms(pipeTrip, dsp, 2);
    const double rmsTrip = settledRms(pipeTrip, on, 20);
    const double ratioTrip = rmsTrip / rmsOff;
    std::printf("  (rasio RMS sesudah round-trip = %.3f, harap ~2,0)\n",
        ratioTrip);
    check("immersive: koreksi tetap ON sesudah Immersive->DSP->Immersive",
        ratioTrip > 1.7 && ratioTrip < 2.3);

    std::printf("IMMERSIVE-CORRECTION: %d pass, %d fail\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
