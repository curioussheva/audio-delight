// =====================================================
// core/AudioPipeline.cpp
// =====================================================

#include "AudioPipeline.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioPipeline::AudioPipeline() = default;

// =====================================================
// PREPARE
// =====================================================

void AudioPipeline::prepare(
    int32_t sampleRate,
    int32_t maxFrames
) {

    mSampleRate =
        sampleRate;

    mMaxFrames =
        maxFrames;

    mDSP.prepare(
        sampleRate,
        maxFrames
    );

    // Immersive ikut disiapkan di sini, bukan saat mode dipilih: perpindahan
    // mode harus bisa terjadi live, dan menyiapkan rantai resonan di audio
    // thread saat user menekan tombol berarti alokasi + perhitungan koefisien
    // di jalur realtime.
    mImmersive.prepare(sampleRate);
}

// =====================================================
// RESET
// =====================================================

void AudioPipeline::reset() {

    mDSP.reset();

    mImmersive.reset();
}

// =====================================================
// PROCESS
// =====================================================

void AudioPipeline::process(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    switch (
        params.processingMode
    ) {

        case ProcessingMode::BitPerfect:

            processBitPerfect(
                left,
                right,
                frames
            );

            break;

        case ProcessingMode::DSP:

            processDSP(
                left,
                right,
                frames,
                params
            );

            break;

        case ProcessingMode::Immersive:

            processImmersive(
                left,
                right,
                frames,
                params
            );

            break;
    }
}

// =====================================================
// BIT PERFECT
// =====================================================

void AudioPipeline::processBitPerfect(
    float*,
    float*,
    int32_t
) noexcept {

    // intentionally bypass all DSP
}

// =====================================================
// DSP
// =====================================================

void AudioPipeline::processDSP(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    // 🔥 FIX (2026-10-10): dulu parameter di sini TIDAK diberi nama dan tidak
    // dipakai sama sekali — `mDSP.process()` jalan dengan `DSPChain::mConfig`
    // default, sehingga EQ/gain/width semuanya identity.
    applyDSPConfig(params);

    mDSP.process(
        left,
        right,
        frames
    );
}

// =====================================================
// KONFIGURASI DSP
// =====================================================

namespace {

// Bandingkan config yang akan dikirim dengan yang sudah terpasang.
//
// Hanya field yang benar-benar DIBACA node `DSPChain` yang ikut dibandingkan:
// EQ 10 band, bass boost, master gain, balance, stereo width, limiter.
// Field immersive (solfeggioFreq, brainwaveFreq, resonanceIntensity) tidak
// ikut — `ImmersiveStage` membacanya langsung dari `DSPParameters`, bukan
// lewat `DSPConfig`.
bool dspConfigEquals(
    const DSPConfig& a,
    const DSPConfig& b
) noexcept {

    if (a.enabled != b.enabled) return false;
    if (a.limiterEnabled != b.limiterEnabled) return false;
    if (a.mode != b.mode) return false;

    if (a.masterGain != b.masterGain) return false;
    if (a.balance != b.balance) return false;
    if (a.stereoWidth != b.stereoWidth) return false;
    if (a.bassBoost != b.bassBoost) return false;

    for (int i = 0; i < 10; ++i) {
        if (a.eqGain[i] != b.eqGain[i]) return false;
    }

    return true;
}

} // namespace

void AudioPipeline::applyDSPConfig(
    const DSPParameters& params
) noexcept {

    mDspConfig.enabled = true;
    mDspConfig.limiterEnabled = params.limiterEnabled;
    mDspConfig.mode = params.processingMode;

    mDspConfig.masterGain = params.masterGain;
    mDspConfig.balance = params.balance;
    mDspConfig.stereoWidth = params.stereoWidth;
    mDspConfig.bassBoost = params.bassBoostGain;

    for (int i = 0; i < 10; ++i) {
        mDspConfig.eqGain[i] = params.eqGains[i];
    }

    // `enabled` sengaja SELALU true, bukan `params.dspEnabled`.
    //
    // `dspEnabled` adalah flag lama yang tidak punya pemanggil di JS dan
    // defaultnya false. Kalau ia dipakai sebagai gerbang, `DSPChain::process()`
    // akan langsung `return` dan mode DSP tetap tidak berefek — persis bug yang
    // sedang diperbaiki. Gerbang yang sah adalah mode itu sendiri: fungsi ini
    // hanya dipanggil dari cabang DSP/Immersive.
    //
    // Lihat docs/DSP_CHAIN_AUDIT.md § "dspEnabled/limiterEnabled".

    if (mConfigApplied && dspConfigEquals(mDspConfig, mAppliedConfig)) {
        return;
    }

    mDSP.applyConfig(mDspConfig);

    mAppliedConfig = mDspConfig;
    mConfigApplied = true;
}

// =====================================================
// IMMERSIVE
// =====================================================

void AudioPipeline::processImmersive(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    // =============================================
    // BASE DSP
    // =============================================
    //
    // �� FIX (2026-10-10): mode Immersive menjalankan `DSPChain` lebih dulu
    // (EQ/gain/width), lalu rantai resonan. Tanpa applyDSPConfig di sini,
    // bagian base-nya tetap identity — sama seperti mode DSP sebelumnya.
    applyDSPConfig(params);

    mDSP.process(
        left,
        right,
        frames
    );

    // =============================================
    // IMMERSIVE CHAIN
    // =============================================
    //
    // Rantai nyata (Solfeggio -> Harmonic -> Spatial -> Brainwave), dipindahkan
    // dari cpp/modes/ImmersivePipeline. Sebelumnya blok ini hanya komentar
    // "FUTURE" - sekarang benar-benar memproses.
    mImmersive.process(
        left,
        right,
        frames,
        params
    );
}

} // namespace pristine 