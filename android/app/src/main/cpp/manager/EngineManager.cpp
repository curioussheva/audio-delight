// =====================================================
// manager/EngineManager.cpp
// =====================================================

#include "EngineManager.h"

#include <android/log.h>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

EngineManager::EngineManager()
    :

    mEngine(),

    mPlayback() {

}

// =====================================================
// SINGLETON
// =====================================================

EngineManager&
EngineManager::get() {

    static EngineManager instance;

    return instance;
}

// =====================================================
// ACCESS
// =====================================================

AudioEngine&
EngineManager::engine() {

    return mEngine;
}

playback::PlaybackController&
EngineManager::playback() {

    return mPlayback;
}

AudioState&
EngineManager::state() {

    return mState;
}

// =====================================================
// LIFECYCLE
// =====================================================

void EngineManager::start() {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (
        mEngine.isRunning()
    ) {
        return;
    }

    const bool exclusiveMode =
        mState.exclusiveMode();

    // Perangkat output ditentukan DULU: kapabilitasnya yang menentukan laju
    // stream. Memilih perangkat setelah laju akan memakai daftar laju
    // perangkat lama - DAC 384 kHz yang baru dicolok akan tetap dibuka di
    // 48 kHz karena itu laju tertinggi speaker internal.
    const int32_t requestedDevice =
        resolveRequestedDeviceId();

    if (requestedDevice > 0) {
        // Pastikan kapabilitas perangkat ini benar-benar baru dibaca dari
        // Android sebelum dipakai memilih laju.
        AudioDeviceManager::get().refreshDevices();
    }

    // Detector laju membaca perangkat output AKTIF dari Android, dan itu
    // bukan selalu perangkat yang kita minta - kalau AudioFlinger belum
    // memindahkan rutenya, yang terbaca masih perangkat lama. Jadi laju
    // diambil dari deskriptor perangkat yang DIPILIH saat ada, dan detector
    // dipakai sebagai cadangan.
    //
    // DeviceRateDetector tetap di-refresh karena dipakai pickBestRate() dan
    // isBitPerfectFor() sebagai daftar laju yang tersedia.
    const int detected = audio::DeviceRateDetector::refresh();
    if (detected <= 0) {
        __android_log_print(ANDROID_LOG_WARN, "EngineManager",
            "start: deteksi laju gagal, pickBestRate akan memakai laju file apa adanya");
    }

    const auto deviceRates = supportedRatesFor(requestedDevice);

    // Laju stream DIPILIH DARI LAJU FILE, bukan dari laju tertinggi perangkat.
    //
    // pickBestRate() mengembalikan laju file kalau perangkat mendukungnya
    // (bit-perfect, tanpa konversi sama sekali), lalu kelipatan bulat
    // terdekat, baru laju tertinggi yang didukung. Sebelum ini argumen kedua
    // mEngine.start() tidak pernah diisi sehingga selalu 0 -> engine memilih
    // laju TERTINGGI perangkat (file 44.1 kHz di DAC 384 kHz = upsampling 8.7x).
    const int32_t fileRate = resolveRequestedRate();

    int32_t requestedRate = fileRate;
    if (requestedRate > 0) {
        // Kalau laju file tidak didukung perangkat yang dipilih, turun ke
        // laju terdekat yang MEMANG didukungnya - bukan ke laju tertinggi
        // perangkat lain.
        requestedRate = pickBestRateFor(fileRate, deviceRates);
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "start: laju file=%d -> laju stream=%d (bit-perfect=%s, perangkat=%d)",
            fileRate,
            requestedRate,
            (deviceRates.empty()
                ? audio::DeviceRateDetector::isBitPerfectFor(fileRate)
                : std::find(deviceRates.begin(), deviceRates.end(), fileRate) != deviceRates.end())
                ? "ya" : "tidak",
            requestedDevice);
    } else {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "start: laju file tidak diketahui -> engine deteksi sendiri");
    }

    // Batas laju perangkat yang dipilih: kalau ia tidak mendukung sama sekali
    // dan laju file tidak masuk akal untuknya, biarkan engine yang memutuskan.
    if (requestedRate > 0 && !deviceRates.empty()
        && !std::binary_search(deviceRates.begin(), deviceRates.end(), requestedRate)) {
        const int32_t lowered = pickBestRateFor(requestedRate, deviceRates);
        if (lowered != requestedRate) {
            __android_log_print(ANDROID_LOG_WARN, "EngineManager",
                "start: perangkat %d tidak mendukung %d Hz, memakai %d Hz",
                requestedDevice, requestedRate, lowered);
            requestedRate = lowered;
        }
    }

    if (!mPlayback.isInitialized()) {
        mPlayback.initialize();
    }

    mEngine.setPlaybackController(&mPlayback);

    // Perangkat output: pakai yang diminta; kalau tidak ada, perangkat aktif
    // dari AudioDeviceManager; kalau itu juga kosong, biarkan sistem memilih.
    // Tanpa argumen ini stream selalu keluar di perangkat default sistem.
    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "start: perangkat diminta=%d (0 = pilih sistem)", requestedDevice);

    mEngine.start(
        exclusiveMode,
        requestedRate,
        requestedDevice
    );

    // Setelah stream terbuka: catat kalau permintaan device tidak dihormati.
    // Ini yang membuat UI bisa jujur soal DAC mana yang sedang dipakai.
    if (requestedDevice > 0 && !isDeviceHonored()) {
        __android_log_print(ANDROID_LOG_WARN, "EngineManager",
            "PERANGKAT TIDAK DIHORMATI: diminta %d, stream pakai %d",
            requestedDevice, mEngine.actualDeviceId());
    }

    // Bit-perfect butuh KEDUANYA: laju file dipertahankan DAN sampel tidak
    // lewat mixer. Catat eksplisit supaya bisa dibuktikan dari logcat tanpa
    // menebak dari UI.
    if (requestedRate > 0) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "start: hasil -> laju diminta=%d dipakai=%d (sama=%s), "
            "exclusive=%s, jalur-mustahil-bit-perfect=%s, bit-perfect=%s",
            requestedRate, mEngine.actualSampleRate(),
            isRateHonored() ? "ya" : "TIDAK",
            mEngine.isExclusive() ? "ya" : "tidak",
            isPathInherentlyLossy() ? "ya" : "tidak",
            (isRateHonored() && mEngine.isExclusive()) ? "YA" : "tidak");
    }
}

