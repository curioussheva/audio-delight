#pragma once

#include <algorithm>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "../core/AudioEngine.h"
#include "../core/AudioState.h"
#include "../core/Export.h"
#include "../devices/AudioDeviceManager.h"
#include "../playback/PlaybackController.h"

namespace pristine {

class PRISTINE_EXPORT EngineManager {
public:

    static EngineManager& get();

    AudioEngine& engine();

    playback::PlaybackController&
    playback();

    AudioState&
    state();

    // lifecycle
    void start();

    // (setRequestedSampleRate() + requestedSampleRate() dihapus 2026-11-10:
    // 0 caller di seluruh tree — override laju eksplisit tidak pernah
    // terhubung ke JNI/UI. Laju stream selalu berasal dari laju file lewat
    // resolveRequestedRate().)

    // =====================================================
    // PERANGKAT OUTPUT
    // =====================================================
    //
    // Memilih perangkat output yang dipakai stream. Id adalah id numerik
    // Android (AudioDeviceInfo.getId()), bukan string.
    //
    // Kalau stream sedang berjalan, stream ditutup dan dibuka ulang di
    // perangkat baru - pilihan device hanya berlaku saat stream dibuka.
    //
    // 0 = hapus preferensi, kembalikan pemilihan ke Android.
    // Mengembalikan false kalau id tidak ada di daftar device yang dikenal.
    bool setRequestedDeviceId(int32_t deviceId);

    // Id perangkat yang diminta. 0 = tidak ada preferensi (sistem memilih).
    int32_t requestedDeviceId() const;

    // Id perangkat yang BENAR-BENAR dipakai stream. 0 = dipilih sistem.
    int32_t actualDeviceId() const;

    // true kalau permintaan device dihormati (atau memang tidak ada permintaan).
    // false = pilihan device tidak berlaku; UI tidak boleh mengaku memakai DAC.
    bool isDeviceHonored() const;

    // true kalau jalur yang berjalan memang tidak bisa bit-perfect (speaker
    // internal, jack, Bluetooth, atau OpenSLES). Beda dari isExclusive() yang
    // false baik saat "memang tidak mungkin" maupun "mungkin tapi ditolak".
    bool isPathInherentlyLossy() const;

    // true kalau laju stream yang berjalan SAMA dengan laju file - tidak ada
    // konversi sama sekali di jalur ini.
    //
    // Beda dari AudioDeviceManager::deviceSupportsRate() yang menjawab
    // "apakah perangkat mendukung laju ini" sebelum stream dibuka; yang ini
    // menjawab dari stream yang BENAR-BENAR terbuka, jadi ia tidak bisa
    // berbohong saat perangkat menolak laju yang diminta.
    //
    // false kalau tidak ada laju file yang diketahui.
    bool isRateHonored() const;

    // Perangkat yang SEDANG berjalan, sebagai descriptor.
    // `id` kosong kalau stream memakai perangkat default sistem (atau belum
    // dibuka) - UI tidak boleh menampilkan nama DAC dalam keadaan itu.
    AudioDeviceDescriptor currentOutputDevice() const;

    // =====================================================
    // REOPEN STREAM (dipakai setelah device berubah)
    // =====================================================
    //
    // Menutup dan membuka ulang stream TANPA membuang posisi pemutaran.
    //
    // KENAPA INI PERLU (bug "audio mati setelah colok headset", 2026-10-08)
    //
    // `onDeviceRemoved()` menutup stream saat headset dicabut. Stream hanya
    // dibuka oleh `start()`, dan `start()` hanya dipanggil dari `nativePlay()`.
    // Saat user menekan play lagi, `hasDecoder()` masih true (decoder tidak
    // dibuang saat stream ditutup), sehingga `loadTrack()` DILEWATI - dan
    // `PlaybackController` tetap memegang state lama (queue PCM kosong, clock
    // ter-reset) terhadap stream baru. Hasilnya: stream jalan, callback jalan,
    // tapi `render()` mengembalikan senyap. Tidak ada error, tidak ada log -
    // audio "mati" begitu saja.
    //
    // Dulu bug ini tidak muncul karena `getController()` menyalakan engine di
    // SETIAP JNI call, jadi stream selalu sudah terbuka lebih awal. Fix
    // 2026-10-07 yang menunda start justru membukanya.
    //
    // Fungsi ini menutup dan membuka ulang stream, lalu MEMUAT ULANG track
    // yang sama supaya decoder benar-benar mengisi queue untuk stream baru.
    // Posisi dikembalikan setelahnya, jadi pemutaran tidak melompat ke awal.
    //
    // Aman dipanggil saat stream tidak berjalan (hanya memastikan terbuka).
    //
    // KONTRAK LOCK (fix 2026-11-10, BLOCKER B1): fungsi ini MENGAMBIL
    // mMutex sendiri (lock_guard di badan fungsi). JANGAN PERNAH memanggilnya
    // saat mMutex sudah dipegang — std::mutex bukan rekursif, jadi itu
    // deadlock. Pemanggil yang memegang lock HARUS lock.unlock() dulu
    // (lihat setRequestedDeviceId / onDeviceRemoved / setExclusiveMode).
    void reopenStreamPreservingPlayback();

