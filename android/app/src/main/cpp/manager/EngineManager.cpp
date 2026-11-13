// =====================================================
// manager/EngineManager.cpp
// =====================================================

#include "EngineManager.h"

#include <android/log.h>

#include "../core/RateSelection.h"

#include <chrono>
#include <system_error>

namespace pristine {

// (C-W6-mgr, 2026-11-12): kemas pasangan (id perangkat, laju Hz) jadi satu
// int64 untuk mDishonoredRateKey — bit atas = id perangkat, bit bawah =
// laju. Satu atomic = pasangan tidak bisa robek antar-thread. id dan laju
// di sini selalu > 0 (dijaga call site), jadi hasil tidak pernah 0 —
// 0 tetap berarti "belum ada pelajaran".
static int64_t dishonoredRateKey(int32_t deviceId, int32_t rate) {
    return (static_cast<int64_t>(deviceId) << 32) |
           static_cast<uint32_t>(rate);
}

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

    // =================================================
    // STREAM DIPUTUS PAKSA OLEH SISTEM (C-K2, 2026-11-12)
    // =================================================
    //
    // Dipasang SEKALI di sini, di konstruktor — bukan tiap start().
    // Dulu dipasang di start() (di luar cek isRunning()): setiap start()
    // menulis ulang std::function di AudioEngine tanpa lock, sementara
    // thread error Oboe bisa menyalinnya di onErrorAfterClose() — race.
    // Sekali pasang cukup karena:
    //   - EngineManager singleton (Meyer): konstruktor jalan sekali
    //     seumur proses, dan mEngine tidak pernah di-recreate;
    //   - handler tersimpan di AudioStreamController dan bertahan melewati
    //     stop()/start()/reopen — reopen() memanggil mEngine.start()
    //     langsung dan tidak pernah memasang ulang;
    //   - penulisan ini terjadi sebelum stream pertama dibuka, jadi
    //     sebelum callback error Oboe mana pun bisa membaca handler.
    //
    // Kasus nyata: headset dicolok. Android memindahkan rute dan mengirim
    // `request DISCONNECT in data callback`; stream ditutup paksa dan Oboe
    // memanggil AudioStreamController::onErrorAfterClose(). Tanpa handler
    // ini, stream hilang dan audio mati permanen sampai user mengganti
    // device lewat jalur lain (onDeviceRemoved).
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
}