// =====================================================
// REQUESTED SAMPLE RATE
// =====================================================

void EngineManager::setRequestedSampleRate(
    int32_t fileRate
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    // Baru diadopsi sebagai laju stream saat start() berikutnya - stream yang
    // sedang berjalan tidak diubah di sini. Mengubah laju satu stream yang
    // sudah terbuka berarti menutup dan membukanya ulang, dan itu keputusan
    // pemanggil (buka stream di laju lain), bukan efek samping setter.
    const int32_t prev =
        mRequestedSampleRate.exchange(
            fileRate,
            std::memory_order_acq_rel
        );

    if (prev != fileRate) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "setRequestedSampleRate: %d -> %d Hz",
            prev, fileRate);
    }
}

int32_t EngineManager::requestedSampleRate() const {

    return mRequestedSampleRate.load(
        std::memory_order_acquire
    );
}

// Prioritas: override eksplisit -> laju file dari controller (loadTrack).
//
// Controller dijadikan sumber kedua karena jalur normal memang lewat sana:
// JS memuat track (loadTrack) sebelum engine start, dan loadTrack-lah yang
// tahu laju track. Override eksplisit (setRequestedSampleRate) menang karena
// itu preferensi yang sengaja diminta pemanggil.
int32_t EngineManager::resolveRequestedRate() const {

    const int32_t explicitRate =
        mRequestedSampleRate.load(std::memory_order_acquire);

    if (explicitRate > 0) {
        return explicitRate;
    }

    const uint32_t fileRate =
        mPlayback.currentFileSampleRate();

    if (fileRate >= 8000 && fileRate <= 768000) {
        return static_cast<int32_t>(fileRate);
    }

    return 0;
}

// =====================================================
// PERANGKAT OUTPUT
// =====================================================

int32_t EngineManager::resolveRequestedDeviceId() const {

    const int32_t explicitId =
        mRequestedDeviceId.load(std::memory_order_acquire);

    if (explicitId > 0) {
        return explicitId;
    }

    // Perangkat aktif dari AudioDeviceManager. Diisi saat user memilih device
    // di UI, atau saat sinkronisasi membaca device aktif sistem.
    return AudioDeviceManager::get().activeDeviceIdNumeric();
}

// =====================================================
// LAJU PER PERANGKAT
// =====================================================

