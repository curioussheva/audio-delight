// =====================================================
// core/AudioPipeline.cpp
// =====================================================

#include "AudioPipeline.h"

#include <cmath>

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

    // �� FASE D (2026-10-10): preset koreksi headphone WAJIB dibandingkan.
    //
    // Tanpa ini, memilih headphone lain saat koreksi sudah aktif tidak akan
    // terkirim ke rantai — flag-nya tidak berubah, jadi config dianggap sama.
    // Bug-nya senyap: UI berubah, suara tidak.
    if (a.headphoneCorrectionEnabled != b.headphoneCorrectionEnabled) {
        return false;
    }

    if (a.headphonePreset.preampDb != b.headphonePreset.preampDb) {
        return false;
    }

    if (a.headphonePreset.filterCount != b.headphonePreset.filterCount) {
        return false;
    }

    for (int i = 0; i < a.headphonePreset.filterCount; ++i) {

        const auto& fa = a.headphonePreset.filters[i];
        const auto& fb = b.headphonePreset.filters[i];

        if (fa.type != fb.type) return false;
        if (fa.freqHz != fb.freqHz) return false;
        if (fa.q != fb.q) return false;
        if (fa.gainDb != fb.gainDb) return false;
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

    // 🔥 FASE D (2026-10-10): preset koreksi headphone ikut dikirim.
    //
    // Bandingkan juga di dspConfigEquals — preset berubah tanpa flag berubah
    // harus tetap terkirim, kalau tidak, memilih headphone lain saat koreksi
    // sudah aktif tidak akan terdengar.
    mDspConfig.headphoneCorrectionEnabled =
        params.headphoneCorrectionEnabled;

    mDspConfig.headphonePreset =
        params.headphonePreset;

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
    // TIGA MODE TERPISAH - IMMERSIVE TANPA DSPChain
    // =============================================
    //
    // Sebelumnya blok ini memanggil `applyDSPConfig(params)` lalu
    // `mDSP.process()` lebih dulu, sehingga EQ, bass boost, dan pelebar
    // stereo IKUT memproses di mode Immersive. Akibatnya mode tidak
    // benar-benar terpisah: kontrol EQ diam-diam mengubah suara immersive.
    //
    // Sekarang immersive murni: hanya rantai resonansinya sendiri.
    //
    // Master gain dan balance tetap berlaku, karena keduanya soal LEVEL dan
    // PANORAMA output, bukan karakter suara. Tanpa keduanya, slider volume
    // di mode immersive akan diam saja.

    // ---- Master gain & balance -------------------------------------------

    const float gain = params.masterGain;
    const float bal = params.balance;

    // Constant-power pan: jumlah kuadrat kiri+kanan tetap 1, jadi
    // memindahkan balance tidak mengubah persepsi kekerasan.
    const float balClamped = bal < -1.0f ? -1.0f : (bal > 1.0f ? 1.0f : bal);
    const float angle = (balClamped + 1.0f) * 0.25f * 3.14159265f;
    const float gainL = gain * std::cos(angle);
    const float gainR = gain * std::sin(angle);

    // Lewati kalau benar-benar netral supaya tidak ada pembulatan tak perlu.
    if (gainL != 1.0f || gainR != 1.0f) {
        for (int32_t i = 0; i < frames; ++i) {
            left[i] *= gainL;
            right[i] *= gainR;
        }
    }

    // =============================================
    // IMMERSIVE CHAIN
    // =============================================
    //
    // Rantai nyata (Solfeggio -> Harmonic -> Spatial -> Brainwave).
    mImmersive.process(
        left,
        right,
        frames,
        params
    );
}

} // namespace pristine 