// =====================================================
// DESTRUCTOR (PB6-W6, 2026-11-12)
// =====================================================
//
// Body destruktor jalan SEBELUM member mana pun dihancurkan: stream
// ditutup selagi mPlayback masih hidup. Tanpa ini, urutan hancur member
// (mPlayback dulu, baru mEngine) membiarkan callback Oboe render() pada
// mPlayback yang sudah hancur — UAF — karena ~AudioEngine() baru
// memanggil stop() sesudahnya. Lihat komentar di EngineManager.h.
//
// stop() idempotent (StreamController::stop()/close() no-op saat stream
// null, reset() hanya clear + atomic store 0), jadi stop() di sini +
// stop() lagi dari ~AudioEngine() aman.
EngineManager::~EngineManager() {

    mEngine.stop();
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

    // (B12-W5): play yang sampai ke sini membatalkan idle-close yang
    // mungkin sedang tidur — stream yang baru dibuka tidak boleh ditutup
    // timer yang di-arm dari pause sebelumnya. Hanya bump generasi
    // atomik, tanpa lock. (Jalur play saat engine SUDAH berjalan tidak
    // lewat sini — di sana nativePlay memanggil cancelIdleClose()
    // langsung.)
    cancelIdleClose();

    // unique_lock (bukan lock_guard): lock HARUS bisa dilepas sebelum
    // reloadIfDecoderRateMismatch() di akhir fungsi (D-M2, 2026-11-11) —
    // lihat komentar di sana.
    std::unique_lock<std::mutex>
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

    // Kapabilitas perangkat dibaca ulang dari Android SEBELUM dipakai
    // memilih laju — DAC 384 kHz yang baru dicolok tidak boleh tetap dibuka
    // di 48 kHz karena daftar laju yang dipakai masih daftar speaker
    // internal. (C-R1, 2026-11-12: dulu di sini DeviceRateDetector::refresh()
    // yang membaca perangkat output AKTIF menurut Android — dan itu belum
    // tentu perangkat yang kita minta, kalau AudioFlinger belum memindahkan
    // rutenya. Kini AudioDeviceManager satu-satunya sumber data perangkat:
    // laju diambil dari deskriptor perangkat yang DIPILIH lewat
    // supportedRatesFor() di bawah, dan tidak ada lagi daftar gabungan
    // semua perangkat.)
    AudioDeviceManager::get().refreshDevices();

    const auto deviceRates = supportedRatesFor(requestedDevice);

    // Laju stream DIPILIH DARI LAJU FILE, bukan dari laju tertinggi perangkat.
    //
    // pickBestRate() mengembalikan laju file kalau perangkat mendukungnya
    // (bit-perfect, tanpa konversi sama sekali), lalu kelipatan bulat
    // terdekat, baru laju tertinggi yang didukung. Sebelum ini argumen kedua
    // mEngine.start() tidak pernah diisi sehingga selalu 0 -> engine memilih
    // laju TERTINGGI perangkat (file 44.1 kHz di DAC 384 kHz = upsampling 8.7x).
    const int32_t fileRate = resolveRequestedRate();

    // Bit-perfect (pra-stream): laju file didukung perangkat yang dipilih?
    // deviceRates kosong ada dua arti — tidak diketahui, atau perangkat
    // mendukung laju sembarang — jadi jangan tebak dari daftar kosong;
    // tanya manager yang tahu bedanya. Tanpa perangkat yang dipilih, tidak
    // ada yang bisa diklaim (bukan "tidak" — "tidak diketahui").
    // (C-R1: dulu isBitPerfectFor() menjawab "ya" dari daftar GABUNGAN
    // semua perangkat — DAC lain yang mendukung tidak berarti perangkat
    // yang dipakai mendukung.)
    const char* bitPerfectStr = "tidak diketahui";
    if (requestedDevice > 0 && fileRate > 0) {
        bitPerfectStr =
            AudioDeviceManager::get().deviceSupportsRate(requestedDevice, fileRate)
                ? "ya"
                : "tidak";
    }

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
            bitPerfectStr,
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

    // (C-R1) AudioDeviceManager satu-satunya sumber data perangkat.
    return AudioDeviceManager::get().supportedRatesForDevice(deviceId);
}

int32_t EngineManager::pickBestRateFor(
    int32_t fileRate,
    const std::vector<int32_t>& deviceRates
) const {

    // (C-R1) Satu-satunya implementasi aturan pemilihan laju ada di
    // core/RateSelection.h; fungsi ini hanya delegasi supaya call site
    // (start/reopen/onTrackLoaded/setRequestedDeviceId) tidak berubah.
    return audio::pickBestRate(fileRate, deviceRates);
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

    // C-W4-mgr (2026-11-12): konstruktor std::thread bisa melempar
    // std::system_error (mis. sistem kehabisan resource / tidak bisa
    // membuat thread). Tanpa try/catch, exception itu lolos ke pemanggil
    // — callback error Oboe / onTrackLoaded — dan terminate() karena
    // tidak ada yang menangkapnya di sana. Lebih buruk lagi,
    // mRecoveryRunning SUDAH true saat spawn gagal, jadi recovery mati
    // permanen: setiap panggilan berikutnya kembali lebih awal di guard
    // "worker masih berjalan".
    //
    // Karena itu, saat spawn gagal: kembalikan KEDUA flag ke false.
    // Hanya membersihkan mRecoveryRunning TIDAK cukup — mRecoveryPending
    // masih true, jadi panggilan berikutnya kembali lebih awal di dedup
    // "sudah ada permintaan tertunda" dan tidak ada worker yang pernah
    // jalan. Urutan pembersihan: running dulu, baru pending — supaya
    // panggilan yang menyelinap di antaranya paling buruk hanya
    // menggabungkan permintaan yang terbuang, bukan meninggalkan state
    // pending-true tanpa worker. Permintaan yang gagal ini terbuang
    // (dicatat di log ERROR), tapi state kembali idle sehingga kejadian
    // putus berikutnya bisa memulai worker baru seperti biasa.
    try {
        std::thread([this] {
            runStreamRecovery();
        }).detach();
    } catch (const std::exception& e) {
        mRecoveryRunning.store(false, std::memory_order_release);
        mRecoveryPending.store(false, std::memory_order_release);
        __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
            "requestStreamRecovery: gagal membuat worker thread (%s) - "
            "recovery dibatalkan, flag dibersihkan", e.what());
    } catch (...) {
        mRecoveryRunning.store(false, std::memory_order_release);
        mRecoveryPending.store(false, std::memory_order_release);
        __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
            "requestStreamRecovery: gagal membuat worker thread "
            "(exception tak dikenal) - recovery dibatalkan, flag dibersihkan");
    }
}