std::vector<int32_t> EngineManager::supportedRatesFor(int32_t deviceId) const {

    if (deviceId <= 0) {
        return {};
    }

    const std::string wanted = std::to_string(deviceId);

    for (const auto& d : AudioDeviceManager::get().getAvailableDevices()) {
        if (d.id == wanted) {
            return d.supportedSampleRates;
        }
    }

    return {};
}

int32_t EngineManager::pickBestRateFor(
    int32_t fileRate,
    const std::vector<int32_t>& deviceRates
) const {

    if (fileRate <= 0) {
        return 48000;
    }

    // Tidak ada info perangkat: pakai jalur lama lewat detector, yang membaca
    // perangkat output aktif.
    if (deviceRates.empty()) {
        return audio::DeviceRateDetector::pickBestRate(fileRate);
    }

    // 1. Persis didukung -> tanpa konversi sama sekali.
    if (std::binary_search(deviceRates.begin(), deviceRates.end(), fileRate)) {
        return fileRate;
    }

    // 2. Kelipatan bulat terkecil (upsample integer). Rate conversion
    //    fraksional (44.1k -> 48k) butuh interpolasi yang mengubah sampel;
    //    kelipatan bulat tidak.
    int32_t bestMultiple = 0;
    for (int32_t r : deviceRates) {
        if (r > fileRate && r % fileRate == 0) {
            if (bestMultiple == 0 || r < bestMultiple) bestMultiple = r;
        }
    }
    if (bestMultiple > 0) return bestMultiple;

    // 3. Laju tertinggi perangkat yang TIDAK melebihi laju file - turun
    //    sesedikit mungkin, tetap dalam rentang yang benar-benar didukung.
    int32_t bestLower = 0;
    for (int32_t r : deviceRates) {
        if (r <= fileRate && r > bestLower) bestLower = r;
    }
    if (bestLower > 0) return bestLower;

    // 4. Semua laju perangkat lebih tinggi dari laju file (jarang): pakai
    //    yang terendah supaya kenaikan sesedikit mungkin.
    return deviceRates.front();
}

bool EngineManager::setRequestedDeviceId(int32_t deviceId) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (deviceId > 0) {
        // Validasi terhadap daftar device yang dikenal: menerima id yang tidak
        // ada berarti melaporkan "berhasil" untuk perangkat yang tidak akan
        // pernah bisa dibuka.
        const auto devices =
            AudioDeviceManager::get().getAvailableDevices();

        // AudioDeviceDescriptor::id adalah id Android dalam bentuk string
        // (dari AudioDeviceInfo.getId()), jadi dibandingkan sebagai string.
        const std::string wanted = std::to_string(deviceId);

        bool known = false;
        for (const auto& d : devices) {
            if (d.id == wanted) {
                known = true;
                break;
            }
        }

        if (!known) {
            __android_log_print(ANDROID_LOG_WARN, "EngineManager",
                "setRequestedDeviceId: id %d tidak ada di daftar %zu device",
                deviceId, devices.size());
            return false;
        }
    }

    const int32_t prev =
        mRequestedDeviceId.exchange(deviceId, std::memory_order_acq_rel);

    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "setRequestedDeviceId: %d -> %d", prev, deviceId);

    if (prev == deviceId) {
        return true;
    }

    // Stream yang sedang berjalan masih memakai perangkat lama - pilihan device
    // hanya berlaku saat stream dibuka. Tutup dan buka ulang dengan laju dan
    // perangkat yang baru, pola yang sama dengan setExclusiveMode().
    if (!mEngine.isRunning()) {
        return true;
    }

    const bool exclusiveMode =
        mEngine.isExclusive();

    // Perangkat sudah diganti di preferensi, jadi laju harus dihitung ulang
    // dari kapabilitas perangkat BARU - bukan dari perangkat yang sedang
    // berjalan. DAC 96 kHz bisa didukung, speaker internal mungkin tidak.
    AudioDeviceManager::get().refreshDevices();
    audio::DeviceRateDetector::refresh();

    const int32_t requestedDevice =
        resolveRequestedDeviceId();

    const auto deviceRates = supportedRatesFor(requestedDevice);

    int32_t requestedRate = resolveRequestedRate();
    if (requestedRate > 0) {
        requestedRate = pickBestRateFor(requestedRate, deviceRates);
    }

    mEngine.stop();

    mEngine.start(
        exclusiveMode,
        requestedRate,
        requestedDevice
    );

    // Perpindahan ke perangkat dengan jalur langsung (DAC) tidak otomatis
    // berarti bit-perfect: AAudio masih bisa menolak exclusive, dan DAC bisa
    // menolak laju file. Catat keduanya supaya tidak perlu menebak.
    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "setRequestedDeviceId: stream dibuka ulang pada device=%d (diminta %d) "
        "rate=%d - device-dihormati=%s, laju-sama-dengan-file=%s, exclusive=%s, "
        "jalur-mustahil-bit-perfect=%s",
        mEngine.actualDeviceId(), requestedDevice, requestedRate,
        mEngine.isDeviceHonored() ? "ya" : "TIDAK",
        isRateHonored() ? "ya" : "TIDAK",
        mEngine.isExclusive() ? "ya" : "tidak",
        isPathInherentlyLossy() ? "ya" : "tidak");

    return true;
}

