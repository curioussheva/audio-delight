// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"
#include "AudioConstants.h"
#include "../playback/PlaybackController.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <ctime>
#include <android/log.h>

namespace pristine {

// =====================================================
// FPCR FLUSH-TO-ZERO (C-FTZ, 2026-11-12)
// =====================================================
//
// Sekali per thread callback, set bit FZ (bit 24) di FPCR —
// Flush-to-Zero untuk operasi floating-point di thread ini.
//
// KENAPA PERLU (walau sanitizeOutput() sudah men-nol-kan |x| < 1e-30f):
// sanitize hanya bekerja di OUTPUT akhir. Di tengah rantai, state
// feedback IIR (BiquadFilter z1/z2, resonator Solfeggio) meluruh melewati
// rentang denormal saat ekor sinyal mengecil — dan operasi FP atas nilai
// denormal jauh lebih lambat di ARMv8. Di thread realtime (callback
// AAudio/OpenSLES via Oboe) itu risiko xrun. FZ mematikan seluruh kelas
// stall itu di hardware, tanpa mengubah satu pun nilai DSP di rentang
// normal.
//
// FZ SAJA, TANPA DAZ — putusan dari bukti arsitektur, bukan dari ingatan:
// di AArch64 TIDAK ADA bit DAZ di FPCR; FZ (bit 24) SUDAH memperlakukan
// input denormal sebagai nol DAN membuang output denormal ke nol
// (ARM ARM, register FPCR). DAZ adalah konsep x86 (bit 6 MXCSR) —
// tidak ada yang bisa di-set di sini. Konsekuensinya: denormal yang
// dihasilkan decoder (swr_convert di thread DecoderWorker, lalu masuk
// antrean PCM) dan tiba di audio thread sebagai INPUT DSP juga sudah
// ditangani FZ ini — tidak perlu perlakuan terpisah.
//
// PER-THREAD, BUKAN GLOBAL: FPCR bagian dari state FPSIMD yang disimpan
// /dipulihkan kernel per thread saat context switch, jadi MSR di sini
// tidak bocor ke thread JS, decoder, UI, atau visualizer. Guard
// thread_local memastikan MSR hanya sekali per thread callback —
// AAudio boleh memakai thread baru sesudah reopen stream, dan fallback
// OpenSLES memakai thread callback sendiri; keduanya tertutup tanpa
// menyentuh thread lain. Read-modify-write: bit FPCR lain (mis. DN,
// RMode) dipertahankan.
//
// NON-ARM64 (emulator x86_64): dikompilasi jadi no-op — tidak ada FPCR
// di x86, dan denormal di sana urusan MXCSR yang tidak disentuh item ini.
//
// VERIFIKASI PERANGKAT: log satu kali per thread ("FPCR FZ enabled") —
// grep logcat untuk memastikan setup jalan di thread callback yang benar.
namespace {

void enableFlushToZeroOnce() noexcept {
#if defined(__aarch64__)
    // thread_local: inisialisasi lambda jalan sekali per thread, di
    // pemanggilan pertama dari thread itu. Pemanggilan berikutnya hanya
    // cek guard (satu load TLS + branch terprediksi — murah di jalur
    // realtime).
    thread_local const bool enabled = [] {
        uint64_t fpcr = 0;
        __asm__ volatile("mrs %0, fpcr" : "=r"(fpcr));
        fpcr |= (1ULL << 24);  // FPCR.FZ — flush-to-zero
        __asm__ volatile("msr fpcr, %0" : : "r"(fpcr));
        __android_log_print(ANDROID_LOG_INFO, "AudioCallback",
            "FPCR FZ enabled (flush-to-zero) on audio thread");
        return true;
    }();
    (void)enabled;
#endif
}

} // namespace

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioCallback::AudioCallback(
    AudioPipeline& pipeline,
    AudioMetrics& metrics,
    AudioState& state
)
    : mPipeline(pipeline),
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
    // (C-FTZ, 2026-11-12): set FZ di FPCR sekali per thread callback —
    // flush-to-zero denormal (lihat enableFlushToZeroOnce di atas). Harus
    // di baris pertama: sebelum FP apa pun di callback ini, dan sebelum
    // early-return numFrames <= 0 — thread baru sesudah reopen tetap
    // ter-setup di callback pertamanya.
    enableFlushToZeroOnce();

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
    // callback. Sekarang buffer besar diproses dalam chunk ≤ kMax di dalam
    // applyPipeline(). Tidak ada memset pengganti: render() sudah
    // zero-fill seluruh buffer yang diminta (clearing_/paused/shortfall —
    // PlaybackController.cpp:704,725,900).
    // (C-FALLBACK, 2026-11-12): jalur fallback AudioBufferController
    // dihapus — lihat catatan di akhir onAudioReady.

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
        // 🔥 FIX (2026-10-07): dulu fungsi ini `return` di sini, sehingga
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
    // TANPA PlaybackController: senyap
    // =============================================
    //
    // (C-FALLBACK, 2026-11-12): jalur fallback AudioBufferController
    // (pushData -> RingBuffer 512 KiB -> popStereo) DIHAPUS — 0 pemanggil
    // pushData di seluruh cpp/jni/Kotlin, popStereo hanya dipakai di sini,
    // dan satu-satunya sumber audio yang hidup adalah PlaybackController
    // (dipasang EngineManager::setPlaybackController, EngineManager.cpp:223).
    // Cabang ini hanya tercapai bila controller belum/tidak dipasang:
    // perilaku lamanya dengan ring buffer kosong adalah senyap + underrun,
    // jadi itu yang dipertahankan — tanpa buffer 512 KiB, tanpa mismatch
    // satuan pushData (numSamples vs frames), tanpa race clear() RingBuffer,
    // tanpa duplikasi kondisi fallbackNodeLimiterRan.
    std::memset(
        output,
        0,
        sizeof(float) * static_cast<size_t>(numFrames) * 2
    );
    mMetrics.recordUnderrun();
    mMetrics.updateBufferedSamples(0);

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