void EngineManager::runStreamRecovery() {

    // Loop: selama ada permintaan tertunda, kerjakan. Kejadian yang datang
    // SAAT recovery berjalan akan membuat satu putaran tambahan, jadi stream
    // yang diputus lagi (kabel goyang) tetap ditangani.
    //
    // Batas percobaan mencegah loop tak berujung kalau device benar-benar
    // rusak (mis. headset dicabut-colok terus-menerus) - setelah itu menyerah
    // dan biarkan jalur device biasa yang menangani.
    //
    // (W3-mgr, 2026-11-12): kMaxAttempts di bawah hanya membatasi SATU
    // worker. Worker lanjutan di ekor fungsi mendapat jatah baru, jadi
    // rantai worker tetap bisa jalan tanpa henti selagi event putus
    // terus datang. Karena itu hitung juga budget GLOBAL percobaan
    // berurutan (lintas worker, member mRecoveryConsecutiveAttempts):
    // tiap percobaan rapat menaikkan hitungan; jeda tenang 5 detik tanpa
    // percobaan me-resetnya (proksi recovery sukses / flapping reda).
    // Melewati budget bukan membuang permintaan — percobaan itu tetap
    // jalan sesudah jeda cooldown 2 detik — supaya stream yang mati
    // tidak terdampar tanpa pemicu berikutnya. Hasilnya rantai tidak
    // lagi menghantam stop/start tanpa jeda: paling ~10 percobaan per
    // ~3,5 detik (10x >=150 ms + cooldown 2 detik), bukan secepat
    // reopen selesai. Perilaku sukses/normal tidak berubah: satu putus
    // = 1 percobaan, colok-cabut beberapa kali = hitungan kecil, tidak
    // pernah kena cooldown.
    constexpr int kMaxAttempts = 5;
    constexpr int kMaxConsecutiveAttempts = 10;
    constexpr int64_t kQuietResetMs = 5000;
    constexpr int64_t kCooldownMs = 2000;

    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {

        if (!mRecoveryPending.exchange(false, std::memory_order_acq_rel)) {
            break;
        }

        // (W3-mgr): hitung percobaan ini ke budget global. steady_clock
        // (monotonik — kebal perubahan jam sistem) supaya jeda tenang
        // diukur benar.
        const int64_t nowMs =
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now().time_since_epoch())
                .count();
        const int64_t lastMs =
            mRecoveryLastAttemptMs.load(std::memory_order_acquire);
        const int consecutive =
            (lastMs == 0 || nowMs - lastMs > kQuietResetMs)
                ? 1
                : mRecoveryConsecutiveAttempts.load(
                      std::memory_order_acquire) +
                      1;
        mRecoveryConsecutiveAttempts.store(consecutive,
                                          std::memory_order_release);
        mRecoveryLastAttemptMs.store(nowMs, std::memory_order_release);

        if (consecutive > kMaxConsecutiveAttempts) {
            __android_log_print(ANDROID_LOG_WARN, "EngineManager",
                "runStreamRecovery: %d percobaan berurutan dalam %lld ms "
                "(device flapping?) - jeda cooldown %lld ms sebelum "
                "percobaan berikutnya",
                consecutive, (long long)kQuietResetMs,
                (long long)kCooldownMs);
            std::this_thread::sleep_for(
                std::chrono::milliseconds(kCooldownMs));
            // Reset supaya percobaan sesudah cooldown dihitung sebagai
            // awal rantai baru, bukan langsung kena cooldown lagi.
            mRecoveryConsecutiveAttempts.store(0, std::memory_order_release);
        }

        // Satu kesempatan bagi sistem untuk menyelesaikan perpindahan rute.
        // Tanpa ini stream baru bisa dibuka sebelum Android selesai
        // memindahkan rute, dan langsung diputus lagi.
        std::this_thread::sleep_for(std::chrono::milliseconds(150));

        // reopenStreamPreservingPlayback() mengambil mMutex dan membuka ulang
        // stream + memuat ulang track. Ini aman di sini karena kita TIDAK
        // berada di thread Oboe - Oboe sudah selesai menutup stream lama.
        //
        // C-W4-mgr (2026-11-12): kalau reopen melempar, exception itu
        // lolos dari worker thread yang detached -> terminate(), DAN
        // mRecoveryRunning tidak pernah dibersihkan (store(false) di
        // bawah loop tidak tercapai) -> recovery mati permanen. Tangkap,
        // catat, dan keluar dari loop supaya flag tetap dibersihkan di
        // bawah seperti jalur normal.
        try {
            reopenStreamPreservingPlayback();
        } catch (const std::exception& e) {
            __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
                "runStreamRecovery: reopenStreamPreservingPlayback "
                "melempar (%s) - menghentikan percobaan", e.what());
            break;
        } catch (...) {
            __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
                "runStreamRecovery: reopenStreamPreservingPlayback "
                "melempar exception tak dikenal - menghentikan percobaan");
            break;
        }
    }

    mRecoveryRunning.store(false, std::memory_order_release);

    // Kalau ada permintaan yang datang setelah loop keluar lewat batas
    // percobaan, coba sekali lagi agar tidak ada yang tertinggal.
    // (W3-mgr: worker lanjutan ini tetap terikat budget global di atas —
    // hitungan percobaan berurutan tidak di-reset saat spawn, jadi rantai
    // worker tidak bisa mengakali batas dengan ganti worker.)
    if (mRecoveryPending.load(std::memory_order_acquire) &&
        !mRecoveryRunning.exchange(true, std::memory_order_acq_rel)) {

        // C-W4-mgr (2026-11-12): sama seperti spawn di
        // requestStreamRecovery() — konstruktor std::thread bisa melempar,
        // dan di sini mRecoveryRunning SUDAH true (exchange di atas).
        // Tanpa try/catch: terminate() + flag stuck true -> recovery mati
        // permanen. Saat gagal, bersihkan kedua flag (running dulu, baru
        // pending — lihat komentar di requestStreamRecovery) supaya
        // kejadian putus berikutnya bisa memulai worker baru; permintaan
        // yang tertinggal ini terbuang dan dicatat di log ERROR.
        try {
            std::thread([this] {
                runStreamRecovery();
            }).detach();
        } catch (const std::exception& e) {
            mRecoveryRunning.store(false, std::memory_order_release);
            mRecoveryPending.store(false, std::memory_order_release);
            __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
                "runStreamRecovery: gagal membuat worker lanjutan (%s) - "
                "flag dibersihkan", e.what());
        } catch (...) {
            mRecoveryRunning.store(false, std::memory_order_release);
            mRecoveryPending.store(false, std::memory_order_release);
            __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
                "runStreamRecovery: gagal membuat worker lanjutan "
                "(exception tak dikenal) - flag dibersihkan");
        }
    }
}

