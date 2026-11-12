// =====================================================
// manager/EngineManager.cpp
// =====================================================

#include "EngineManager.h"

#include <android/log.h>

#include <chrono>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

EngineManager::EngineManager()
    :

    mEngine(),

    mPlayback() {

    // Teruskan metrik engine ke PlaybackController supaya overrun decoder
    // (queue penuh, data dibuang) tercatat di EngineStats (M5, 2026-11-10).
    // mEngine dideklarasi sebelum mPlayback, jadi sudah dibangun di sini.
    mPlayback.setMetrics(&mEngine.metrics());

    // Beri tahu EngineManager setiap track berhasil dimuat, supaya stream
    // bisa dibuka ulang kalau laju file berubah (M1, 2026-11-10).
    mPlayback.setTrackLoadedListener([this]() { onTrackLoaded(); });
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

    // unique_lock (bukan lock_guard): lock HARUS bisa dilepas sebelum
    // reloadIfDecoderRateMismatch() di akhir fungsi (D-M2, 2026-11-11) —
    // lihat komentar di sana.
    std::unique_lock<std::mutex>
        lock(mMutex);

    // =================================================
    // STREAM DIPUTUS PAKSA OLEH SISTEM
    // =================================================
    //
    // Dipasang DI LUAR cek isRunning() di bawah: kalau dipasang setelah cek itu,
    // stream yang sudah berjalan (kasus paling umum - user menekan play lagi)
    // tidak punya penanganan disconnect, dan audio akan mati begitu headset
    // dicolok. Pemasangan bersifat idempoten, jadi aman dipanggil berkali-kali.
    //
    // Kasus nyata: headset dicolok. Android memindahkan rute dan mengirim
    // `request DISCONNECT in data callback`; stream ditutup paksa dan Oboe
    // memanggil AudioStreamController::onErrorAfterClose(). Sebelum ada
    // penanganan ini, stream hilang dan audio mati permanen sampai user
    // mengganti device lewat jalur lain (onDeviceRemoved).
    mEngine.setStreamDisconnectHandler([this] {
        __android_log_print(ANDROID_LOG_WARN, "EngineManager",
            "stream diputus sistem (headset dicolok / rute berubah) - "
            "menjadwalkan recovery");

        // PENTING: hanya menjadwalkan. Callback ini berjalan di thread Oboe
        // saat Oboe sedang menutup stream; reopen di sini akan deadlock.
        // Worker thread (requestStreamRecovery) yang mengerjakan reopen +
        // muat ulang track.
        requestStreamRecovery();
    });

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

    // 🔥 FIX (2026-11-11, D-M2): stream baru saja terbuka — kalau decoder
    // dibuat saat stream masih 0 (track pertama), target-nya mungkin
    // berbeda dari laju stream aktual (perangkat tidak mendukung laju file,
    // jadi stream dibuka di laju lain). Muat ulang track supaya decoder
    // menargetkan laju stream yang benar.
    //
    // LEPAS lock dulu (pola B1): reload memanggil loadTrack() →
    // trackLoadedListener → onTrackLoaded(). Sejak PB6-B1 handler itu hanya
    // menjadwalkan recovery async (tanpa lock), tapi loadTrack tetap
    // pekerjaan decoder yang lambat — jangan menahan mMutex selama itu.
    lock.unlock();
    if (mEngine.isRunning()) {
        mPlayback.reloadIfDecoderRateMismatch(mEngine.actualSampleRate());
    }
}

