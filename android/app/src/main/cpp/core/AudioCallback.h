// =====================================================
// core/AudioCallback.h
// =====================================================

#pragma once

#include <chrono>
#include <oboe/Oboe.h>
#include "AudioBufferController.h"
#include "AudioConstants.h"
#include "AudioMetrics.h"
#include "AudioPipeline.h"
#include "AudioState.h"
#include "AudioTypes.h"
#include "DSPProcessingGate.h"
#include "../dsp/Limiter.h"
#include "../visualizer/VisualizerBuffer.h"

namespace pristine::playback {
class PlaybackController;
}

namespace pristine {

// =====================================================
// AUDIO CALLBACK
// Realtime audio thread
// =====================================================

class AudioCallback
    : public oboe::AudioStreamCallback {
public:
    AudioCallback(
        AudioBufferController& buffer,
        AudioPipeline& pipeline,
        AudioMetrics& metrics,
        AudioState& state
    );

    ~AudioCallback() override = default;

    // =============================================
    // OBOE CALLBACK
    // =============================================

    oboe::DataCallbackResult
    onAudioReady(
        oboe::AudioStream* stream,
        void* audioData,
        int32_t numFrames
    ) override;

    // =============================================
    // PLAYBACK SOURCE
    // =============================================

    void setPlaybackController(
        playback::PlaybackController* controller
    ) noexcept {
        mPlaybackController = controller;
    }

    void setSampleRate(
        int32_t sampleRate
    ) noexcept {
        mSampleRate = sampleRate;
    }

    // =============================================
    // VISUALIZER
    // =============================================

    const VisualizerBuffer&
    visualizerBuffer() const noexcept {
        return mVisualizer;
    }

private:
    // =============================================
    // REFERENCES
    // =============================================

    AudioBufferController&
        mBufferController;

    AudioPipeline&
        mPipeline;

    AudioMetrics&
        mMetrics;

    AudioState&
        mState;

    VisualizerBuffer mVisualizer;

    // =============================================
    // PLAYBACK SOURCE
    // =============================================

    playback::PlaybackController*
        mPlaybackController{nullptr};

    int32_t mSampleRate{kDefaultSampleRate};

    // (mScratchInterleaved dihapus 2026-11-10: hanya di-memset di konstruktor,
    // tidak pernah dipakai.)

    // =============================================
    // TEMP BUFFERS
    // =============================================

    float mLeft[
        kMaxFramesPerCallback
    ];

    float mRight[
        kMaxFramesPerCallback
    ];

    // =============================================
    // DSP PARAM CACHE
    // =============================================

    DSPParameters mParams;

    // =============================================
    // PIPELINE KE JALUR PRODUKSI
    // =============================================

    // Terapkan AudioPipeline (tiga mode) ke buffer interleaved hasil render().
    //
    // render() menghasilkan satu buffer interleaved; pipeline menerima dua
    // buffer terpisah (left/right). Jadi: deinterleave -> proses -> interleave.
    //
    // Memakai mLeft/mRight yang sudah ada supaya tidak ada alokasi di jalur
    // realtime (keduanya berukuran kMaxFramesPerCallback). Buffer lebih besar
    // dari kMax diproses dalam chunk ≤ kMax (C-C2, 2026-11-12) — bukan
    // dibisukan.
    void applyPipeline(
        float* interleaved,
        int32_t numFrames
    ) noexcept;

    // Beri makan visualizer dari output final interleaved saat DSP gate
    // off (C-VIZ, 2026-11-12): deinterleave ke mLeft/mRight yang sudah ada
    // lalu VisualizerBuffer::write per chunk ≤ kMaxFramesPerCallback.
    // Tanpa alokasi, tanpa lock; tidak menyentuh pipeline maupun gate.
    void feedVisualizer(
        const float* interleaved,
        int32_t numFrames
    ) noexcept;

    // =============================================
    // HELPERS
    // =============================================

    void updateParameters();

    // Metrik per callback (M5, 2026-11-10): waktu callback + beban CPU +
    // latensi output + XRun Oboe (C-XRUN, 2026-11-12; latensi dan XRun
    // di-throttle tiap 16 callback). Hanya atomic store + pemanggilan
    // Oboe yang baca shared memory (getTimestamp, getXRunCount), tanpa
    // binder — aman di audio thread.
    void updateCallbackMetrics(
        oboe::AudioStream* stream,
        int32_t numFrames,
        std::chrono::steady_clock::time_point started
    ) noexcept;

    // =============================================
    // SANITASI KELUARAN
    // =============================================
    //
    // 🔥 FIX (2026-10-10, "noise di beberapa file"): fungsi `softClip(x)` lama -
    //     x / (1 + |x|)
    // diterapkan ke SETIAP sample output tanpa syarat. Itu bukan limiter; itu
    // waveshaper yang aktif di seluruh rentang:
    //
    //     amplitudo 0.10 -> gain -0.83 dB, THD 1.62%
    //     amplitudo 0.30 -> gain -2.28 dB, THD 4.40%
    //     amplitudo 0.50 -> gain -3.52 dB, THD 6.70%
    //     amplitudo 0.90 -> gain -5.58 dB, THD 10.35%
    //     full scale 1.0 -> gain -6.02 dB (setengah amplitudo!)
    //
    // THD naik ~6.4x dari level pelan ke level keras. Itu tepat menjelaskan
    // gejala "hanya SEBAGIAN file yang noise": master yang dikompresi keras
    // punya level rata-rata tinggi, jadi distorsinya paling terdengar.
    //
    // Sekarang keluaran hanya disanitasi - nilai yang secara fisik mustahil
    // dibuang, sinyal musik lewat utuh:
    //   - NaN/Inf  -> 0
    //   - |x| > 2  -> 0  (bit pattern malloc garbage; swr_convert selalu [-1,1])
    //   - denormal -> 0  (< kDenormalThreshold = 1e-30f)
    //
    // Angka lengkap + pembuktiannya: scripts/test_noise_softclip.cpp.
    // Jalur BitPerfect tidak lagi melewati limiter apa pun di sini.
    inline void sanitizeOutput(
        float& x
    ) noexcept;
};

} // namespace pristine 