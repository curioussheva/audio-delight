// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"
#include "AudioConstants.h"
#include "../playback/PlaybackController.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <android/log.h>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioCallback::AudioCallback(
    AudioBufferController& buffer,
    AudioPipeline& pipeline,
    AudioMetrics& metrics,
    AudioState& state
)
    : mBufferController(buffer),
      mPipeline(pipeline),
      mMetrics(metrics),
      mState(state) {

    std::memset(mLeft, 0, sizeof(mLeft));
    std::memset(mRight, 0, sizeof(mRight));
    std::memset(mScratchInterleaved, 0, sizeof(mScratchInterleaved));
}

// =====================================================
// AUDIO READY
// =====================================================

oboe::DataCallbackResult
AudioCallback::onAudioReady(
    oboe::AudioStream*,
    void* audioData,
    int32_t numFrames
) {
    auto* output = static_cast<float*>(audioData);

    if (numFrames <= 0 || numFrames > kMaxFramesPerCallback) {
        std::memset(output, 0, sizeof(float) * numFrames * 2);
        return oboe::DataCallbackResult::Continue;
    }

    // =============================================
    // Jika PlaybackController tersedia, gunakan sebagai sumber audio
    // =============================================

    if (mPlaybackController) {
        __android_log_print(ANDROID_LOG_DEBUG, "AudioCallback",
                            "using PlaybackController, frames=%d", (int)numFrames);
        mPlaybackController->render(
            output,
            static_cast<uint32_t>(numFrames),
            2,                // stereo
            mSampleRate       // sample rate dari AudioStreamController
        );

        // =============================================
        // PIPELINE (tiga mode)
        // =============================================
        //
        // ð¥ FIX (2026-10-07): dulu fungsi ini `return` di sini, sehingga
        // AudioPipeline - tempat mode BitPerfect/DSP/Immersive hidup - TIDAK
        // PERNAH dipanggil saat memutar lagu. Akibatnya mode DSP tidak
        // melakukan apa pun dan bit-perfect hanya benar secara kebetulan.
        //
        // Sekarang pipeline dipanggil di belakang sakelar yang bisa dimatikan
        // tanpa revert (lihat DSPProcessingGate). Defaultnya masih perilaku
        // lama sampai diuji di perangkat.
        if (DSPProcessingGate::enabled()) {
            applyPipeline(output, numFrames);
        }

        return oboe::DataCallbackResult::Continue;
    } else {
        __android_log_print(ANDROID_LOG_DEBUG, "AudioCallback",
                            "using AudioBufferController fallback");
    }

    // =============================================
    // FALLBACK: AudioBufferController
    // =============================================

    updateParameters();

    const uint64_t readFrames = mBufferController.popStereo(
        mLeft,
        mRight,
        static_cast<uint32_t>(numFrames)
    );

    if (readFrames < static_cast<uint64_t>(numFrames)) {
        mMetrics.recordUnderrun();

        std::fill(mLeft + readFrames, mLeft + numFrames, 0.0f);
        std::fill(mRight + readFrames, mRight + numFrames, 0.0f);
    }

    if (mState.isDSPEnabled()) {
        mPipeline.process(mLeft, mRight, numFrames, mParams);
    }

    // �� FIX (2026-10-10): jalur fallback juga tidak lagi memakai waveshaper
    // lama. Mode BitPerfect hanya disanitasi; DSP/Immersive lewat limiter.
    const bool fallbackShaped =
        (mParams.processingMode != ProcessingMode::BitPerfect);

    for (int32_t i = 0; i < numFrames; ++i) {

        float l = mLeft[i];
        float r = mRight[i];

        if (fallbackShaped) {
            l = Limiter::apply(l);
            r = Limiter::apply(r);
        }

        sanitizeOutput(l);
        sanitizeOutput(r);

        output[i * 2]     = l;
        output[i * 2 + 1] = r;
    }

    mVisualizer.write(mLeft, mRight, numFrames);
    mMetrics.updateBufferedSamples(mBufferController.availableFrames());

    return oboe::DataCallbackResult::Continue;
}

// =====================================================
// ERROR AFTER CLOSE
// =====================================================

void AudioCallback::onErrorAfterClose(
    oboe::AudioStream*,
    oboe::Result
) {
    mState.setRunning(false);
}

// =====================================================
// UPDATE PARAMETERS
// =====================================================