// =====================================================
// REQUESTED SAMPLE RATE
// =====================================================
//
// (setRequestedSampleRate() dihapus 2026-11-10: 0 caller. Laju stream selalu
// berasal dari laju file — lihat resolveRequestedRate().)
//
// Laju file dari controller (loadTrack). Jalur normal memang lewat sana: JS
// memuat track (loadTrack) sebelum engine start, dan loadTrack-lah yang
// tahu laju track.
int32_t EngineManager::resolveRequestedRate() const {

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

    // unique_lock (bukan lock_guard): lock HARUS dilepas sebelum
    // reopenStreamPreservingPlayback() di bawah — fungsi itu mengambil mMutex
    // sendiri, dan memanggilnya saat lock dipegang = deadlock (B1, 2026-11-10).
    std::unique_lock<std::mutex>
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

    // Device dipilih: stream harus DIBUKA ULANG di perangkat baru, dan track
    // dimuat ulang ke stream itu. Tanpa muat ulang, audio jadi senyap walau
    // pilihan device berhasil.
    //
    // LEPAS lock dulu: reopenStreamPreservingPlayback() mengambil mMutex
    // sendiri (B1). Pembacaan setelah reopen memakai getter atomik, jadi
    // aman tanpa lock. Reopen membaca state yang diminta di bawah lock-nya
    // sendiri, jadi tidak ada state basi.
    lock.unlock();
    reopenStreamPreservingPlayback();

    // Laporan dibaca SESUDAH restart, dari keadaan stream yang baru.
    const int32_t requestedDevice = resolveRequestedDeviceId();

    int32_t requestedRate = resolveRequestedRate();
    if (requestedRate > 0) {
        requestedRate = pickBestRateFor(
            requestedRate, supportedRatesFor(requestedDevice)
        );
    }

    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "setRequestedDeviceId: device=%d (diminta %d) rate=%d - "
        "device-dihormati=%s, laju-sama-dengan-file=%s, exclusive=%s, "
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

void EngineManager::requestStreamRecovery() {

    // Dipanggil dari THREAD OBOE. Syaratnya: tidak boleh lock, tidak boleh
    // alokasi, tidak boleh reopen di sini. Lihat komentar di header.
    //
    // Kalau sudah ada permintaan tertunda, cukup tandai - worker yang sedang
    // menunggu akan memprosesnya. Beberapa kejadian beruntun (colok-cabut
    // cepat) jadi satu reopen, bukan menumpuk.
    if (mRecoveryPending.exchange(true, std::memory_order_acq_rel)) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "requestStreamRecovery: sudah ada permintaan tertunda - digabung");
        return;
    }

    // Hanya satu worker hidup pada satu waktu.
    if (mRecoveryRunning.exchange(true, std::memory_order_acq_rel)) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "requestStreamRecovery: worker masih berjalan - ditangani di sana");
        return;
    }

    __android_log_print(ANDROID_LOG_WARN, "EngineManager",
        "requestStreamRecovery: worker recovery dimulai");

    std::thread([this] {
        runStreamRecovery();
    }).detach();
}

void EngineManager::runStreamRecovery() {

    // Loop: selama ada permintaan tertunda, kerjakan. Kejadian yang datang
    // SAAT recovery berjalan akan membuat satu putaran tambahan, jadi stream
    // yang diputus lagi (kabel goyang) tetap ditangani.
    //
    // Batas percobaan mencegah loop tak berujung kalau device benar-benar
    // rusak (mis. headset dicabut-colok terus-menerus) - setelah itu menyerah
    // dan biarkan jalur device biasa yang menangani.
    constexpr int kMaxAttempts = 5;

    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {

        if (!mRecoveryPending.exchange(false, std::memory_order_acq_rel)) {
            break;
        }

        // Satu kesempatan bagi sistem untuk menyelesaikan perpindahan rute.
        // Tanpa ini stream baru bisa dibuka sebelum Android selesai
        // memindahkan rute, dan langsung diputus lagi.
        std::this_thread::sleep_for(std::chrono::milliseconds(150));

        // reopenStreamPreservingPlayback() mengambil mMutex dan membuka ulang
        // stream + memuat ulang track. Ini aman di sini karena kita TIDAK
        // berada di thread Oboe - Oboe sudah selesai menutup stream lama.
        reopenStreamPreservingPlayback();
    }

    mRecoveryRunning.store(false, std::memory_order_release);

    // Kalau ada permintaan yang datang setelah loop keluar lewat batas
    // percobaan, coba sekali lagi agar tidak ada yang tertinggal.
    if (mRecoveryPending.load(std::memory_order_acquire) &&
        !mRecoveryRunning.exchange(true, std::memory_order_acq_rel)) {

        std::thread([this] {
            runStreamRecovery();
        }).detach();
    }
}