    // Dipanggil setiap loadTrack() berhasil (via PlaybackController).
    // Meminta reopen (lewat worker requestStreamRecovery) kalau laju yang
    // SEHARUSNYA dipakai (dari laju file / override eksplisit) berbeda dari
    // laju stream yang berjalan — inilah perbaikan M1 (bit-perfect hilang
    // diam-diam saat ganti track). TIDAK PERNAH reopen sinkron di sini
    // (PB6-B1): listener ini berjalan di dalam loadTrack() yang memegang
    // loadTrackMutex_, sementara reopen butuh mMutex dulu — urutan lock
    // terbalik = deadlock ABBA. Idempotent: kalau stream sudah di laju yang
    // benar, tidak melakukan apa-apa. Tidak melakukan apa-apa juga kalau
    // stream tidak berjalan (start() berikutnya sudah memakai laju file)
    // atau kalau sebuah reopen sedang berjalan (mReopening).
    void onTrackLoaded();

    // Device dicabut saat stream berjalan (dari AudioDeviceCallback).
    //
    // Kalau stream sedang memakai device itu - atau device itu yang diminta -
    // stream dibuka ulang di perangkat yang tersisa. Tanpa ini stream tetap
    // menunjuk device yang sudah tidak ada: audio berhenti atau keluar di
    // perangkat hantu, dan itu terjadi tepat saat kabel DAC tersentuh.
    //
    // Aman dipanggil untuk device mana pun: kalau tidak relevan, tidak ada
    // yang dilakukan.
    void onDeviceRemoved(int32_t deviceId);

    // (play()/pause() dihapus 2026-11-10: 0 caller. JNI memakai
    // gPlaybackController->play()/pause() langsung. EngineManager::stop()
    // juga dihapus: engine hanya di-stop lewat mEngine.stop() di reopen().)

    // dsp
    void setDSPEnabled(bool enabled);
    void setLimiterEnabled(bool enabled);
    void setEqBand(int band, float gainDb);
    // (C-EQATOM, 2026-11-12): tulis massal `count` band pertama (1..10)
    // dalam satu transaksi seqlock di AudioState.
    void setEqBands(const float* gains, int count);
    void setBassBoost(float gainDb);

    // =============================================
    // KOREKSI HEADPHONE (Fase D)
    // =============================================
    //
    // `presetText` = teks preset AutoEQ/Squiglink. Parsing di thread pemanggil.
    // Mengembalikan false kalau preset cacat — pemanggil WAJIB memeriksa.
    bool loadHeadphonePreset(const std::string& presetText,
                             const std::string& name = "");

    // Parse saja. -1 kalau preset ditolak, selain itu jumlah filter aktif.
    // Tidak mengubah state audio.
    int validateHeadphonePreset(const std::string& presetText) const;
    void clearHeadphonePreset();
    void setHeadphoneCorrectionEnabled(bool enabled);
    bool isHeadphoneCorrectionEnabled() const;
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);

    // immersive
    void setSolfeggioFreq(float freq);
    void setBrainwaveFreq(float freq);
    void setResonanceIntensity(float intensity);
    void setImmersiveEnabled(bool enabled);

    // mode
    void setProcessingMode(
        ProcessingMode mode
    );

    void setExclusiveMode(
        bool enabled
    );

    // Status stream AKTUAL, bukan yang diminta. Lihat AudioEngine::isExclusive.
    bool isExclusive() const;
    int32_t actualSampleRate() const;

    // (getStats() dihapus 2026-11-10: 0 caller.
    // C-DSPMETRIC, 2026-11-12: komentar lama di sini SALAH — "JNI membaca
    // engine().getStats() langsung" tidak benar. Grep seluruh repo: tidak
    // ada pemanggil getStats() di mana pun, JNI/Kotlin/TS sekalipun.)

private:

    EngineManager();

    // PB6-W6 (2026-11-12): destruktor KUSTOM, bukan = default.
    //
    // Urutan deklarasi member: mEngine (:310) sebelum mPlayback (:312),
    // jadi mPlayback dihancurkan DULU, baru ~AudioEngine() memanggil
    // stop(). Di antara keduanya callback Oboe masih bisa render() pada
    // mPlayback yang sudah hancur -> UAF. Body destruktor jalan SEBELUM
    // member mana pun dihancurkan, jadi mEngine.stop() di sini menutup
    // stream selagi mPlayback masih hidup.
    //
    // Jangkauan sempit: singleton Meyer, destruktor hanya jalan saat
    // proses exit (Android biasanya SIGKILL, destruktor tak jalan) —
    // tapi murah dan menutup satu-satunya jendela UAF ini.
    //
    // Double-stop aman: stop() idempotent — StreamController::stop()/
    // close() no-op kalau stream sudah null, reset() hanya clear +
    // atomic store 0. Jadi stop() di sini + stop() lagi dari
    // ~AudioEngine() saat mEngine dihancurkan tidak berbahaya.
    // Urutan deklarasi member SENGAJA tidak diubah.
    ~EngineManager();