        // XRun Oboe (C-XRUN, 2026-11-12): counter underrun+overrun stream
        // ini menurut HAL — dibaca di throttle yang sama dengan latensi
        // (~160 ms), langsung dari `stream` yang diserahkan Oboe ke
        // callback ini, seperti getTimestamp()/getFramesWritten() di atas
        // (bukan via streamCopy(): TIDAK ADA polling thread di codebase
        // ini — metrik live memang ditulis dari audio thread; getter
        // controller baru akan jadi dead code kalau tidak ada pemanggil).
        // getXRunCount() AAudio hanya baca atomic di shared memory.
        // OpenSLES tidak mendukung XRun count (isXRunCountSupported
        // false) dan getXRunCount() mengembalikan error — nilai lama
        // dipertahankan, bukan ditimpa 0. Ini BUKAN recordUnderrun()/
        // recordOverrun() lokal: itu hitungan callback kita sendiri.
        if (stream->isXRunCountSupported()) {
            const auto xruns = stream->getXRunCount();
            if (xruns.error() == oboe::Result::OK && xruns.value() >= 0) {
                mMetrics.updateXRuns(
                    static_cast<uint64_t>(xruns.value())
                );
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
    // (C-EQATOM, 2026-11-12): 10 band dibaca sebagai SATU snapshot berversi
    // (seqlock di AudioState), bukan 10 atomic load terpisah. Dulu loop di
    // sini bisa membaca preset setengah-jadi — Kotlin setFullEqualizer
    // memanggil JNI 10x, satu per band — lalu dspConfigEquals melihat config
    // berubah dua kali dan DSPChain::applyConfig() jalan 2x untuk satu
    // preset. Sekarang setFullEqualizer satu panggilan JNI dan snapshot ini
    // konsisten atau tidak dipakai sama sekali: kalau penulisan sedang
    // berlangsung (return false), mParams.eqGains dipertahankan dari buffer
    // sebelumnya — melewatkan satu buffer tidak terdengar, memakai campuran
    // dua preset bisa menimbulkan pop (pola yang sama dengan
    // headphonePreset() di bawah).
    //
    // 1 snapshot per buffer — di luar loop sample, jadi tidak menambah
    // beban per-frame.
    float eqSnapshot[10];
    if (mState.eqGains(eqSnapshot)) {
        std::memcpy(
            mParams.eqGains,
            eqSnapshot,
            sizeof(eqSnapshot)
        );
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

    // (C-CLEAN(d)): nomor urut snapshot — naik tiap snapshot baru ditulis,
    // walau nilainya sama dengan buffer sebelumnya. Lihat DSPParameters::version.
    ++mParams.version;
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

    // (C-CLEAN(e), 2026-11-12): SHORTCUT BitPerfect.
    //
    // processBitPerfect() adalah no-op, jadi jalur normal di mode ini
    // hanya: updateParameters() (baca ~10 atomic + seqlock EQ + preset
    // 264 byte per buffer) -> deinterleave -> no-op -> interleave +
    // sanitize -> visualizer.write(). Tiga pass penuh per sample untuk
    // output yang identik dengan input — kecuali sanitize.
    //
    // Jalur cepat ini melewati ketiganya:
    //   - Mode dibaca LANGSUNG dari AudioState (satu atomic load) —
    //     updateParameters() tidak dipanggil, jadi mParams (termasuk
    //     DSPParameters::version dari C-CLEAN(d)) membeku selama
    //     BitPerfect; tidak ada yang membacanya di mode ini, dan jalur
    //     normal menulis snapshot segar begitu mode pindah.
    //   - Sanitasi TETAP jalan, in-place pada buffer interleaved:
    //     NaN/Inf/|x|>2 -> 0, denormal < 1e-30 -> 0 (kDenormalThreshold).
    //     Desain yang sudah ada, BUKAN baru di sini: output BitPerfect
    //     tidak strictly bit-exact untuk sampel denormal — itu harga
    //     sanitasi, dan FZ di onAudioReady sudah mem-flush denormal
    //     hasil komputasi. Tanpa sanitize, NaN dari decoder akan lolos
    //     ke DAC.
    //   - Visualizer diberi makan lewat writeInterleaved() (API
    //     sadar-stride baru, mixdown + sanitasi yang sama persis
    //     dengan write()) — bukan deinterleave ke mLeft/mRight.
    //   - noteMode(BitPerfect) menjaga pelacakan ganti mode
    //     (C-MODESW): saat user kembali ke DSP/Immersive, rantai
    //     tujuan tetap di-reset + di-fade-in 8 ms. Melewati
    //     mPipeline.process() begitu saja AKAN menghilangkan itu.
    //
    // Tidak ada dependensi lain pada updateParameters() per buffer:
    // mParams hanya dibaca applyPipeline + pipeline (keduanya
    // dilewati di sini), metrik (AudioMetrics) memakai atomic-nya
    // sendiri dan di-update di onAudioReady, bukan di sini.
    if (
        mState.processingMode() ==
        ProcessingMode::BitPerfect
    ) {

        mPipeline.noteMode(
            ProcessingMode::BitPerfect
        );

        for (int32_t i = 0; i < numFrames; ++i) {
            sanitizeOutput(interleaved[i * 2]);
            sanitizeOutput(interleaved[i * 2 + 1]);
        }

        mVisualizer.writeInterleaved(
            interleaved,
            numFrames
        );

        return;
    }

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
// persis dengan yang dipakai applyPipeline, jadi tidak ada jalur mixdown
// kedua yang harus dijaga tetap sinkron. Tanpa alokasi, tanpa lock,
// di audio thread.
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