void EngineManager::reopenStreamPreservingPlayback() {

    // Guard reentrancy (M1): loadTrack() dipanggil DARI reopen() ini, dan
    // loadTrack() memicu trackLoadedListener → onTrackLoaded(). Sejak
    // PB6-B1 handler itu tidak lagi reopen sinkron, tapi flag ini tetap
    // membuatnya kembali lebih awal supaya tidak ada permintaan recovery
    // sia-sia dari dalam reopen sendiri. RAII supaya flag selalu kembali
    // false walau ada exception.
    struct ReopenGuard {
        std::atomic<bool>& flag;
        explicit ReopenGuard(std::atomic<bool>& f) : flag(f) {
            flag.store(true, std::memory_order_release);
        }
        ~ReopenGuard() {
            flag.store(false, std::memory_order_release);
        }
        ReopenGuard(const ReopenGuard&) = delete;
        ReopenGuard& operator=(const ReopenGuard&) = delete;
    };
    ReopenGuard reopenGuard(mReopening);

    std::lock_guard<std::mutex>
        lock(mMutex);

    // Posisi & status pemutaran diselamatkan DULU: stop() + loadTrack()
    // me-reset keduanya, dan tanpa menyimpannya audio akan melompat ke awal
    // setiap kali kabel headset tersentuh.
    double savedSeconds = 0.0;
    bool wasPlaying = false;
    bool hadTrack = false;

    if (mPlayback.isInitialized()) {
        if (auto st = mPlayback.state()) {
            savedSeconds = st->getPosition().positionMs / 1000.0;
            wasPlaying =
                st->getStatus() == playback::PlaybackStatus::Playing;
        }
    }

    uint32_t savedFileRate = mPlayback.currentFileSampleRate();

    // Track yang sedang dimuat, untuk dimuat ulang ke stream baru.
    pristine::playback::TrackInfo current{};
    if (auto q = mPlayback.queue()) {
        if (auto t = q->current()) {
            current = *t;
            hadTrack = !current.uri.empty();
        }
    }

    const bool exclusiveMode = mEngine.isExclusive();

    const int32_t requestedDevice = resolveRequestedDeviceId();
    const auto deviceRates = supportedRatesFor(requestedDevice);

    int32_t requestedRate = resolveRequestedRate();
    if (requestedRate > 0) {
        requestedRate = pickBestRateFor(requestedRate, deviceRates);
    }

    const bool wasRunning = mEngine.isRunning();

    mEngine.stop();

    // start() membuka stream BARU. Ini yang memberi stream jalur ke device
    // yang sekarang aktif (headset yang baru dicolok).
    mEngine.start(exclusiveMode, requestedRate, requestedDevice);

    // =============================================
    // MUAT ULANG TRACK ke stream baru
    // =============================================
    //
    // Inilah inti perbaikannya. Tanpa ini `PlaybackController` tetap memegang
    // state lama: queue PCM kosong untuk stream baru -> render() senyap.
    //
    // Laju file dikembalikan SEBELUM loadTrack karena loadTrack membacanya
    // dari TrackInfo, dan TrackInfo bisa saja tidak membawa laju (0) kalau
    // track dimuat dari jalur lama.
    if (hadTrack && mEngine.isRunning()) {
        if (savedFileRate > 0) {
            mPlayback.setStreamSampleRate(mEngine.actualSampleRate());
        }

        mPlayback.loadTrack(current);

        // Kembalikan posisi. loadTrack me-reset ke 0, jadi seek dilakukan
        // setelah decoder siap mengisinya.
        if (savedSeconds > 0.5) {
            mPlayback.seek(savedSeconds);
        }

        if (wasPlaying) {
            mPlayback.play();
        }

        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "reopenStream: stream=%d, track dimuat ulang, posisi %.1fs, "
            "playing=%s (sebelumnya running=%s)",
            mEngine.actualSampleRate(), savedSeconds,
            wasPlaying ? "ya" : "tidak", wasRunning ? "ya" : "tidak");
    } else {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "reopenStream: stream=%d, tidak ada track aktif untuk dimuat ulang",
            mEngine.actualSampleRate());
    }
}