int32_t EngineManager::requestedDeviceId() const {
    return mRequestedDeviceId.load(std::memory_order_acquire);
}

int32_t EngineManager::actualDeviceId() const {
    return mEngine.actualDeviceId();
}

bool EngineManager::isDeviceHonored() const {
    return mEngine.isDeviceHonored();
}

bool EngineManager::isPathInherentlyLossy() const {
    return mEngine.isPathInherentlyLossy();
}

// Apakah laju stream yang berjalan sama dengan laju file.
//
// Sumbernya sengaja laju stream AKTUAL, bukan hasil pickBestRate(): kalau
// perangkat menolak laju yang diminta, stream terbuka di laju lain dan
// perbandingan ini menangkapnya. Menghitung dari yang DIMINTA akan selalu
// mengaku bit-perfect.
bool EngineManager::isRateHonored() const {

    const uint32_t fileRate = mPlayback.currentFileSampleRate();
    if (fileRate < 8000 || fileRate > 768000) {
        // Laju file tidak diketahui - tidak ada yang bisa diklaim.
        return false;
    }

    const int32_t streamRate = mEngine.actualSampleRate();
    if (streamRate <= 0) {
        return false;
    }

    return static_cast<uint32_t>(streamRate) == fileRate;
}

// Perangkat yang SEDANG dipakai stream.
//
// Memakai actualDeviceId() (bukan yang diminta): kalau permintaan tidak
// dihormati, yang dilaporkan adalah perangkat yang benar-benar mengeluarkan
// suara - itu yang dibutuhkan UI supaya tidak menyebut nama DAC yang salah.
AudioDeviceDescriptor EngineManager::currentOutputDevice() const {

    const int32_t actualId = mEngine.actualDeviceId();

    if (actualId <= 0) {
        // Stream memilih sendiri (atau belum dibuka). `currentDevice` tidak
        // bisa diandalkan di sini: ia melaporkan perangkat yang DIPILIH,
        // bukan yang benar-benar dipakai.
        return AudioDeviceDescriptor{};
    }

    const std::string wanted = std::to_string(actualId);

    for (const auto& d : AudioDeviceManager::get().getAvailableDevices()) {
        if (d.id == wanted) {
            return d;
        }
    }

    // Terkenal oleh Android tapi tidak ada di daftar (belum di-refresh).
    // Kembalikan descriptor minimal dengan id-nya supaya pemanggil tahu
    // perangkatnya BUKAN yang diminta.
    AudioDeviceDescriptor unknown;
    unknown.id = wanted;
    unknown.type = DeviceType::UNKNOWN;
    return unknown;
}

void EngineManager::onDeviceRemoved(int32_t deviceId) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (!mEngine.isRunning()) {
        return;
    }

    // Kabar device hilang dari AudioDeviceCallback sudah melepas preferensi di
    // AudioDeviceManager (device yang dicabut tidak boleh tetap jadi pilihan).
    // Di sini yang perlu diputuskan: apakah stream yang sedang berjalan
    // memakai device itu?
    const int32_t requested =
        mRequestedDeviceId.load(std::memory_order_acquire);

    const int32_t actual =
        mEngine.actualDeviceId();

    const bool affected =
        (requested > 0 && requested == deviceId) ||
        (actual > 0 && actual == deviceId);

    if (!affected) {
        return;
    }

    __android_log_print(ANDROID_LOG_WARN, "EngineManager",
        "onDeviceRemoved: device %d hilang saat stream berjalan "
        "(diminta=%d, dipakai=%d) - memindahkan stream",
        deviceId, requested, actual);

    // Permintaan eksplisit untuk device yang sudah tidak ada harus dilepas;
    // kalau tidak, setiap start berikutnya mencoba membuka device hantu.
    if (requested == deviceId && deviceId > 0) {
        mRequestedDeviceId.store(0, std::memory_order_release);
    }

    const bool exclusiveMode =
        mEngine.isExclusive();

    const int32_t requestedDevice =
        resolveRequestedDeviceId();

    const auto deviceRates = supportedRatesFor(requestedDevice);

    int32_t requestedRate = resolveRequestedRate();
    if (requestedRate > 0) {
        requestedRate = pickBestRateFor(requestedRate, deviceRates);
    }

    mEngine.stop();

    mEngine.start(
        exclusiveMode,
        requestedRate,
        resolveRequestedDeviceId()
    );

    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "onDeviceRemoved: stream dipindah ke device=%d (diminta=%d)",
        mEngine.actualDeviceId(), resolveRequestedDeviceId());
}