// =====================================================
// IDLE-CLOSE STREAM (B12-W5, 2026-11-13)
// =====================================================
//
// Menutup stream sesudah 60 detik idle (pause/stop). Pola worker +
// generasi yang sama dengan requestStreamRecovery/runStreamRecovery:
// thread detached tidur di luar lock, generasi atomik yang membatalkan
// worker lama saat arm/cancel baru datang.
//
// Perbedaan sengaja dari recovery: tidak ada flag pending/running.
// Tiap arm adalah jendela idle baru dan menaikkan generasi — worker
// lama yang masih tidur kalah generasi dan kembali diam-diam. Tidak ada
// state yang bisa stuck kalau spawn gagal: generasi sudah naik, tidak
// ada worker yatim.

void EngineManager::armIdleClose() {

    // Tidak ada stream yang berjalan — tidak ada yang perlu ditutup.
    // (Pause/stop saat engine sudah mati, mis. sesudah idle-close
    // sebelumnya, mendarat di sini dan langsung kembali.)
    if (!mEngine.isRunning()) {
        return;
    }

    // Generasi baru = jendela idle baru. Worker lama (kalau ada) kalah
    // generasi dan tidak akan menutup apa pun.
    const uint64_t generation =
        mIdleCloseGen.fetch_add(1, std::memory_order_acq_rel) + 1;

    // C-W4-mgr (2026-11-12): konstruktor std::thread bisa melempar
    // (sistem kehabisan resource). Tanpa try/catch, exception lolos ke
    // pemanggil — JNI nativePause/nativeStop — dan terminate(). Di sini
    // tidak ada flag yang perlu dibersihkan: generasi sudah naik dan
    // tidak ada worker yatim; arm berikutnya memakai generasi baru.
    try {
        std::thread([this, generation] {
            runIdleClose(generation);
        }).detach();
    } catch (const std::exception& e) {
        __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
            "armIdleClose: gagal membuat worker thread (%s) - "
            "idle-close dibatalkan untuk jendela ini", e.what());
    } catch (...) {
        __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
            "armIdleClose: gagal membuat worker thread "
            "(exception tak dikenal) - idle-close dibatalkan "
            "untuk jendela ini");
    }
}