void EngineManager::onTrackLoaded() {

    // Reopen sedang berjalan (termasuk reopen yang memanggil loadTrack ini)
    // — lewati. Reopen sudah memakai laju terbaru.
    if (mReopening.load(std::memory_order_acquire)) {
        return;
    }

    // Stream belum berjalan: start() berikutnya sudah memakai laju file
    // lewat resolveRequestedRate(). Tidak ada yang perlu dibuka ulang.
    if (!mEngine.isRunning()) {
        return;
    }

    // Laju yang SEHARUSNYA dipakai — dihitung persis seperti di
    // reopenStreamPreservingPlayback(): laju yang diminta (override
    // eksplisit -> laju file) dipetakan ke laju terbaik perangkat.
    const int32_t requestedDevice = resolveRequestedDeviceId();
    const auto deviceRates = supportedRatesFor(requestedDevice);

    int32_t wanted = resolveRequestedRate();
    if (wanted > 0) {
        wanted = pickBestRateFor(wanted, deviceRates);
    }

    if (wanted <= 0) {
        return;
    }

    // Stream sudah di laju yang benar — tidak ada yang dilakukan.
    // Perbandingan ini yang membuat handler idempotent: loadTrack() DI DALAM
    // reopen() memanggil handler ini lagi, dan di titik itu stream sudah
    // berjalan di laju baru.
    if (mEngine.actualSampleRate() == wanted) {
        return;
    }

    // 🔥 FIX (2026-11-12, PB6-B1): JANGAN reopen sinkron dari sini.
    // Listener ini dipanggil dari dalam PlaybackController::loadTrack(),
    // yang memegang loadTrackMutex_ sepanjang fungsi. reopen...() butuh
    // mMutex DULU lalu memanggil loadTrack() lagi — urutan
    // loadTrackMutex_ -> mMutex ini berlawanan dengan urutan di dalam
    // reopen() (mMutex -> loadTrackMutex_), dan guard mReopening tidak
    // menutup jalurnya (cek-lalu-bertindak tidak atomik terhadap
    // set-flag + lock). Jadi hanya minta dijadwalkan:
    // requestStreamRecovery() tanpa lock (dedup mRecoveryPending), worker
    // tidur 150 ms lalu reopen setelah loadTrack() pemanggil selesai dan
    // melepas loadTrackMutex_. Sesudah ini satu-satunya urutan lock yang
    // ada adalah mMutex -> loadTrackMutex_.
    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "onTrackLoaded: laju file berubah (stream=%d, seharusnya=%d) - "
        "meminta recovery stream",
        mEngine.actualSampleRate(), wanted);

    requestStreamRecovery();
}

void EngineManager::onDeviceRemoved(int32_t deviceId) {

    // unique_lock (bukan lock_guard): lock HARUS dilepas sebelum
    // reopenStreamPreservingPlayback() di bawah — fungsi itu mengambil mMutex
    // sendiri, dan memanggilnya saat lock dipegang = deadlock (B1, 2026-11-10).
    // Method ini jalan di main thread (AudioDeviceCallback) — deadlock di sini
    // = ANR.
    std::unique_lock<std::mutex>
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

    // Perpindahan device = stream baru. Memakai reopenStreamPreservingPlayback
    // (bukan mEngine.stop()+start() mentah) karena stream baru butuh decoder
    // yang benar-benar mengisi queue-nya - kalau tidak, audio jadi senyap
    // tanpa error. Lihat catatan di EngineManager.h.
    //
    // LEPAS lock dulu: reopenStreamPreservingPlayback() mengambil mMutex
    // sendiri (B1).
    lock.unlock();
    reopenStreamPreservingPlayback();
}

