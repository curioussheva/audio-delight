#pragma once

#include "../graph/DSPNode.h"

namespace pristine {

class GainNode : public DSPNode {
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

    void setGain(
        float left,
        float right
    );

private:

    // =============================================
    // SMOOTHING (C-SMOOTH, 2026-11-12)
    // =============================================
    //
    // Dulu applyConfig() -> setGain() langsung menimpa gain yang dipakai
    // process() — perubahan masterGain/balance (tiap buffer bila berubah,
    // AudioCallback::updateParameters + dedup AudioPipeline::applyDSPConfig)
    // melompat seketika: zipper noise saat slider digeser.
    //
    // Sekarang target dan nilai-pakai dipisah: setGain() hanya menulis
    // target, process() mendekatinya per sample dengan one-pole — pola,
    // konstanta (kSmooth = 0,002f, ~10 ms @48 kHz) dan ambang settle
    // (1e-4f) yang SAMA dengan SpatialFieldProcessor::process().
    // Nilai akhir TIDAK berubah: begitu sampai, gain persis target.
    //
    // Prime seperti SpatialFieldProcessor: setGain pertama langsung
    // menyamakan nilai-pakai dengan target, supaya render pertama tidak
    // menyapu dari default 1,0. reset() men-snap ke target (mode switch
    // tidak mewarisi sapuan lama).
    //
    // Biaya: nol saat sudah settle — process() mendelegasikan ke
    // GainProcessor (NEON) seperti dulu. Loop skalar per sample hanya
    // jalan selama transisi (puluhan ms). Tanpa alokasi.

    static constexpr float kSmooth = 0.002f;
    static constexpr float kSettledEps = 1e-4f;

    float mTargetGainL = 1.0f;
    float mTargetGainR = 1.0f;

    float mCurrentGainL = 1.0f;
    float mCurrentGainR = 1.0f;

    bool mPrimed = false;
};

} // namespace pristine
