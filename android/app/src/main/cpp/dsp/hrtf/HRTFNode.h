// =====================================================
// dsp/hrtf/HRTFNode.h
// =====================================================
//
// HRTF virtual-speaker node (DSP mode, 2026-11-19).
//
// Merender mix stereo sebagai DUA virtual speaker di depan
// (±30° azimuth, 0° elevation) lewat konvolusi HRIR KEMAR
// (SADIE II, DFC, 48 kHz — lihat hrir_kemar_dfc48.h):
//
//   outL = L * h_LL(+30°) + R * h_LL(330°)
//   outR = L * h_RL(+30°) + R * h_RL(330°)
//
// Empat konvolusi, tanpa downmix: tiap kanal mix adalah satu
// sumber mono untuk satu virtual speaker. File mono (L == R)
// menjadi phantom centre dengan sendirinya.
//
// PEMETAAN AZIMUTH — TERKOREKSI DARI DATA, BUKAN DARI REPORT:
//   Laporan desain §4.1 menulis "kiri -> -30°" — TERBALIK.
//   Verifikasi empiris atas file SOFA (lihat hrir_kemar_dfc48.h +
//   dsp/hrtf/README.md): azimuth SADIE bertambah berlawanan jarum
//   jam dari depan, jadi +30° = 30° ke KIRI (telinga kiri memimpin,
//   ITD 12 sampel) dan 330° (= -30°) = 30° ke KANAN. Pemetaan di
//   bawah mengikuti data terukur.
//
// Rantai: sesudah ReverbNode, sebelum GainNode (keputusan user).
// Ekor reverb ikut ter-spatialisasi; gain mengatur level akhir
// termasuk trim HRIR; limiter tetap terakhir.
//
// Kontrak (pola ReverbNode):
//   - Node SELALU enabled di graph; applyConfig hanya mengatur
//     target wet (0/1). Alasannya: graph melewatkan node yang
//     disabled, sehingga fade-out tidak mungkin terjadi (potong
//     keras = klik). Dengan pola ini toggle dihaluskan one-pole
//     ~10 ms (kSmooth yang sama dengan GainNode/ReverbNode).
//   - Wet settle di 0 -> process() langsung return: passthrough
//     bit-exact, biaya NOL — sama seperti ReverbNode preset 0.
//   - OFF -> ON: convolver di-reset dulu (ekor basi tidak boleh
//     meledak keluar), lalu wet fade-in.
//   - Kernel gagal dimuat (mis. laju stream di luar jangkauan):
//     node inert (passthrough) — tidak pernah membisukan audio.
//   - Bit-perfect: node hanya hidup di DSPChain (processDSP);
//     processBitPerfect() no-op dan fast path melewatkan
//     updateParameters() — bypass struktural, bukan flag.
//
// Latensi: convolver partitioned menunda sinyal tepat satu blok
// (256 sampel = 5,3 ms @48 kHz). Dry TIDAK ikut ditunda: selama
// fade ~10 ms ada ketidakselarasan fasa sementara antara dry dan
// wet (comb sesaat), tapi tidak ada diskontinuitas nilai di ujung
// mana pun — dan saat wet settle, output murni wet (latensi
// konstan, tidak terdengar untuk pemutar musik).
//
// SPDX-License-Identifier: MIT

#pragma once

#include "../graph/DSPNode.h"
#include "../convolution/UniformPartitionedConvolver.h"

#include <vector>

namespace pristine {

class HRTFNode : public DSPNode {
public:

    void prepare(
        int sampleRate,
        int maxFrames
    ) override;

    void reset() override;

    void process(
        float* left,
        float* right,
        int count
    ) override;

    void applyConfig(
        const DSPConfig& config
    ) override;

    // Untuk host test / diagnostik.
    inline bool kernelsReady() const { return mKernelsReady; }
    inline float wetCurrent() const { return mWetCurrent; }

private:

    // Muat 4 kernel untuk laju stream: 48 kHz = header apa adanya
    // (x trim); laju lain = windowed-sinc resample. Return false
    // bila kernel tidak bisa dimuat (node inert).
    bool loadKernels(int sampleRate);

    // Resample satu HRIR sekali jalan (prepare-time saja, bukan
    // realtime): Blackman-windowed sinc. Ditulis di sini — BUKAN
    // memakai SincResampler — karena process() SincResampler
    // ternyata stub yang fallback ke interpolasi linear (lihat
    // resampler/SincResampler.cpp), yang akan menghaluskan onset
    // tajam dan detail pinna HRIR. Matematikanya sama dengan
    // koefisien yang dibangun configure() SincResampler.
    static bool resampleKernel(
        const float* in,
        int inLen,
        int inRate,
        float* out,
        int outLen,
        int outRate
    );

    void resetConvolvers();

    // L source -> L ear (virtual speaker kiri, SADIE +30°).
    UniformPartitionedConvolver mConvLL;
    // L source -> R ear.
    UniformPartitionedConvolver mConvLR;
    // R source -> L ear (virtual speaker kanan, SADIE 330°).
    UniformPartitionedConvolver mConvRL;
    // R source -> R ear.
    UniformPartitionedConvolver mConvRR;

    // Scratch per panggilan process() (dialokasikan di prepare()).
    std::vector<float> mTmpLL;
    std::vector<float> mTmpLR;
    std::vector<float> mTmpRL;
    std::vector<float> mTmpRR;

    int mSampleRate = 48000;
    int mMaxFrames = 0;
    bool mKernelsReady = false;

    float mWetTarget = 0.0f;
    float mWetCurrent = 0.0f;

    // Sama dengan GainNode / ReverbNode (~10 ms @48 kHz).
    static constexpr float kSmooth = 0.002f;
    static constexpr float kSettledEps = 1e-4f;
};

} // namespace pristine
