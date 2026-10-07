#pragma once

#include <algorithm>
#include <atomic>
#include <mutex>
#include <string>
#include <vector>

#include "../core/AudioEngine.h"
#include "../core/AudioState.h"
#include "../core/DeviceRateDetector.h"
#include "../devices/AudioDeviceManager.h"
#include "../playback/PlaybackController.h"

namespace pristine {

class __attribute__((visibility("default"))) EngineManager {
public:

    static EngineManager& get();

    AudioEngine& engine();

    playback::PlaybackController&
    playback();

    AudioState&
    state();

    // lifecycle
    void start();
    void stop();

    // Laju stream yang diminta, dipilih dari laju FILE lewat kapabilitas
    // perangkat (DeviceRateDetector::pickBestRate).
    //
    // Tanpa ini stream selalu dibuka di laju TERTINGGI yang didukung
    // perangkat, bukan laju file — file 44.1 kHz di DAC 384 kHz jadi
    // upsampling 8.7x, kebalikan dari bit-perfect.
    //
    // fileRate <= 0 = laju file tidak diketahui -> biarkan engine mendeteksi
    // sendiri (perilaku lama, laju tertinggi perangkat).
    //
    // Nilai ini disimpan dan dipakai ulang saat toggle exclusive mode, supaya
    // stream yang dibuka ulang tidak kembali ke laju tertinggi perangkat.
    void setRequestedSampleRate(int32_t fileRate);

    // Laju yang diminta saat ini. 0 = belum ditentukan / auto.
    int32_t requestedSampleRate() const;

    // =====================================================
    // PERANGKAT OUTPUT
    // =====================================================
    //
    // Memilih perangkat output yang dipakai stream. Id adalah id numerik
    // Android (AudioDeviceInfo.getId()), bukan string.
    //
    // Kalau stream sedang berjalan, stream ditutup dan dibuka ulang di
    // perangkat baru - pilihan device hanya berlaku saat stream dibuka.
    // Berbeda dengan setRequestedSampleRate() yang hanya menyimpan nilai,
    // di sini restart memang tujuannya.
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
    // Beda dari DeviceRateDetector::isBitPerfectFor(fileRate) yang menjawab
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

    // playback
    void play();
    void pause();

    // dsp
    void setDSPEnabled(bool enabled);
    void setLimiterEnabled(bool enabled);
    void setEqBand(int band, float gainDb);
    void setBassBoost(float gainDb);
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

    // metrics
    EngineStats getStats() const;

private:

    EngineManager();

    ~EngineManager() = default;

    EngineManager(
        const EngineManager&
    ) = delete;

    EngineManager&
    operator=(
        const EngineManager&
    ) = delete;

    // Laju yang akan dipakai stream berikutnya, dalam Hz.
    // Prioritas: override eksplisit (setRequestedSampleRate) -> laju file dari
    // controller (diisi loadTrack) -> 0 (biar engine deteksi sendiri).
    // Dipanggil hanya saat mMutex sudah dipegang (start/toggle exclusive).
    int32_t resolveRequestedRate() const;

    // Perangkat yang akan dipakai stream berikutnya (id numerik Android).
    // Prioritas: override eksplisit (setRequestedDeviceId) -> perangkat aktif
    // dari AudioDeviceManager -> 0 (biarkan sistem memilih).
    // Dipanggil hanya saat mMutex sudah dipegang.
    int32_t resolveRequestedDeviceId() const;

    // Laju yang didukung satu perangkat tertentu.
    //
    // Dipakai alih-alih DeviceRateDetector::supportedRates() karena detector
    // itu membaca perangkat output AKTIF menurut Android - dan itu belum
    // tentu perangkat yang kita minta (AudioFlinger memindahkan rute setelah
    // stream dibuka). Memakai daftar perangkat yang dipilih membuat
    // pemilihan laju tidak bergantung pada perangkat lain.
    //
    // Kosong = tidak diketahui; pemanggil harus jatuh kembali ke detector.
    std::vector<int32_t> supportedRatesFor(int32_t deviceId) const;

    // pickBestRate() terhadap daftar laju SATU perangkat.
    //
    // Aturannya sama dengan DeviceRateDetector::pickBestRate(): laju persis,
    // lalu kelipatan bulat terkecil, lalu laju tertinggi yang tidak melebihi
    // laju file, terakhir laju terendah perangkat.
    //
    // `deviceRates` kosong -> jatuh ke pickBestRate() global.
    int32_t pickBestRateFor(int32_t fileRate, const std::vector<int32_t>& deviceRates) const;

private:

    mutable std::mutex mMutex;

    AudioState mState;

    // Laju stream yang diminta (hasil pickBestRate dari laju file).
    // 0 = belum ditentukan -> engine mendeteksi sendiri dari perangkat.
    // Atomic karena dibaca tanpa mMutex (requestedSampleRate() const).
    std::atomic<int32_t> mRequestedSampleRate{0};

    // Perangkat output yang diminta (id numerik Android).
    // 0 = belum ditentukan -> pakai perangkat aktif AudioDeviceManager, atau
    // biarkan sistem memilih kalau itu juga kosong.
    std::atomic<int32_t> mRequestedDeviceId{0};

    AudioEngine mEngine;

    playback::PlaybackController mPlayback;
};

} // namespace pristine 