void AudioCallback::updateParameters() {
    mParams.masterGain = mState.masterGain();
    mParams.balance = mState.balance();
    mParams.stereoWidth = mState.stereoWidth();
    mParams.dspEnabled = mState.isDSPEnabled();
    mParams.limiterEnabled = mState.isLimiterEnabled();
    mParams.solfeggioFreq = mState.solfeggioFreq();
    mParams.brainwaveFreq = mState.brainwaveFreq();
    mParams.resonanceIntensity = mState.resonanceIntensity();
    mParams.processingMode = mState.processingMode();

    // 🔥 FIX (2026-10-10): EQ 10-band + bass boost ikut dibaca.
    //
    // Dulu keduanya tidak pernah disalin, jadi walau `AudioPipeline` nanti
    // memanggil `DSPChain::applyConfig()`, `config.eqGain[]` selalu nol dan
    // EQ tetap identity. Sekarang nilainya ikut mengalir.
    //
    // 10 atomic load per buffer — di luar loop sample, jadi tidak menambah
    // beban per-frame. `relaxed` tidak dipakai; aksesornya `acquire`.
    for (int i = 0; i < 10; ++i) {
        mParams.eqGains[i] = mState.eqGain(i);
    }

    mParams.bassBoostGain = mState.bassBoost();
}

// =====================================================
// APPLY PIPELINE
// =====================================================
//
// Menjembatani bentuk buffer: render() memberi interleaved, pipeline meminta
// left/right terpisah.
//
// SELURUH loop di sini berjalan di audio thread: tanpa alokasi, tanpa lock.
// mLeft/mRight sudah dialokasikan sebagai member (kMaxFramesPerCallback).
void AudioCallback::applyPipeline(
    float* interleaved,
    int32_t numFrames
) noexcept {

    if (!interleaved || numFrames <= 0 || numFrames > kMaxFramesPerCallback) {
        return;
    }

    // Parameter dibaca SEKALI per buffer. Mode dan nilai DSP dibaca dari
    // AudioState (atomic), jadi perpindahan mode berlaku pada buffer berikutnya
    // tanpa restart stream - itu syarat live switch.
    updateParameters();

    // ---- deinterleave -----------------------------------------------------

    for (int32_t i = 0; i < numFrames; ++i) {
        mLeft[i]  = interleaved[i * 2];
        mRight[i] = interleaved[i * 2 + 1];
    }

    // ---- proses (BitPerfect / DSP / Immersive) ----------------------------

    mPipeline.process(mLeft, mRight, numFrames, mParams);

    // ---- interleave + rapi-kan --------------------------------------------
    //
    // 🔥 FIX (2026-10-10, "noise di beberapa file"): dulu di sini ada
    //     softClip(zapDenormal(x))
    // untuk SETIAP sample, di SETIAP mode. softClip lama = x/(1+|x|) —
    // nonlinear di seluruh rentang (-6.02 dB di full scale, THD 10.4% di
    // amplitudo 0.9). Itu yang terdengar sebagai noise di sebagian file.
    //
    // Sekarang mode BitPerfect TIDAK melewati limiter sama sekali — hanya
    // sanitasi:
    //   jalur BitPerfect : sanitize saja        (bit-exact, nol distorsi)
    //   jalur DSP/Immersive : limiter + sanitize (identity di bawah 0.98)
    //
    // Limiter tetap ada di DSP/Immersive karena rantai itu (EQ, harmonic
    // exciter, brainwave) bisa menaikkan level melewati full scale. Di bawah
    // ambang 0.98 ia identity, jadi tidak menambah distorsi pada sinyal biasa.
    const bool shaped =
        (mParams.processingMode != ProcessingMode::BitPerfect);

    for (int32_t i = 0; i < numFrames; ++i) {

        float l = mLeft[i];
        float r = mRight[i];

        if (shaped) {
            l = Limiter::apply(l);
            r = Limiter::apply(r);
        }

        sanitizeOutput(l);
        sanitizeOutput(r);

        interleaved[i * 2]     = l;
        interleaved[i * 2 + 1] = r;
    }

    mVisualizer.write(mLeft, mRight, numFrames);
}

// =====================================================
// SANITASI KELUARAN
// =====================================================

inline void AudioCallback::sanitizeOutput(float& x) noexcept {
    if (std::isnan(x) || std::isinf(x)) {
        x = 0.0f;
        return;
    }
    if (x > 2.0f || x < -2.0f) {
        x = 0.0f;
        return;
    }
    if (std::fabs(x) < kDenormalThreshold) {
        x = 0.0f;
    }
}

} // namespace pristine 