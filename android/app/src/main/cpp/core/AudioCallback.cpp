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
    // jauh melewati buffer (UB).
    if (numFrames <= 0) {
        return oboe::DataCallbackResult::Continue;
    }
    // (C-C2, 2026-11-12): guard lama `numFrames > kMaxFramesPerCallback`
    // membisukan SELURUH buffer (memset + return) tanpa log/metrik.
    // kMax = 1920 frame (40 ms @48k) tercapai bila framesPerBurst > 1920 —
    // mis. stream 192 kHz burst 20 ms = 3840 frame → senyap di SETIAP
    // callback. Sekarang buffer besar diproses dalam chunk ≤ kMax: jalur
    // utama lewat applyPipeline() (chunk di dalam), jalur fallback lewat
    // loop chunk di bawah. Tidak ada memset pengganti: render() sudah
    // zero-fill seluruh buffer yang diminta (clearing_/paused/shortfall —
    // PlaybackController.cpp:704,725,900), dan jalur fallback mengisi ekor
    // pendek per chunk dengan std::fill seperti sebelumnya.

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
        } else {
            // (C-VIZ, 2026-11-12): gate off mematikan DSP, bukan
            // visualizer — tapi mVisualizer.write() sebelumnya hanya
            // dipanggil dari applyPipeline() (jalur live) dan jalur
            // fallback. Jadi saat user mematikan DSP gate di Settings,
            // spectrogram/visualizer gelap walau musik tetap jalan.
            // Feed visualizer dari output final (buffer interleaved hasil
            // render(), yang langsung ke speaker bila gate off) lewat tap
            // deinterleave yang sama — tanpa menyentuh pipeline/gate.
            feedVisualizer(output, numFrames);
        }

        updateCallbackMetrics(stream, numFrames, callbackStart);
        return oboe::DataCallbackResult::Continue;
    }

    // =============================================
    // FALLBACK: AudioBufferController
    // =============================================
    //
    // (C-C2, 2026-11-12): popStereo() memakai buffer stack internal sebesar
    // kMax dan mLeft/mRight juga sebesar kMax — keduanya tidak sanggup
    // menampung numFrames > kMax. Menghapus guard bisu di atas tanpa
    // men-chunk jalur ini akan mengubah overflow stack di popStereo menjadi
    // overflow mLeft/mRight. Jadi jalur ini ikut di-chunk; numFrames <= kMax
    // tetap satu chunk, perilaku identik kecuali satu perbaikan: popStereo
    // all-or-nothing per panggilan, jadi buffer yang tadinya hanya cukup
    // untuk sebagian chunk kini mengalirkan chunk yang cukup itu (dulu
    // seluruh buffer gagal pop) — underrun tetap dicatat sekali per callback.

    // Parameter dibaca SEKALI per buffer, di luar loop chunk.
    updateParameters();

    // �� FIX (2026-10-10): jalur fallback juga tidak lagi memakai waveshaper
    // lama. Mode BitPerfect hanya disanitasi; DSP/Immersive lewat limiter.
    const bool fallbackShaped =
        (mParams.processingMode != ProcessingMode::BitPerfect);

    // DSP-M2 (2026-11-11): sama seperti jalur utama - di mode DSP, LimiterNode
    // di graph sudah membatasi bila limiterEnabled DAN pipeline jalan. Jalur
    // fallback menggerbang pipeline di isDSPEnabled(), jadi bila flag itu
    // false, pipeline tidak jalan dan limiter callback tetap jadi
    // satu-satunya limiter.
    const bool fallbackDspEnabled = mState.isDSPEnabled();
    const bool fallbackNodeLimiterRan =
        (mParams.processingMode == ProcessingMode::DSP) &&
        mParams.limiterEnabled &&
        fallbackDspEnabled;

    bool fallbackUnderrun = false;

    for (int32_t offset = 0;
         offset < numFrames;
         offset += kMaxFramesPerCallback) {

        const int32_t chunkFrames = std::min(
            kMaxFramesPerCallback,
            numFrames - offset
        );

        const uint64_t readFrames = mBufferController.popStereo(
            mLeft,
            mRight,
            static_cast<uint32_t>(chunkFrames)
        );

        if (readFrames < static_cast<uint64_t>(chunkFrames)) {
            fallbackUnderrun = true;

            std::fill(mLeft + readFrames, mLeft + chunkFrames, 0.0f);
            std::fill(mRight + readFrames, mRight + chunkFrames, 0.0f);
        }

        if (fallbackDspEnabled) {
            mPipeline.process(mLeft, mRight, chunkFrames, mParams);
        }

        float* outChunk = output + offset * 2;

        for (int32_t i = 0; i < chunkFrames; ++i) {

            float l = mLeft[i];
            float r = mRight[i];

            if (fallbackShaped && !fallbackNodeLimiterRan) {
                l = Limiter::apply(l);
                r = Limiter::apply(r);
            }

            sanitizeOutput(l);
            sanitizeOutput(r);

            outChunk[i * 2]     = l;
            outChunk[i * 2 + 1] = r;
        }

        // Visualizer: write per-sample ke ring buffer — menulis N frame
        // dalam chunk menghasilkan isi ring yang sama dengan satu write.
        mVisualizer.write(mLeft, mRight, chunkFrames);
    }

    if (fallbackUnderrun) {
        mMetrics.recordUnderrun();
    }

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
    //
    // (C-P1, 2026-11-12): return headphonePreset() dulu bool yang dibuang
    // pemanggil — Busy (penulisan berlangsung) dan None (tidak ada preset)
    // sama-sama false, dan `out` sudah ditulis SEBELUM cek seq, jadi data
    // yang mungkin robek tetap masuk mParams. Sekarang ketiganya dipisah:
    // Busy mempertahankan preset buffer sebelumnya, None membersihkan
    // preset lama, Ok memakai salinan konsisten yang baru.
    mParams.headphoneCorrectionEnabled =
        mState.isHeadphoneCorrectionEnabled();

    switch (
        mState.headphonePreset(
            mParams.headphonePreset
        )
    ) {
        case PresetRead::Ok:
            // mParams.headphonePreset sudah berisi salinan konsisten.
            break;
        case PresetRead::None:
            // Tidak ada preset terpasang: pastikan preset lama dari buffer
            // sebelumnya tidak tertinggal dan terus diterapkan.
            mParams.headphonePreset = HeadphonePresetData{};
            break;
        case PresetRead::Busy:
            // Penulisan sedang berlangsung: headphonePreset() TIDAK menyentuh
            // `out`, jadi mParams.headphonePreset masih berisi preset buffer
            // sebelumnya — pertahankan, jangan pakai data setengah tertulis.
            break;
    }
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

    if (!interleaved || numFrames <= 0) {
        return;
    }

    // (C-C2, 2026-11-12): buffer lebih besar dari kMax diproses dalam chunk
    // ≤ kMaxFramesPerCallback, bukan dibisukan dan bukan di-return dini.
    // Semua node di bawah memproses per sample dengan state yang dibawa
    // antar pemanggilan (biquad EQ/koreksi headphone, resonator Solfeggio,
    // pelebar stereo, limiter stateless, generator brainwave) — memotong di
    // batas chunk TIDAK mengubah output dibanding satu pemanggilan penuh.
    // numFrames <= kMax tetap satu chunk, perilaku identik; yang berubah
    // hanya numFrames > kMax yang dulu senyap kini diproses.

    // Parameter dibaca SEKALI per buffer, di luar loop chunk. Mode dan nilai
    // DSP dibaca dari AudioState (atomic), jadi perpindahan mode berlaku pada
    // buffer berikutnya tanpa restart stream - itu syarat live switch.
    updateParameters();

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
    //
    // `shaped`/`nodeLimiterRan` hanya bergantung pada mParams yang sudah
    // tetap untuk buffer ini — hitung sekali di luar loop chunk.
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

    for (int32_t offset = 0;
         offset < numFrames;
         offset += kMaxFramesPerCallback) {

        const int32_t chunkFrames = std::min(
            kMaxFramesPerCallback,
            numFrames - offset
        );

        float* chunk = interleaved + offset * 2;

        // ---- deinterleave (chunk) -----------------------------------------

        for (int32_t i = 0; i < chunkFrames; ++i) {
            mLeft[i]  = chunk[i * 2];
            mRight[i] = chunk[i * 2 + 1];
        }

        // ---- proses (BitPerfect / DSP / Immersive) ------------------------

        mPipeline.process(mLeft, mRight, chunkFrames, mParams);

        // ---- interleave + rapi-kan (chunk) --------------------------------

        for (int32_t i = 0; i < chunkFrames; ++i) {

            float l = mLeft[i];
            float r = mRight[i];

            if (shaped && !nodeLimiterRan) {
                l = Limiter::apply(l);
                r = Limiter::apply(r);
            }

            sanitizeOutput(l);
            sanitizeOutput(r);

            chunk[i * 2]     = l;
            chunk[i * 2 + 1] = r;
        }

        // Visualizer: write per-sample ke ring buffer — menulis N frame
        // dalam chunk menghasilkan isi ring yang sama dengan satu write.
        mVisualizer.write(mLeft, mRight, chunkFrames);
    }
}

