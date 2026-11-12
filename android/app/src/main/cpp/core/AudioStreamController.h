#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>

#include <oboe/Oboe.h>

#include "AudioState.h"

namespace pristine {

// =====================================================
// AUDIO STREAM CONTROLLER
// Handle Oboe stream lifecycle
// =====================================================

class AudioStreamController :
    public oboe::AudioStreamErrorCallback {

public:

    AudioStreamController();

    ~AudioStreamController() override;

    // =============================================
    // STREAM
    // =============================================

    // `requestedSampleRate` = laju yang DIINGINKAN (dari kapabilitas DAC atau
    // laju file). 0 = pakai default 48000.
    //
    // Diisi eksplisit supaya laju stream bisa mengikuti DAC/file, bukan
    // dipatok 48000 - itu syarat bit-perfect: sampel harus sampai ke DAC
    // pada laju aslinya, tanpa konversi di mixer Android.
    //
    // `deviceId` = id numerik perangkat output yang DIMINTA (dari
    // AudioDeviceManager::activeDeviceIdNumeric()). 0 = tidak ada preferensi,
    // Android yang memilih.
    //
    // 🔥 FIX (2026-10-07): parameter ini yang membuat pemilihan perangkat di
    // UI benar-benar berpengaruh. Sebelumnya tidak ada dan setDeviceId() tidak
    // pernah dipanggil, sehingga pilihan user tercatat tapi stream tetap
    // dibuka di perangkat default sistem (audio keluar dari speaker walau DAC
    // dipilih). Lihat docs/AUDIO_OUTPUT_PATHS.md §3.1.
    bool open(
        oboe::AudioStreamCallback* callback,
        bool exclusive,
        int32_t requestedSampleRate = 0,
        int32_t deviceId = 0
    );

    bool start();

    void stop();

    void close();

    // (restart() dihapus 2026-11-10: 0 caller. Reopen dikerjakan
    // EngineManager::reopenStreamPreservingPlayback() via stop()+start().)

    // =============================================
    // STATE
    // =============================================

    bool isRunning() const noexcept;

    bool isExclusive() const noexcept;

    // (isOpen()/sampleRate()/format()/api()/performanceMode()/sharingMode()/
    // stream() dihapus 2026-11-10: 0 caller. channelCount() tetap dipakai
    // — dibaca AudioEngine::start() untuk metrik.)
    int32_t channelCount() const noexcept;

    int32_t framesPerBurst() const noexcept;

    // Ukuran buffer stream AKTUAL dalam frame (Oboe getBufferSizeInFrames).
    // Hanya dilaporkan — setBufferSizeInFrames() TIDAK pernah dipanggil di
    // codebase ini, dan getter ini tidak mengubah ukuran buffer (C-XRUN,
    // 2026-11-12). 0 = tidak ada stream.
    //
    // (Tidak ada getter isMmap: Oboe tidak mengekspos pemakaian MMAP —
    // tidak ada isMmap() di AudioStream.h pinned 5714d53. Satu-satunya
    // sumber adalah AAudio C API AAudioStream_isMMapUsed, yang butuh
    // API 26+ sementara minSdk 24 dan libaaudio tidak di-link.)
    int32_t bufferSizeInFrames() const noexcept;

    // Laju yang BENAR-BENAR dipakai stream setelah dibuka. Bisa berbeda dari
    // yang diminta kalau device/DAC tidak mendukung laju itu. Dipakai untuk
    // memberi tahu decoder laju mana yang harus dipakai (target resample).
    int32_t actualSampleRate() const noexcept;

    // true kalau stream jatuh ke OpenSLES karena AAudio gagal. AAudio adalah
    // jalur utama (punya mode exclusive untuk bit-perfect); OpenSLES hanya
    // fallback untuk device lama yang tidak punya AAudio.
    bool usingOpenSLESFallback() const noexcept;

    // Id perangkat yang BENAR-BENAR dipakai stream setelah dibuka. 0 =
    // Android memilih sendiri (tidak ada preferensi yang diminta).
    //
    // Dipakai untuk verifikasi jujur: kalau yang diminta != yang didapat,
    // perangkat yang diminta tidak tersedia atau tidak bisa dibuka, dan UI
    // tidak boleh mengaku sedang memakai DAC itu.
    int32_t actualDeviceId() const noexcept;

    // Id perangkat yang diminta saat open() terakhir. 0 = tidak ada preferensi.
    int32_t requestedDeviceId() const noexcept {
        return mRequestedDeviceId.load(std::memory_order_acquire);
    }

    // (requestedSampleRate() dihapus 2026-11-10: 0 caller. Membernya sudah
    // dihapus di langkah yang sama — getter ini tertinggal dan merujuk
    // member yang tidak ada; ketahuan saat verifikasi grep sebelum commit.)

    // true kalau stream yang berjalan benar-benar memakai perangkat yang
    // diminta. Kalau false, pilihan device tidak dihormati - UI harus jujur
    // dan tidak mengaku sedang memakai DAC itu.
    bool isDeviceHonored() const noexcept;

    // true kalau stream yang berjalan TIDAK bisa bit-perfect secara arsitektur,
    // apa pun yang diminta user.
    //
    // Dua sebab:
    //   1. Perangkatnya sendiri tidak punya jalur langsung ke perangkat keras
    //      (speaker internal, jack headset, Bluetooth/A2DP - semuanya lewat
    //      mixer AudioFlinger).
    //   2. Stream jatuh ke OpenSLES, yang tidak punya mode exclusive.
    //
    // Dipakai UI supaya tidak pernah mengklaim bit-perfect pada jalur yang
    // mustahil - dan supaya jalur yang MUNGKIN (USB DAC lewat AAudio) tidak
    // ikut-ikutan dinyatakan gagal. Lihat docs/AUDIO_OUTPUT_PATHS.md.
    bool isPathInherentlyLossy() const noexcept;

    // =============================================
    // ERROR CALLBACK
    // =============================================

    // Dipanggil Oboe saat stream DIPUTUS PAKSA oleh sistem - kasus yang paling
    // sering adalah headset dicolok: Android memindahkan rute dan memberi
    // `request DISCONNECT in data callback`, lalu menutup stream ini.
    //
    // Di sini stream sudah tidak bisa dipakai (`all you can do is close it`).
    // Yang kita lakukan:
    //   1. tandai tidak berjalan + buang stream,
    //   2. panggil `disconnectHandler_` - PEMILIK stream (AudioEngine ->
    //      EngineManager) yang tahu cara membuka ulang DAN memuat ulang track
    //      ke stream baru.
    //
    // Tanpa langkah 2, audio mati permanen: stream hilang, tidak ada yang
    // membukanya kembali. Itu yang terjadi sebelumnya (hanya reset + diam) dan
    // sebabnya audio mati setelah headset dicolok.
    //
    // Handler boleh null (mis. dipanggil saat destruksi atau di test yang
    // tidak memasang handler) - kalau null, cukup tandai tidak berjalan seperti
    // dulu, tanpa crash.
    void setDisconnectHandler(
        std::function<void()> handler
    ) {
        mDisconnectHandler = std::move(handler);
    }

    void onErrorAfterClose(
        oboe::AudioStream* stream,
        oboe::Result error
    ) override;

private:

    bool buildStream(
        oboe::AudioStreamBuilder& builder,
        oboe::AudioStreamCallback* callback,
        bool exclusive,
        int32_t requestedSampleRate,
        int32_t deviceId
    );

private:

    std::shared_ptr<
        oboe::AudioStream
    > mStream;

    // Mutex untuk mStream (fix M4, 2026-11-10): mStream ditulis dari thread
    // error Oboe (onErrorAfterClose -> reset) dan dibaca dari JS thread
    // (actualSampleRate/actualDeviceId via JNI) — shared_ptr tanpa proteksi
    // = race/UB. Semua akses lewat streamCopy() atau dengan mengunci mutex
    // ini. mutable supaya getter const bisa mengunci. Lock TIDAK PERNAH
    // dipegang melewati panggilan ke Oboe (openStream/requestStart/close)
    // — error callback Oboe bisa jalan di thread yang sama.
    mutable std::mutex mStreamMutex;

    // Salinan shared_ptr di bawah lock. Pemakaian salinan setelah unlock aman
    // karena salinan menahan objek tetap hidup.
    std::shared_ptr<oboe::AudioStream> streamCopy() const {
        std::lock_guard<std::mutex> lock(mStreamMutex);
        return mStream;
    }

    std::atomic<bool>
        mRunning{false};

    std::atomic<bool>
        mExclusive{false};

    // (C-SRATE, 2026-11-12): atomic — ditulis open() (thread JS) dan
    // close()/onErrorAfterClose() (thread error Oboe), dibaca
    // actualSampleRate() sebagai fallback saat stream null dari thread JNI
    // (NativeDSPModule::nativeGetActualSampleRate) dan thread manager
    // (EngineManager). Plain int32_t di sini = data race.
    std::atomic<int32_t> mSampleRate{48000};

    // (C-SRATE): atomic juga. Hari ini hanya dibaca channelCount() dari
    // AudioEngine::start(), thread yang sama sesudah open() — tapi atomic
    // int32_t murah, tanpa lock, dan menutup jalur baca lintas-thread kalau
    // getter ini nanti dipanggil dari thread lain.
    std::atomic<int32_t> mChannelCount{2};

    // (C-SRATE): atomic juga — alasan sama seperti mChannelCount; hanya
    // dibaca framesPerBurst() dari AudioEngine::start() hari ini.
    std::atomic<int32_t> mFramesPerBurst{0};

    // true kalau AAudio gagal dan stream dibuka ulang dengan OpenSLES.
    std::atomic<bool> mOpenSLESFallback{false};

    // Perangkat yang diminta saat open() terakhir (dibaca isDeviceHonored()).
    // (mRequestedSampleRate dihapus 2026-11-10: hanya dibaca restart() yang
    // sudah dihapus.)
    std::atomic<int32_t> mRequestedDeviceId{0};

    // Id perangkat yang benar-benar dipakai stream. 0 = dipilih sistem.
    std::atomic<int32_t> mActualDeviceId{0};

    // (C-SRATE, 2026-11-12): SENGAJA tetap plain, bukan atomic — ditulis
    // (AudioStreamController.cpp:211) dan dibaca (:215) hanya di dalam
    // open(), thread yang sama; nilainya tidak pernah lolos keluar open().
    // Satu-satunya yang dibaca lintas-thread adalah mExclusive (atomic)
    // yang di-store dari nilai ini.
    oboe::SharingMode mSharingMode =
        oboe::SharingMode::Shared;

    // Dipanggil dari onErrorAfterClose() (thread Oboe) saat stream diputus
    // paksa sistem. Diset oleh pemilik stream lewat setDisconnectHandler().
    // Null = tidak ada yang menangani; stream hanya ditandai berhenti.
    // Ditulis SEKALI (C-K2, 2026-11-12): di konstruktor EngineManager,
    // sebelum stream pertama dibuka — jadi tidak ada penulisan yang bisa
    // balapan dengan salinan di onErrorAfterClose().
    std::function<void()> mDisconnectHandler;
};

} // namespace pristine