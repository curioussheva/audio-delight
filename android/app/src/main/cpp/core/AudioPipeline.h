#pragma once

#include <cstdint>

#include "AudioTypes.h"

#include "../dsp/DSPChain.h"

#include "ImmersiveStage.h"

namespace pristine {

// =====================================================
// AUDIO PIPELINE
// Realtime DSP orchestration layer
// =====================================================

class AudioPipeline {
public:

    AudioPipeline();

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int32_t sampleRate,
        int32_t maxFrames
    );

    void reset();
    // =============================================
    // PROCESS
    // =============================================

    void process(float* left, float* right, int32_t frames, const DSPParameters& params) noexcept;

private:

    // =============================================
    // MODES
    // =============================================

    void processBitPerfect(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

    void processDSP(
        float* left,
        float* right,
        int32_t frames,
        const DSPParameters& params
    ) noexcept;

    void processImmersive(
        float* left,
        float* right,
        int32_t frames,
        const DSPParameters& params
    ) noexcept;

private:

    // =============================================
    // KONFIGURASI DSP
    // =============================================
    //
    // �� FIX (2026-10-10): `DSPChain::applyConfig()` dulu NOL pemanggil dari
    // jalur produksi — semua referensinya berputar di dalam `dsp/` sendiri.
    // Akibatnya `DSPChain::mConfig` selamanya default, dan keempat node
    // (EQ, StereoWidener, Gain, Limiter) berjalan sebagai identity:
    // mode DSP mengeluarkan PCM yang identik dengan BitPerfect.
    //
    // Sekarang config dibangun dari `DSPParameters` dan dikirim ke rantai
    // HANYA saat nilainya berubah — `applyConfig()` menghitung koefisien
    // biquad (powf/cosf/sinf), jadi memanggilnya tiap buffer akan membebani
    // audio thread tanpa manfaat.
    //
    // Lihat docs/DSP_CHAIN_AUDIT.md.
    void applyDSPConfig(
        const DSPParameters& params
    ) noexcept;

    DSPConfig mDspConfig;

    // Snapshot config yang terakhir benar-benar dikirim ke rantai. Dipakai
    // untuk mendeteksi perubahan.
    DSPConfig mAppliedConfig;

    // false = belum pernah dikirim, jadi kirim pertama selalu dilakukan.
    bool mConfigApplied = false;

    DSPChain mDSP;

    // Rantai proses mode Immersive. Dipindahkan dari cpp/modes/ImmersivePipeline
    // (dihapus 5a386f0a9) - lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.
    // Hidup sepanjang umur AudioPipeline; prepare() dipanggil saat stream dibuka.
    ImmersiveStage mImmersive;

    int32_t mSampleRate = 48000;

    int32_t mMaxFrames = 1920;
};

} // namespace pristine 