void EngineManager::stop() {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (
        !mEngine.isRunning()
    ) {
        return;
    }

    mEngine.stop();
}

// =====================================================
// PLAYBACK
// =====================================================

void EngineManager::play() {

    mPlayback.play();
}

void EngineManager::pause() {

    mPlayback.pause();
}

// =====================================================
// DSP CONTROL
// =====================================================

void EngineManager::setDSPEnabled(
    bool enabled
) {

    mEngine.setDSPEnabled(
        enabled
    );
}

void EngineManager::setLimiterEnabled(
    bool enabled
) {

    mEngine.setLimiterEnabled(
        enabled
    );
}

void EngineManager::setEqBand(
    int band,
    float gainDb
) {

    mEngine.setEqBand(
        band,
        gainDb
    );
}

void EngineManager::setBassBoost(
    float gainDb
) {

    mEngine.setBassBoost(
        gainDb
    );
}

void EngineManager::setSolfeggioFreq(float freq) {
    mEngine.setSolfeggioFreq(freq);
}

void EngineManager::setBrainwaveFreq(float freq) {
    mEngine.setBrainwaveFreq(freq);
}

void EngineManager::setResonanceIntensity(float intensity) {
    mEngine.setResonanceIntensity(intensity);
}

void EngineManager::setImmersiveEnabled(bool enabled) {
    mEngine.setImmersiveEnabled(enabled);
}

void EngineManager::setMasterGain(
    float gain
) {

    mEngine.setMasterGain(
        gain
    );
}

void EngineManager::setBalance(
    float balance
) {

    mEngine.setBalance(
        balance
    );
}

void EngineManager::setStereoWide(
    float width
) {

    mEngine.setStereoWidth(
        width
    );
}

// =====================================================
// PROCESSING MODE
// =====================================================

void EngineManager::setProcessingMode(
    ProcessingMode mode
) {

    mState.setProcessingMode(mode);

    mEngine.setProcessingMode(
        mode
    );
}

// =====================================================
// EXCLUSIVE MODE
// =====================================================

void EngineManager::setExclusiveMode(
    bool enabled
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    const bool wasRunning =
        mEngine.isRunning();

    if (wasRunning) {

        mEngine.stop();
    }

    mState.setExclusiveMode(enabled);

    if (wasRunning) {

        // Stream dibuka ULANG di sini. Kalau laju tidak diteruskan, toggle
        // exclusive mode mengembalikan stream ke laju tertinggi perangkat
        // dan membatalkan pilihan laju file yang sudah ditetapkan.
        const int32_t requestedDevice =
            resolveRequestedDeviceId();

        const auto deviceRates = supportedRatesFor(requestedDevice);

        int32_t requestedRate = resolveRequestedRate();
        if (requestedRate > 0) {
            requestedRate = pickBestRateFor(requestedRate, deviceRates);
        }

        // Perangkat juga harus diteruskan: membuka ulang tanpa id-nya
        // mengembalikan audio ke perangkat default sistem, membatalkan
        // pilihan DAC yang sedang berlaku.
        mEngine.start(
            enabled,
            requestedRate,
            requestedDevice
        );
    }
}

// =====================================================
// METRICS
// =====================================================

EngineStats
EngineManager::getStats() const {

    return mEngine.getStats();
}

bool EngineManager::isExclusive() const {
    return mEngine.isExclusive();
}

int32_t EngineManager::actualSampleRate() const {
    return mEngine.actualSampleRate();
}

} // namespace pristine 