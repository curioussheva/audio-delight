// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"
#include "AudioConstants.h"
#include "../playback/PlaybackController.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <ctime>
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
}

// =====================================================
// AUDIO READY
// =====================================================

oboe::DataCallbackResult
AudioCallback::onAudioReady(
    oboe::AudioStream* stream,
    void* audioData,
    int32_t numFrames
) {
    auto* output = static_cast<float*>(audioData);

    // Guard (fix 2026-11-10, m1): JANGAN memset dengan numFrames <= 0 —
    // sizeof(float) * numFrames * 2 dikonversi ke size_t raksasa dan menulis
    // jauh melewati buffer (UB). numFrames > kMax tetap di-silence penuh
    // (buffer Oboe memang sebesar itu) karena pipeline tidak bisa memakai
    // scratch mLeft/mRight yang lebih kecil.
    if (numFrames <= 0) {
        return oboe::DataCallbackResult::Continue;
    }
    if (numFrames > kMaxFramesPerCallback) {
        std::memset(output, 0, sizeof(float) * numFrames * 2);
        return oboe::DataCallbackResult::Continue;
    }

    // Waktu mulai callback, untuk metrik (M5). steady_clock di audio thread:
    // tanpa alokasi, tanpa lock, hanya atomic store di akhir.
    const auto callbackStart = std::chrono::steady_clock::now();

    // =============================================
    // Jika PlaybackController tersedia, gunakan sebagai sumber audio
    // =============================================

    if (mPlaybackController) {
        // (Log DEBUG per callback dihapus 2026-11-10 (C-M2): ~50-250
        // log/detik + IPC ke logd di jalur realtime.)
        const size_t readSamples = mPlaybackController->render(
            output,
            static_cast<uint32_t>(numFrames),
            2,                // stereo
            mSampleRate       // sample rate dari AudioStreamController
        );

        // Underrun: queue tidak cukup mengisi buffer (M5). Dulu short read
        // diam-diam — counter underrun selalu 0.
        if (readSamples < static_cast<size_t>(numFrames) * 2) {
            mMetrics.recordUnderrun();
        }
        mMetrics.updateBufferedSamples(
            mPlaybackController->bufferedSamples()
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

        updateCallbackMetrics(stream, numFrames, callbackStart);
        return oboe::DataCallbackResult::Continue;
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

    // DSP-M2 (2026-11-11): sama seperti jalur utama - di mode DSP, LimiterNode
    // di graph sudah membatasi bila limiterEnabled DAN pipeline jalan. Jalur
    // fallback menggerbang pipeline di isDSPEnabled(), jadi bila flag itu
    // false, pipeline tidak jalan dan limiter callback tetap jadi
    // satu-satunya limiter.
    const bool fallbackNodeLimiterRan =
        (mParams.processingMode == ProcessingMode::DSP) &&
        mParams.limiterEnabled &&
        mState.isDSPEnabled();

    for (int32_t i = 0; i < numFrames; ++i) {

        float l = mLeft[i];
        float r = mRight[i];

        if (fallbackShaped && !fallbackNodeLimiterRan) {
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

    updateCallbackMetrics(stream, numFrames, callbackStart);
    return oboe::DataCallbackResult::Continue;
}

// =====================================================
// METRIK PER CALLBACK (M5, 2026-11-10)
// =====================================================
//
// Dulu tidak ada yang menulis metrik di jalur live — getStats() selalu
// mengembalikan callbackTimeMs=0, cpuLoad=0, latencyMs=0. Sekarang ketiganya
// diukur di sini, dengan atomic store saja (tanpa alokasi, tanpa lock).
void AudioCallback::updateCallbackMetrics(
    oboe::AudioStream* stream,
    int32_t numFrames,
    std::chrono::steady_clock::time_point started
) noexcept {
    // Waktu callback: durasi kerja onAudioReady ini.
    const auto now = std::chrono::steady_clock::now();
    const float callbackMs =
        std::chrono::duration<float, std::milli>(now - started).count();
    mMetrics.updateCallbackTimeMs(callbackMs);

    // Beban CPU: fraksi periode realtime yang dipakai callback ini.
    // Periode = numFrames / sampleRate. >1.0 = callback tidak selesai
    // sebelum buffer berikutnya diminta (xrun menunggu).
    if (mSampleRate > 0 && numFrames > 0) {
        const float periodMs =
            static_cast<float>(numFrames) * 1000.0f /
            static_cast<float>(mSampleRate);
        if (periodMs > 0.0f) {
            mMetrics.updateCpuLoad(callbackMs / periodMs);
        }
    }

    // Latensi output: frame yang sudah ditulis tapi belum sampai ke speaker,
    // dari timestamp Oboe. Di-throttle tiap 16 callback (~160 ms) — cukup
    // untuk diagnostik, tanpa membebani jalur realtime. getTimestamp()
    // AAudio hanya baca shared memory (tanpa binder); kalau gagal (mis.
    // OpenSLES), latensi lama dipertahankan.
    static uint32_t latencyCounter = 0;
    if (stream != nullptr && (++latencyCounter % 16) == 0) {
        const auto ts = stream->getTimestamp(CLOCK_MONOTONIC);
        // Oboe ResultWithValue: error()/value() adalah METHOD, bukan field
        // (diperbaiki 2026-11-10 setelah build 42811297970 gagal kompilasi).
        if (ts.error() == oboe::Result::OK && mSampleRate > 0) {
            const int64_t framesInFlight =
                stream->getFramesWritten() - ts.value().position;
            if (framesInFlight >= 0) {
                const float latencyMs =
                    static_cast<float>(framesInFlight) * 1000.0f /
                    static_cast<float>(mSampleRate);
                mMetrics.updateLatencyMs(latencyMs);
            }
        }
    }
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

    // 🔥 FASE D (2026-10-10): preset koreksi headphone ikut dibaca.
    //
    // Yang disalin hanya POD (~272 byte), dan itu di luar loop sample.
    // Seqlock di AudioState memastikan pembacaan konsisten walau UI thread
    // sedang menulis preset baru. Kalau tidak ada preset, filterCount = 0 dan
    // node koreksi dilewati sepenuhnya.
    mParams.headphoneCorrectionEnabled =
        mState.isHeadphoneCorrectionEnabled();

    mState.headphonePreset(
        mParams.headphonePreset
    );
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
    //   jalur DSP       : limiter (node) + sanitize - limiter callback
    //                     dilewati, lihat DSP-M2 di bawah
    //   jalur Immersive : limiter (callback) + sanitize
    //
    // Limiter tetap ada di DSP/Immersive karena rantai itu (EQ, harmonic
    // exciter, brainwave) bisa menaikkan level melewati full scale. Di bawah
    // ambang 0.98 ia identity, jadi tidak menambah distorsi pada sinyal biasa.
    const bool shaped =
        (mParams.processingMode != ProcessingMode::BitPerfect);

    // 🔥 FIX (2026-11-11, DSP-M2): di mode DSP, LimiterNode di graph SUDAH
    // membatasi (bila limiterEnabled) - limiter callback di sini akan jadi
    // yang kedua (puncak 1,5 -> 0,9993 sekali vs 0,9898 dua kali, + CPU 2x).
    // Lewati limiter callback bila node sudah menjalankannya. Bila user
    // mematikan limiter (limiterEnabled=false), node di-skip graph dan
    // callback ini tetap jadi satu-satunya limiter - jadi kondisi ini harus
    // memeriksa limiterEnabled, bukan sekadar mode. Mode Immersive tetap
    // lewat callback (processImmersive tidak menyentuh DSPChain).
    const bool nodeLimiterRan =
        (mParams.processingMode == ProcessingMode::DSP) &&
        mParams.limiterEnabled;

    for (int32_t i = 0; i < numFrames; ++i) {

        float l = mLeft[i];
        float r = mRight[i];

        if (shaped && !nodeLimiterRan) {
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