// (EngineManager::stop() dihapus 2026-11-10: 0 caller. Engine hanya
// di-stop lewat mEngine.stop() di reopen().)

// (EngineManager::play()/pause() dihapus 2026-11-10: 0 caller. JNI memakai
// gPlaybackController->play()/pause() langsung.)

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

// =====================================================
// KOREKSI HEADPHONE (Fase D)
// =====================================================

bool EngineManager::loadHeadphonePreset(
    const std::string& presetText,
    const std::string& name
) {

    return mEngine.loadHeadphonePreset(
        presetText,
        name
    );
}

int EngineManager::validateHeadphonePreset(
    const std::string& presetText
) const {

    return mEngine.validateHeadphonePreset(
        presetText
    );
}

void EngineManager::clearHeadphonePreset() {

    mEngine.clearHeadphonePreset();
}

void EngineManager::setHeadphoneCorrectionEnabled(
    bool enabled
) {

    mEngine.setHeadphoneCorrectionEnabled(
        enabled
    );
}

bool EngineManager::isHeadphoneCorrectionEnabled() const {

    return mEngine.isHeadphoneCorrectionEnabled();
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

    // 🔥 FASE R (2026-11-11) + PB6-W1 (2026-11-12): processing = FORCED
    // OFF di mode bit-perfect — retune, laju playback, dan fade track.
    // PlaybackController memakai rasio/laju efektif 1.0 (bypass) saat
    // tidak diizinkan dan fade anti-klik 10 ms; nilai yang disimpan tidak
    // hilang, jadi keluar dari bit-perfect langsung mengembalikan tuning
    // + laju tanpa set ulang.
    mPlayback.setProcessingAllowed(mode != ProcessingMode::BitPerfect);
}

// =====================================================
// EXCLUSIVE MODE
// =====================================================

void EngineManager::setExclusiveMode(
    bool enabled
) {

    // unique_lock (bukan lock_guard): lock HARUS dilepas sebelum
    // reopenStreamPreservingPlayback() di bawah — fungsi itu mengambil mMutex
    // sendiri, dan memanggilnya saat lock dipegang = deadlock (B1, 2026-11-10).
    std::unique_lock<std::mutex>
        lock(mMutex);

    const bool wasRunning =
        mEngine.isRunning();

    // Preferensi diset DULU supaya restart di bawah memakai nilai baru.
    // (Sebelumnya ada stop() terpisah di sini, tapi reopenStreamPreservingPlayback
    // sudah menutup stream sendiri - memanggilnya dua kali hanya menambah jeda.)
    mState.setExclusiveMode(enabled);

    if (wasRunning) {

        // Stream dibuka ULANG di sini. Memakai reopenStreamPreservingPlayback
        // supaya track ikut dimuat ulang ke stream baru - kalau hanya stop+start,
        // audio jadi senyap (queue PCM kosong untuk stream baru).
        //
        // LEPAS lock dulu: reopenStreamPreservingPlayback() mengambil mMutex
        // sendiri (B1). setExclusiveMode di atas sudah selesai (atomik),
        // jadi tidak ada state yang perlu dilindungi melewati reopen.
        lock.unlock();
        reopenStreamPreservingPlayback();
    }
}

// =====================================================
// (EngineManager::getStats() dihapus 2026-11-10: 0 caller. JNI membaca
// engine().getStats() langsung.)

bool EngineManager::isExclusive() const {
    return mEngine.isExclusive();
}

int32_t EngineManager::actualSampleRate() const {
    return mEngine.actualSampleRate();
}

} // namespace pristine 