void EngineManager::cancelIdleClose() {

    // Batalkan SEMUA worker idle-close yang sedang tidur: generasi
    // mereka tidak akan pernah cocok lagi. Dipanggil dari nativePlay
    // (JNI) dan dari EngineManager::start() (defense-in-depth untuk
    // jalur play yang membuka stream baru).
    mIdleCloseGen.fetch_add(1, std::memory_order_acq_rel);
}

void EngineManager::runIdleClose(uint64_t generation) {

    constexpr int64_t kIdleCloseDelayMs = 60000;

    // TIDAK memegang mMutex selama menunggu: tidur di luar lock supaya
    // start()/reopen()/setRequestedDeviceId()/setExclusiveMode() tidak
    // pernah tertahan 60 detik oleh thread ini.
    std::this_thread::sleep_for(
        std::chrono::milliseconds(kIdleCloseDelayMs));

    // Dibatalkan (play ditekan) atau digantikan arm baru?
    if (mIdleCloseGen.load(std::memory_order_acquire) != generation) {
        return;
    }

    // Ambil mMutex DULU (pola yang sama dengan
    // reopenStreamPreservingPlayback): stop() di sini terserialisasi
    // terhadap start()/reopen()/setRequestedDeviceId()/setExclusiveMode()
    // — tidak ada stop yang menyelinap di tengah reopen, dan reopen yang
    // sedang berjalan menahan worker ini sampai selesai.
    std::lock_guard<std::mutex> lock(mMutex);

    // Cek ulang di bawah lock: cancel (play) yang datang di antara cek
    // di atas dan lock ini harus tetap menang.
    if (mIdleCloseGen.load(std::memory_order_acquire) != generation) {
        return;
    }

    if (!mEngine.isRunning()) {
        return;
    }

    // Defense-in-depth: jangan pernah menutup stream di tengah pemutaran.
    // Kalau status kembali Playing tanpa cancel (jalur yang tidak lewat
    // nativePlay), worker ini mundur — play berikutnya yang menentukan.
    if (auto st = mPlayback.state()) {
        if (st->getStatus() == playback::PlaybackStatus::Playing) {
            __android_log_print(ANDROID_LOG_INFO, "EngineManager",
                "idle-close: dibatalkan, status kembali Playing");
            return;
        }
    }

    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
        "idle-close: 60 dtk idle (pause/stop) - menutup stream "
        "(hemat baterai + lepas DAC)");
    mEngine.stop();
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

    // (C1-mgr, 2026-11-12): PAKAI PREFERENSI, bukan status stream lama.
    // mEngine.isExclusive() = APA YANG DIPAKAI stream lama — AAudio bisa
    // menolak exclusive (fallback shared), dan sesudah DAC dicabut stream
    // lama sudah mati. Membaca status lama di sini membuat preferensi
    // exclusive hilang permanen tiap reopen (cabut-colok DAC). Sama
    // seperti start() di atas, baca mState.exclusiveMode() (APA YANG
    // DIMINTA); kalau perangkat baru menolak, isExclusive() tetap jujur
    // melaporkan penolakan itu sesudah start.
    const bool exclusiveMode = mState.exclusiveMode();

    // (B13-W4): daftar perangkat bisa basi sesudah colok/cabut — segarkan
    // dulu, lalu validasi id yang diminta terhadap daftar INTERNAL
    // (getAvailableDevices, lengkap — BUKAN daftar tersaring JS dari
    // nativeGetDevices, supaya id sah tapi tak tampil di UI tetap lolos).
    // Id hantu: lepas preferensi eksplisit + preferensi aktif, sistem yang
    // memilih — jangan teruskan id mati ke start().
    AudioDeviceManager::get().refreshDevices();

    int32_t requestedDevice = resolveRequestedDeviceId();
    if (requestedDevice > 0) {
        const auto devices =
            AudioDeviceManager::get().getAvailableDevices();
        const std::string want = std::to_string(requestedDevice);
        const bool exists = std::any_of(devices.begin(), devices.end(),
            [&](const AudioDeviceDescriptor& d) { return d.id == want; });
        if (!exists) {
            __android_log_print(ANDROID_LOG_WARN, "EngineManager",
                "reopenStream: id device %d tidak ada lagi di daftar "
                "(%zu device) - preferensi dilepas, sistem yang memilih",
                requestedDevice, devices.size());
            mRequestedDeviceId.store(0, std::memory_order_release);
            AudioDeviceManager::get().setActiveDevice("");
            requestedDevice = 0;
        }
    }
    const auto deviceRates = supportedRatesFor(requestedDevice);

    int32_t requestedRate = resolveRequestedRate();
    if (requestedRate > 0) {
        requestedRate = pickBestRateFor(requestedRate, deviceRates);
    }

    const bool wasRunning = mEngine.isRunning();

    mEngine.stop();

    // start() membuka stream BARU. Ini yang memberi stream jalur ke device
    // yang sekarang aktif (headset yang baru dicolok).
    // (B13-W4): device yang diminta bisa gagal dibuka (mis. dicabut di
    // antara validasi dan start) — retry sekali tanpa preferensi device,
    // sistem yang memilih. start() aman diulang: open() diawali close()
    // idempotent, dan gagal start tidak meninggalkan stream setengah
    // terbuka; stop()/posisi/seek TIDAK diulang di sini — itu terjadi
    // sekali di bawah, sesudah start berhasil.
    bool ok = mEngine.start(exclusiveMode, requestedRate, requestedDevice);
    if (!ok && requestedDevice > 0) {
        __android_log_print(ANDROID_LOG_WARN, "EngineManager",
            "reopenStream: start di device %d gagal - retry tanpa "
            "preferensi device (sistem yang memilih)",
            requestedDevice);
        ok = mEngine.start(exclusiveMode, requestedRate, 0);
    }

    // (C-W6-mgr, 2026-11-12): BELAJAR dari hasil reopen ini — jangan ulangi
    // permintaan yang sudah terbukti sia-sia. Bandingkan laju yang DIMINTA
    // dengan laju stream AKTUAL (AAudio, getSampleRate() — sumber yang sama
    // dengan isRateHonored(), bukan klaim getSampleRates() perangkat):
    //   - tidak dihormati -> catat pasangan (perangkat aktual, laju yang
    //     diminta) supaya onTrackLoaded() tidak meminta reopen yang sama
    //     lagi di loadTrack berikutnya;
    //   - dihormati -> hapus pelajaran yang cocok (perangkat bisa berubah
    //     pikiran, mis. sesudah exclusive diaktifkan — pelajaran basi
    //     tidak boleh menahan reopen yang kini akan berhasil).
    // Hanya kalau id perangkat aktual diketahui (> 0); kalau 0, tidak ada
    // yang dicatat — perilaku lama dipertahankan. BUKAN logika pemilihan
    // laju: requestedRate di sini tetap hasil pickBestRate() seperti biasa.
    if (requestedRate > 0) {
        const int32_t actualDevice = mEngine.actualDeviceId();
        const int32_t actualRate = mEngine.actualSampleRate();
        if (actualDevice > 0 && actualRate > 0) {
            const int64_t key = dishonoredRateKey(actualDevice, requestedRate);
            if (actualRate == requestedRate) {
                int64_t expected = key;
                if (mDishonoredRateKey.compare_exchange_strong(
                        expected, 0, std::memory_order_acq_rel)) {
                    __android_log_print(ANDROID_LOG_INFO, "EngineManager",
                        "reopenStream: perangkat %d kini menghormati %d Hz - "
                        "pelajaran laju-tidak-dihormati dihapus",
                        actualDevice, requestedRate);
                }
            } else {
                mDishonoredRateKey.store(key, std::memory_order_release);
                __android_log_print(ANDROID_LOG_WARN, "EngineManager",
                    "reopenStream: perangkat %d TIDAK menghormati %d Hz "
                    "(stream tetap %d Hz) - dicatat, reopen untuk laju ini "
                    "tidak akan diulang sampai perangkat berganti",
                    actualDevice, requestedRate, actualRate);
            }
        }
    }

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

    // (C-W6-mgr, 2026-11-12): JANGAN minta reopen untuk pasangan
    // (perangkat, laju) yang sudah terbukti tidak dihormati. Reopen
    // sebelumnya untuk pasangan ini sudah menghitung `wanted` yang SAMA
    // dari klaim getSampleRates() yang SAMA dan tetap dibuka di laju yang
    // SAMA — mengulanginya di setiap loadTrack hanya membuang satu
    // stop/start + muat ulang + seek per track. Audio tetap jalan di laju
    // stream yang ada (decoder menargetkan laju itu); yang tidak tercapai
    // hanya bit-perfect, dan itu memang keadaan sebenarnya perangkat ini.
    // Pelajaran batal sendiri kalau perangkat berganti atau laju yang
    // diminta berubah (keduanya bagian dari kunci). Recovery putus-paksa
    // TIDAK kena gerbang ini — ia memanggil requestStreamRecovery()
    // langsung, bukan lewat sini.
    const int32_t actualDevice = mEngine.actualDeviceId();
    if (actualDevice > 0 &&
        mDishonoredRateKey.load(std::memory_order_acquire) ==
            dishonoredRateKey(actualDevice, wanted)) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "onTrackLoaded: perangkat %d sudah terbukti tidak menghormati "
            "%d Hz (stream tetap %d Hz) - reopen dilewati, audio tetap jalan",
            actualDevice, wanted, mEngine.actualSampleRate());
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

    // (B13-K1, 2026-11-14): JANGAN ambil mMutex di sini. Method ini jalan
    // di thread callback AudioDeviceCallback (HandlerThread
    // "pristine-device", dulu main thread) — mMutex bisa dipegang reopen
    // selama detik (FFmpeg open + salin content://), jadi lock di sini =
    // ANR / callback macet. Semua yang dibaca di bawah ini lock-free:
    // isRunning() dan actualDeviceId() hanya atomic load (actualDeviceId
    // menyalin shared_ptr di bawah mStreamMutex, yang tidak pernah
    // dipegang melewati panggilan Oboe), mRequestedDeviceId atomic,
    // requestStreamRecovery() hanya atomic exchange + spawn worker.
    // Reopen dikerjakan worker recovery, bukan callback — pemanggil (JNI
    // nativeOnDeviceRemoved) tidak menunggu reopen selesai.
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
        "(diminta=%d, dipakai=%d) - meminta recovery stream",
        deviceId, requested, actual);

    // Permintaan eksplisit untuk device yang sudah tidak ada harus dilepas;
    // kalau tidak, setiap start berikutnya mencoba membuka device hantu.
    // CAS supaya tidak menghapus permintaan BARU yang masuk di antara load
    // dan store di atas.
    int32_t expected = deviceId;
    mRequestedDeviceId.compare_exchange_strong(
        expected, 0, std::memory_order_acq_rel);

    // Perpindahan device = stream baru, tapi reopen dikerjakan worker
    // recovery (requestStreamRecovery), bukan di sini — callback langsung
    // kembali. Dulu reopenStreamPreservingPlayback() sinkron di sini
    // (B1, 2026-11-10): butuh mMutex + FFmpeg open, ANR di main thread.
    requestStreamRecovery();
}

