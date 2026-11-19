#pragma once

#include "../graph/DSPNode.h"

#include <cstddef>
#include <vector>

namespace pristine {

// =====================================================
// REVERB PARAMS — pemetaan preset Android PresetReverb
// =====================================================
//
// Daftar preset TIDAK diubah (0..6, sama seperti ReverbDropdown +
// REVERB_PRESET_MAP di JS): 0 Off, 1 Small Room, 2 Medium Room,
// 3 Large Room, 4 Medium Hall, 5 Large Hall, 6 Plate. Yang baru
// adalah mesinnya: dulu angka ini berhenti di stub Kotlin
// (keputusan 2026-11-14), sekarang tiap angka memetakan ke parameter
// filter di bawah lewat ReverbParams::fromPreset().
//
// `roomSize` 0..1 -> feedback comb 0.50..0.84 (batas atas < 1 =
// stabil; lihat ReverbNode.cpp). `damp` 0..1 = seberapa kuat lowpass
// satu-kutub di loop comb (1 = gelap, 0 = terang — Plate paling
// terang, 0.10). `wet`/`dry` = campuran keluaran.
struct ReverbParams {
    float roomSize = 0.0f;  // 0..1
    float damp = 0.0f;      // 0..1
    float wet = 0.0f;       // 0..1
    float dry = 1.0f;       // 0..1

    static ReverbParams fromPreset(int preset);
};

class ReverbNode : public DSPNode {
public:

    // =================================================
    // ALGORITMA — Freeverb / Schroeder-Moorer
    // =================================================
    //
    // Dipilih karena: tanpa dependensi baru (hanya delay line +
    // aritmetika float), CPU ringan, stabilitas terbukti (feedback
    // comb < 1, allpass |g| < 1), dan karakternya cocok untuk preset
    // ruang/aula/plate. BUKAN konvolver (butuh IR + FFT, mahal) dan
    // bukan feedback-delay-network generik (lebih banyak penyetelan
    // tanpa keuntungan yang terukur untuk 7 preset ini).
    //
    // Per kanal: 4 comb lowpass-feedback paralel (tuning Freeverb
    // klasik, diskalakan ke laju sampel) -> 2 allpass seri. Kanal
    // kanan memakai delay comb +23 sampel (spread stereo Freeverb)
    // supaya ekor tidak identik di kedua telinga.
    //
    // Freeverb asli memakai 8 comb + 4 allpass; di sini 4 + 2 —
    // ekor sedikit kurang rapat, tapi biaya per sampel turun ~50%
    // dan untuk pemutar di HP perbedaannya di bawah ambang yang
    // berarti. Estimasi beban: ~25 flop/sample/kanal (~50 stereo)
    // -> ~2,4 Mflop/detik @48 kHz, < 0,1% satu core. Saat preset 0
    // (dan sesudah fade wet selesai) process() langsung return —
    // biaya NOL, sama seperti sebelum node ini ada.
    //
    // Transisi preset: wet/dry dihaluskan one-pole (kSmooth yang
    // SAMA dengan GainNode, ~10 ms @48 kHz) supaya ganti preset
    // tidak mengklik. Feedback/damp berubah langsung (di dalam loop
    // feedback — tidak ada risiko klik, hanya karakter ekor berubah).
    // 0 -> preset: delay line dibersihkan dulu (reset) supaya ekor
    // basi dari pemakaian sebelumnya tidak meledak keluar.

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

private:

    struct Comb {
        std::vector<float> buf;
        std::size_t idx = 0;
        float filterStore = 0.0f;
    };

    struct Allpass {
        std::vector<float> buf;
        std::size_t idx = 0;
    };

    struct Channel {
        Comb combs[4];
        Allpass allpasses[2];
    };

    float processChannel(Channel& ch, float input, float feedback, float damp);

    // Tuning Freeverb klasik @44,1 kHz (delay dalam sampel).
    static constexpr int kCombTunings[4] = {1116, 1277, 1422, 1617};
    static constexpr int kAllpassTunings[2] = {556, 441};
    static constexpr int kStereoSpread = 23;  // sampel @44,1 kHz
    static constexpr float kAllpassFeedback = 0.5f;
    static constexpr float kSmooth = 0.002f;  // sama dengan GainNode
    static constexpr float kSettledEps = 1e-4f;

    int mSampleRate = 48000;
    int mPreset = 0;
    ReverbParams mParams;

    Channel mLeft;
    Channel mRight;

    float mWetTarget = 0.0f;
    float mDryTarget = 1.0f;
    float mWetCurrent = 0.0f;
    float mDryCurrent = 1.0f;
    bool mPrimed = false;
};

} // namespace pristine