    EngineManager(
        const EngineManager&
    ) = delete;

    EngineManager&
    operator=(
        const EngineManager&
    ) = delete;

    // Laju yang akan dipakai stream berikutnya, dalam Hz: laju file dari
    // controller (diisi loadTrack) -> 0 (biar engine deteksi sendiri).
    // Hanya membaca atomic, jadi aman dipanggil tanpa mMutex (dipakai juga
    // oleh onTrackLoaded() dan logging pasca-reopen).
    // Handler untuk stream yang DIPUTUS PAKSA sistem (onErrorAfterClose).

    int32_t resolveRequestedRate() const;

    // =====================================================
    // STREAM DIPUTUS PAKSA SISTEM
    // =====================================================
    //
    // Dipanggil dari THREAD OBOE (onErrorAfterClose), saat Oboe sedang
    // menutup stream, dan dari onTrackLoaded() saat laju file berubah
    // (PB6-B1: listener itu berjalan di dalam loadTrack() yang memegang
    // loadTrackMutex_, jadi reopen sinkron dari sana = deadlock ABBA).
    // TIDAK boleh reopen langsung di sini:
    //   - reopen menutup stream yang sedang ditutup Oboe -> deadlock,
    //   - reopen mengambil mMutex yang mungkin sedang dipegang thread lain.
    //
    // Karena itu fungsi ini hanya menandai dan menyerahkan pekerjaan ke worker
    // thread. Aman dipanggil dari thread audio: tanpa lock, tanpa alokasi.
    void requestStreamRecovery();

    // Worker yang benar-benar mengerjakan reopen. Berjalan di thread terpisah.
    void runStreamRecovery();

    // Perangkat yang akan dipakai stream berikutnya (id numerik Android).
    // Prioritas: override eksplisit (setRequestedDeviceId) -> perangkat aktif
    // dari AudioDeviceManager -> 0 (biarkan sistem memilih).
    // Hanya membaca atomic + AudioDeviceManager (bermutex sendiri), jadi aman
    // dipanggil tanpa mMutex.
    int32_t resolveRequestedDeviceId() const;

    // Laju yang didukung satu perangkat tertentu (dari AudioDeviceManager,
    // satu-satunya sumber data perangkat — C-R1).
    //
    // Dipakai alih-alih membaca perangkat output AKTIF menurut Android -
    // itu belum tentu perangkat yang kita minta (AudioFlinger memindahkan
    // rute setelah stream dibuka). Memakai daftar perangkat yang dipilih
    // membuat pemilihan laju tidak bergantung pada perangkat lain.
    //
    // Kosong = tidak diketahui ATAU perangkat mendukung laju sembarang;
    // audio::pickBestRate() memakai laju file apa adanya dalam kedua arti.
    std::vector<int32_t> supportedRatesFor(int32_t deviceId) const;

    // pickBestRate() terhadap daftar laju SATU perangkat — delegasi ke
    // pristine::audio::pickBestRate() (core/RateSelection.h), satu-satunya
    // implementasi aturan pemilihan laju. Aturannya: laju persis, lalu
    // pembagi bulat terbesar dari laju file, lalu laju tertinggi yang
    // tidak melebihi laju file, terakhir laju terendah perangkat.
    //
    // `deviceRates` kosong -> laju file apa adanya (tidak ada lagi fallback
    // ke daftar gabungan semua perangkat).
    int32_t pickBestRateFor(int32_t fileRate, const std::vector<int32_t>& deviceRates) const;

private:

    mutable std::mutex mMutex;

    // true selagi ada permintaan recovery yang belum diproses worker. Dipakai
    // untuk menggabungkan beberapa kejadian beruntun (colok-cabut-cepat) jadi
    // satu reopen, dan mencegah worker menumpuk.
    std::atomic<bool> mRecoveryPending{false};

    // true selagi worker recovery berjalan; dipakai sebagai guard supaya hanya
    // ada satu worker hidup pada satu waktu.
    std::atomic<bool> mRecoveryRunning{false};

    // true selagi reopenStreamPreservingPlayback() berjalan (M1, 2026-11-10).
    // onTrackLoaded() (yang dipanggil dari loadTrack, termasuk loadTrack DI
    // DALAM reopen) mengembalikan awal kalau flag ini true — mencegah
    // permintaan recovery sia-sia dari dalam reopen sendiri (sejak PB6-B1
    // handler tidak lagi reopen sinkron, jadi tidak ada lagi reentrancy
    // reopen-dari-reopen). Reopen sudah memakai laju terbaru, jadi tidak
    // ada yang terlewat saat flag ini aktif.
    std::atomic<bool> mReopening{false};

    AudioState mState;

    // Perangkat output yang diminta (id numerik Android).
    // 0 = belum ditentukan -> pakai perangkat aktif AudioDeviceManager, atau
    // biarkan sistem memilih kalau itu juga kosong.
    std::atomic<int32_t> mRequestedDeviceId{0};

    AudioEngine mEngine;

    playback::PlaybackController mPlayback;
};

} // namespace pristine 