// (EngineManager::stop() dihapus 2026-11-10: 0 caller. Engine hanya
// di-stop lewat mEngine.stop() di reopen().)

// (EngineManager::play()/pause() dihapus 2026-11-10: 0 caller. JNI memakai
// gPlaybackController->play()/pause() langsung.)

// =====================================================
// DSP CONTROL
// =====================================================

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

// (C-EQATOM, 2026-11-12): satu transaksi seqlock, bukan 10x setEqBand.
void EngineManager::setEqBands(
    const float* gains,
    int count
) {

    mEngine.setEqBands(
        gains,
        count
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

    // (C-CAST, 2026-11-12): lapis kedua defense-in-depth — JNI sudah
    // memvalidasi, tapi pemanggil C++ langsung (dan JNI lain di masa depan)
    // tidak melewati JNI. Nilai liar DITOLAK di sini juga: tidak ada state
    // yang berubah (mState, mEngine, dan processingAllowed tetap seperti
    // semula), supaya audio tidak pernah berjalan dengan mode yang tidak
    // terdefinisi. Bukan clamp ke DSP, alasannya sama seperti di JNI.
    if (!isValidProcessingMode(mode)) {

        __android_log_print(ANDROID_LOG_ERROR, "EngineManager",
            "mode pemrosesan liar ditolak: %d (valid: 0=BitPerfect, "
            "1=DSP, 2=Immersive) - mode lama dipertahankan",
            static_cast<int>(mode));
        return;
    }

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
// (EngineManager::getStats() dihapus 2026-11-10: 0 caller.
// C-DSPMETRIC, 2026-11-12: komentar lama di sini SALAH — "JNI membaca
// engine().getStats() langsung" tidak benar. Grep seluruh repo (cpp/java/
// kotlin/src): getStats() TIDAK punya pemanggil di mana pun — tidak ada JNI,
// Kotlin, maupun TS yang memanggil AudioEngine::getStats() /
// AudioMetrics::getStats(). Keduanya hanya terdefinisi, tidak pernah dibaca.)

bool EngineManager::isExclusive() const {
    return mEngine.isExclusive();
}

int32_t EngineManager::actualSampleRate() const {
    return mEngine.actualSampleRate();
}

} // namespace pristine 