// =====================================================
// VISUALIZER FEED (C-VIZ, 2026-11-12)
// =====================================================
//
// Memberi makan visualizer dari output final interleaved, dipakai saat
// DSP gate off (onAudioReady tidak memanggil applyPipeline()).
//
// Pilihan tap: deinterleave ke mLeft/mRight yang sudah ada, BUKAN API
// sadar-stride baru di VisualizerBuffer — write(left, right, frames)
// sudah men-sanitize per sample (V-M1), dan pola chunk ≤ kMax ini sama
// persis dengan yang dipakai applyPipeline/jalur fallback, jadi tidak ada
// jalur mixdown kedua yang harus dijaga tetap sinkron. Tanpa alokasi,
// tanpa lock, di audio thread.
//
// Catatan: di branch gate-on, applyPipeline memberi makan visualizer dari
// mLeft/mRight pasca-pipeline tapi pra-limiter/sanitize callback (limiter
// identity di bawah 0.98, dan write() sendiri men-sanitize) — jadi kedua
// branch memberi makan visualizer dari sinyal yang didengar user.
void AudioCallback::feedVisualizer(
    const float* interleaved,
    int32_t numFrames
) noexcept {

    if (!interleaved || numFrames <= 0) {
        return;
    }

    // (C-C2): buffer lebih besar dari kMax diproses dalam chunk
    // ≤ kMaxFramesPerCallback — mLeft/mRight hanya sebesar itu.
    for (int32_t offset = 0;
         offset < numFrames;
         offset += kMaxFramesPerCallback) {

        const int32_t chunkFrames = std::min(
            kMaxFramesPerCallback,
            numFrames - offset
        );

        const float* chunk = interleaved + offset * 2;

        for (int32_t i = 0; i < chunkFrames; ++i) {
            mLeft[i]  = chunk[i * 2];
            mRight[i] = chunk[i * 2 + 1];
        }

        // Visualizer: write per-sample ke ring buffer — menulis N frame
        // dalam chunk menghasilkan isi ring yang sama dengan satu write.
        mVisualizer.write(mLeft, mRight, chunkFrames);
    }
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