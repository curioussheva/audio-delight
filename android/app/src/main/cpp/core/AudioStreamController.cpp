// =====================================================
// core/AudioStreamController.cpp
// =====================================================

#include "AudioStreamController.h"

#include "../devices/AudioDeviceManager.h"

#include <android/log.h>
#include <string>
#include <utility>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioStreamController::
AudioStreamController() = default;

// =====================================================
// DESTRUCTOR
// =====================================================

AudioStreamController::
~AudioStreamController() {

    close();
}

// =====================================================
// OPEN
// =====================================================

bool AudioStreamController::open(
    oboe::AudioStreamCallback* callback,
    bool exclusive,
    int32_t requestedSampleRate,
    int32_t deviceId
) {

    close();

    mOpenSLESFallback.store(false, std::memory_order_release);

    // Simpan permintaan supaya isDeviceHonored() bisa membandingkan yang
    // diminta dengan yang didapat.
    mRequestedDeviceId.store(deviceId, std::memory_order_release);
    mActualDeviceId.store(0, std::memory_order_release);

    __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
        "open: diminta laju=%d device=%d exclusive=%s",
        requestedSampleRate, deviceId, exclusive ? "ya" : "tidak");

    // Salinan lokal stream yang baru dibuka (fix M4, 2026-11-10): semua
    // pembacaan di bawah memakai `opened`, bukan `mStream` — thread error
    // Oboe bisa me-reset mStream kapan saja (onErrorAfterClose), dan
    // membaca mStream langsung di sini = race. `opened` menahan objek tetap
    // hidup sampai open() selesai.
    std::shared_ptr<oboe::AudioStream> opened;

    // =============================================
    // PERCOBAAN 1: AAudio
    // =============================================
    //
    // AAudio adalah jalur utama karena punya mode Exclusive - satu-satunya
    // cara mengirim sampel ke DAC tanpa melewati mixer Android, dan syarat
    // untuk bit-perfect. OpenSLES tidak punya mode itu.
    //
    // Jalur exclusive memakai conversion quality None (lihat buildStream):
    // kalau device tidak bisa exclusive di laju file, open GAGAL jujur dan
    // kita jatuh ke percobaan 1b. Jalur shared memakai Medium seperti dulu.
    opened = tryOpenAAudio(
        callback, exclusive, requestedSampleRate, deviceId,
        exclusive ? oboe::SampleRateConversionQuality::None
                  : oboe::SampleRateConversionQuality::Medium
    );
    if (opened) {
        std::lock_guard<std::mutex> lock(mStreamMutex);
        mStream = opened;
    }

    // =============================================
    // PERCOBAAN 1b: shared AAudio (hanya kalau exclusive ditolak)
    // =============================================
    //
    // (logcat #23, 2026-11-16): TANPA ini, device yang tidak bisa exclusive
    // (HP ini: sistem menolak EXCLUSIVE di semua open) langsung jatuh ke
    // OpenSLES — lebih buruk dari shared AAudio (latensi tinggi, tidak ada
    // pemilihan device). Shared AAudio dengan konversi Medium adalah perilaku
    // lama yang benar untuk kasus ini; stream ini JELAS bukan bit-perfect
    // (exclusive=false) dan UI melaporkannya begitu via isExclusive().
    if (!opened && exclusive) {
        __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
            "open: exclusive DITOLAK device - mencoba shared AAudio");
        opened = tryOpenAAudio(
            callback, false, requestedSampleRate, deviceId,
            oboe::SampleRateConversionQuality::Medium
        );
        if (opened) {
            std::lock_guard<std::mutex> lock(mStreamMutex);
            mStream = opened;
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "open: jatuh ke shared AAudio (bukan bit-perfect)");
        }
    }

    // =============================================
    // PERCOBAAN 2: OpenSLES (fallback device lama)
    // =============================================
    if (!opened) {
        oboe::AudioStreamBuilder builder;

        // (C-CLEAN(f)): lihat catatan di percobaan 1 — buildStream() void.
        // OpenSLES selalu shared + konversi Medium (perilaku lama): tidak ada
        // klaim bit-perfect yang perlu dijaga di jalur ini.
        buildStream(builder, callback, false, requestedSampleRate, deviceId,
            oboe::SampleRateConversionQuality::Medium);
        builder.setAudioApi(oboe::AudioApi::OpenSLES);

        std::shared_ptr<oboe::AudioStream> stream;
        const auto result = builder.openStream(stream);

        if (result != oboe::Result::OK || !stream) {
            __android_log_print(ANDROID_LOG_ERROR, "AudioStreamController",
                "open: AAudio DAN OpenSLES gagal (%s)",
                oboe::convertToText(result));
            return false;
        }

        opened = stream;
        {
            std::lock_guard<std::mutex> lock(mStreamMutex);
            mStream = opened;
        }
        mOpenSLESFallback.store(true, std::memory_order_release);

        // Penting: di OpenSLES tidak ada jalur exclusive, jadi sampel SELALU
        // lewat mixer sistem. Dicatat sebagai peringatan supaya tidak
        // dilaporkan sebagai bit-perfect padahal bukan.
        __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
            "open: OpenSLES fallback dipakai (actual=%d, device=%d). "
            "TIDAK ada jalur exclusive - bit-perfect ke DAC tidak tersedia "
            "di jalur ini.",
            opened->getSampleRate(), opened->getDeviceId());
    }

    // =============================================
    // VERIFIKASI PERANGKAT
    // =============================================
    //
    // Kalau user memilih perangkat tapi stream terbuka di perangkat lain,
    // pilihan itu TIDAK berlaku. Lebih baik tercatat sebagai peringatan
    // eksplisit daripada UI mengaku sedang memakai DAC padahal bukan.
    //
    // Ini bisa terjadi karena Oboe/AAudio boleh mengabaikan deviceId (mis.
    // perangkat sudah dicabut, atau tidak bisa dibuka exclusive).
    {
        const int32_t actualDevice = opened ? opened->getDeviceId() : 0;
        mActualDeviceId.store(actualDevice, std::memory_order_release);

        if (deviceId > 0 && actualDevice != deviceId) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "DEVICE MISMATCH: diminta device=%d, dapat=%d - permintaan "
                "tidak dihormati (perangkat dicabut / tidak bisa dibuka?)",
                deviceId, actualDevice);
        }
    }

    // 🔥 DEBUG: log actual stream rate
    //
    // (logcat #23, 2026-11-16): DUA laju dicatat karena keduanya berbeda
    // begitu Oboe menyisipkan FilterAudioStream — `app` = laju yang ditulis
    // app ke stream (getSampleRate(), = laju file kalau tidak ada filter
    // lain), `hardware` = laju yang benar-benar keluar ke DAC/mixer
    // (getHardwareSampleRate(), disalin filter dari child stream-nya).
    // Log lama hanya mencatat `actual=` (= app) sehingga 44100/96000 tampak
    // "dihormati" padahal hardware jalan 48000. RATE MISMATCH dibandingkan
    // dengan HARDWARE — itulah yang menentukan ada tidaknya konversi.
    {
        int32_t appRate = opened ? opened->getSampleRate() : 0;
        int32_t hardwareRate = opened ? opened->getHardwareSampleRate() : 0;
        int32_t actualFrames = opened ? opened->getFramesPerBurst() : 0;
        __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
            "OPEN RESULT: app rate=%d, hardware rate=%d, framesPerBurst=%d, api=%s",
            appRate, hardwareRate, actualFrames,
            opened ? oboe::convertToText(opened->getAudioApi()) : "?");

        // Laju hardware berbeda dari yang diminta = device/DAC tidak
        // mendukung laju itu — ada konversi di suatu tempat (Oboe atau mixer).
        // Bukan error fatal: yang penting decoder TAHU laju sebenarnya supaya
        // resample-nya benar. Sebelumnya dibandingkan dengan laju app (yang
        // selalu sama dengan yang diminta kalau ada filter), sehingga warning
        // ini tidak pernah menyala — bandingkan dengan hardware.
        if (requestedSampleRate > 0 && hardwareRate > 0 &&
            hardwareRate != requestedSampleRate) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "RATE MISMATCH: diminta=%d, hardware=%d (rasio %.3fx) - "
                "device/DAC tidak mendukung laju itu (ada konversi)",
                requestedSampleRate, hardwareRate,
                static_cast<float>(hardwareRate) / static_cast<float>(requestedSampleRate));
        } else if (requestedSampleRate > 0 && hardwareRate <= 0) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "RATE UNKNOWN: hardware rate tidak bisa dibaca (0) - gate "
                "bit-perfect tidak bisa memverifikasi laju");
        }
    }

    // =============================================
    // CACHE STREAM INFO
    // =============================================
    //
    // Hanya yang masih dibaca yang disimpan (M5/dead-code, 2026-11-10):
    // mSampleRate (fallback actualSampleRate), mChannelCount + mFramesPerBurst
    // (getter hidup), mSharingMode (untuk mExclusive di bawah). mFormat/mApi/
    // mPerfMode dihapus — getter-nya mati.
    // (C-SRATE, 2026-11-12): store release — ketiganya atomic; dibaca
    // lintas-thread lewat getter (actualSampleRate fallback saat stream
    // null; channelCount/framesPerBurst dari start()).
    mSampleRate.store(
        opened->getSampleRate(),
        std::memory_order_release
    );

    // (logcat #23): cache laju hardware untuk hardwareSampleRate() — 0 kalau
    // tidak diketahui (fungsi tidak tersedia di device lama). Gate bit-perfect
    // memperlakukan 0 sebagai "tidak bisa diverifikasi", bukan sebagai laju.
    mHardwareSampleRate.store(
        opened->getHardwareSampleRate(),
        std::memory_order_release
    );

    mChannelCount.store(
        opened->getChannelCount(),
        std::memory_order_release
    );

    mFramesPerBurst.store(
        opened->getFramesPerBurst(),
        std::memory_order_release
    );

    mSharingMode =
        opened->getSharingMode();

    mExclusive.store(
        mSharingMode ==
        oboe::SharingMode::Exclusive,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// TRY OPEN AAUDIO (satu percobaan)
// =====================================================

std::shared_ptr<oboe::AudioStream> AudioStreamController::tryOpenAAudio(
    oboe::AudioStreamCallback* callback,
    bool exclusive,
    int32_t requestedSampleRate,
    int32_t deviceId,
    oboe::SampleRateConversionQuality conversionQuality
) {
    oboe::AudioStreamBuilder builder;

    // (C-CLEAN(f)): buildStream() void — hanya menyetel field builder.
    buildStream(builder, callback, exclusive, requestedSampleRate, deviceId,
        conversionQuality);
    builder.setAudioApi(oboe::AudioApi::AAudio);

    std::shared_ptr<oboe::AudioStream> stream;
    const auto result = builder.openStream(stream);

    if (result != oboe::Result::OK || !stream) {
        __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
            "open: AAudio gagal (%s) [exclusive=%s quality=%s]",
            oboe::convertToText(result),
            exclusive ? "ya" : "tidak",
            conversionQuality == oboe::SampleRateConversionQuality::None
                ? "None" : "Medium");
        return nullptr;
    }

    // Log sukses di sini (bukan di open()): tryOpenAAudio yang memegang
    // stream-nya. Mencatat mode yang DIBERIKAN + kedua laju (app vs hardware).
    // (logcat #23): log lama mencetak `exclusive=%s` dari flag YANG DIMINTA
    // dan `actual=` dari laju app, sehingga stream shared+resample tampak
    // exclusive di laju file. Keduanya kini dari stream yang terbuka.
    __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
        "open: AAudio BERHASIL (requested=%d, app=%d, hardware=%d, device=%d, exclusive=%s [diminta %s])",
        requestedSampleRate, stream->getSampleRate(),
        stream->getHardwareSampleRate(), stream->getDeviceId(),
        stream->getSharingMode() == oboe::SharingMode::Exclusive
            ? "ya" : "tidak",
        exclusive ? "ya" : "tidak");

    return stream;
}

// =====================================================
// BUILD STREAM
// =====================================================

// (C-CLEAN(f), 2026-11-12): void — dulu bool yang selalu true (hanya
// menyetel field builder, tanpa jalur gagal); kedua pemanggil mengecek
// `if (!buildStream(...)) return false;` yang tidak pernah tercapai.
void AudioStreamController::buildStream(
    oboe::AudioStreamBuilder& builder,
    oboe::AudioStreamCallback* callback,
    bool exclusive,
    int32_t requestedSampleRate,
    int32_t deviceId,
    oboe::SampleRateConversionQuality conversionQuality
) {

    builder.setDirection(
        oboe::Direction::Output
    );

    builder.setPerformanceMode(
        oboe::PerformanceMode::LowLatency
    );

    builder.setSharingMode(
        exclusive
        ? oboe::SharingMode::Exclusive
        : oboe::SharingMode::Shared
    );

    builder.setFormat(
        oboe::AudioFormat::Float
    );

    builder.setChannelCount(2);

    // Kualitas konversi laju Oboe untuk stream ini (lihat komentar di header).
    // None = Oboe TIDAK mengonversi: stream dibuka di laju yang diminta atau
    // gagal. Dipakai HANYA jalur exclusive — syarat bit-perfect. Medium (dan
    // default Oboe) = Oboe boleh menyisipkan FilterAudioStream; dipakai jalur
    // shared/DSP/Solfeggio/OpenSLES yang memang butuh konversi.
    builder.setSampleRateConversionQuality(conversionQuality);

    // Laju diminta eksplisit, bukan dipatok 48000.
    //
    // Ini syarat bit-perfect: kalau file 96 kHz, stream harus dibuka di 96 kHz
    // supaya sampel tidak dikonversi di mixer Android. Pemanggil yang menentukan
    // laju (dari kapabilitas DAC atau laju file); kalau 0, pakai 48000 sebagai
    // default yang aman.
    builder.setSampleRate(
        requestedSampleRate > 0 ? requestedSampleRate : 48000
    );

    // 🔥 FIX (2026-10-07): pilih PERANGKAT output, bukan hanya lajunya.
    //
    // Tanpa ini pilihan DAC di UI hanya tercatat dan tidak mengubah apa pun -
    // stream tetap dibuka di perangkat default sistem, jadi audio keluar dari
    // speaker walau DAC terpasang dan terpilih.
    //
    // deviceId == 0 (kUnspecified) = tidak ada preferensi; Android memilih.
    // Oboe boleh mengabaikan nilai ini (perangkat hilang / tidak bisa dibuka),
    // jadi open() memverifikasi getDeviceId() setelah stream terbuka.
    //
    // CATATAN: OpenSLES tidak mendukung pemilihan perangkat; di jalur fallback
    // ini nilai diabaikan dan device tetap dipilih sistem.
    if (deviceId > 0) {
        builder.setDeviceId(deviceId);
    }

    builder.setFramesPerCallback(
        oboe::Unspecified
    );

    builder.setDataCallback(
        callback
    );

    builder.setErrorCallback(
        this
    );
}

// =====================================================
// START
// =====================================================

bool AudioStreamController::start() {

    // Salinan lokal (M4): requestStart() dipanggil di luar lock supaya
    // error callback Oboe tidak pernah block menunggu mutex ini.
    auto stream = streamCopy();
    if (!stream) {
        return false;
    }

    const auto result =
        stream->requestStart();

    if (result != oboe::Result::OK) {
        return false;
    }

    mRunning.store(
        true,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// STOP
// =====================================================

void AudioStreamController::stop() {

    // Salinan lokal (M4): requestStop() di luar lock.
    auto stream = streamCopy();
    if (!stream) {
        return;
    }

    stream->requestStop();

    mRunning.store(
        false,
        std::memory_order_release
    );
}

// =====================================================
// CLOSE
// =====================================================

void AudioStreamController::close() {

    mRunning.store(
        false,
        std::memory_order_release
    );

    // C-CACHE (2026-11-12): reset cache identitas stream. actualDeviceId() /
    // actualSampleRate() fallback ke cache ini saat mStream null — tanpa
    // reset, sesudah close() JNI tetap melaporkan perangkat/laju stream yang
    // sudah mati sebagai aktif (isDeviceHonored() bisa true untuk stream
    // mati). 0 = tidak ada stream. mRequestedDeviceId SENGAJA tidak direset:
    // isDeviceHonored() mengembalikan true kalau requested <= 0, jadi
    // meresetnya justru akan mengaku "dihormati" padahal tidak ada stream.
    // mSampleRate memang basi juga (hanya ditulis open(), init 48000) —
    // direset ke 0 bersama; isRateHonored() sudah guard streamRate <= 0.
    mActualDeviceId.store(0, std::memory_order_release);
    // (C-SRATE): store atomic — konsisten dengan reset item 17 (0 = tidak
    // ada stream); dibaca lintas-thread dari actualSampleRate().
    mSampleRate.store(0, std::memory_order_release);
    // (logcat #23): reset cache laju hardware bersama mSampleRate — tanpa
    // ini, hardwareSampleRate() tetap melaporkan laju stream yang sudah mati.
    mHardwareSampleRate.store(0, std::memory_order_release);

    // Tutup lewat salinan lokal (M4), lalu nol-kan mStream di bawah lock.
    // Kalau error callback sudah me-reset mStream, salinan null dan close()
    // jadi no-op (stream sudah ditutup Oboe).
    auto stream = streamCopy();
    if (stream) {
        stream->close();
    }

    {
        std::lock_guard<std::mutex> lock(mStreamMutex);
        mStream.reset();
    }
}

// =====================================================
// RESTART
// (restart() dihapus 2026-11-10: 0 caller. Reopen dikerjakan
// EngineManager::reopenStreamPreservingPlayback() via stop()+start().)

// =====================================================
// IS RUNNING
// =====================================================

bool AudioStreamController::isRunning()
const noexcept {

    return mRunning.load(
        std::memory_order_acquire
    );
}

// =====================================================
// IS EXCLUSIVE
// =====================================================

bool AudioStreamController::isExclusive()
const noexcept {

    return mExclusive.load(
        std::memory_order_acquire
    );
}

// =====================================================
// SAMPLE RATE
// =====================================================

// Laju yang BENAR-BENAR dipakai stream. Sumber kebenaran untuk memberi tahu
// decoder laju mana yang harus dijadikan target resample.
int32_t AudioStreamController::actualSampleRate() const noexcept {
    // Salinan lokal (M4): dibaca dari JS thread via JNI, sementara thread
    // error Oboe bisa me-reset mStream kapan saja.
    auto stream = streamCopy();
    // (C-SRATE): load atomic — fallback ini dibaca dari thread JNI +
    // thread manager sementara open()/close()/onErrorAfterClose() bisa
    // menulisnya dari thread lain.
    return stream ? stream->getSampleRate()
                  : mSampleRate.load(std::memory_order_acquire);
}

bool AudioStreamController::usingOpenSLESFallback() const noexcept {
    return mOpenSLESFallback.load(std::memory_order_acquire);
}

// Laju HARDWARE stream (lihat komentar di header): laju yang benar-benar
// keluar ke DAC/mixer. FilterAudioStream menyalinnya dari child stream-nya,
// jadi nilai ini benar walau ada konversi di tengah — bedakan dari
// actualSampleRate() yang mengembalikan laju sisi app. 0 = tidak diketahui.
int32_t AudioStreamController::hardwareSampleRate() const noexcept {
    // Salinan lokal (M4): dibaca dari JS thread via JNI, sementara thread
    // error Oboe bisa me-reset mStream kapan saja.
    auto stream = streamCopy();
    if (stream) {
        const int32_t hw = stream->getHardwareSampleRate();
        if (hw > 0) {
            return hw;
        }
    }
    // Stream null / hardware rate tidak tersedia — fallback ke cache (0
    // kalau tidak pernah ada stream yang berhasil dibuka).
    return mHardwareSampleRate.load(std::memory_order_acquire);
}

int32_t AudioStreamController::actualDeviceId() const noexcept {
    // Ambil dari stream yang hidup kalau ada - itu sumber paling akurat
    // setelah error callback menutup stream. Cache dipakai sebagai cadangan.
    // Salinan lokal (M4): dibaca dari JS thread via JNI.
    auto stream = streamCopy();
    if (stream) {
        return stream->getDeviceId();
    }
    return mActualDeviceId.load(std::memory_order_acquire);
}

bool AudioStreamController::isDeviceHonored() const noexcept {
    const int32_t requested =
        mRequestedDeviceId.load(std::memory_order_acquire);

    if (requested <= 0) {
        return true;
    }

    return actualDeviceId() == requested;
}

// Jalur yang secara arsitektur tidak bisa bit-perfect: perangkatnya tidak
// punya jalur langsung ke perangkat keras (Bluetooth/A2DP — transcode), atau
// stream jatuh ke OpenSLES.
//
// Kenapa perlu: pada jalur ini AAudio/OpenSLES SELALU menolak exclusive, jadi
// `isExclusive()` false - dan tanpa pembedaan ini UI akan menampilkan
// "exclusive ditolak" seolah-olah ada yang salah, padahal itu memang batas
// jalurnya. Sebaliknya pada jalur yang tidak inherently lossy (USB DAC, atau
// speaker/headset di HP ber-MMAP), exclusive yang ditolak adalah kegagalan
// nyata yang harus dilaporkan.
//
// (F1, 2026-11-16): speaker/headphone built-in TIDAK lagi di sini —
// klasifikasi lama (hanya USB/HDMI yang bisa exclusive) terbalik dengan
// kenyataan: exclusive AAudio hanya mungkin lewat jalur INTERNAL di HP
// ber-MMAP, dan USB justru tidak pernah bisa exclusive via AAudio.
// `deviceLacksExclusive()` kini hanya true untuk BT/TELEPHONY/UNKNOWN
// (lihat AudioDeviceManager.cpp).
bool AudioStreamController::isPathInherentlyLossy() const noexcept {

    // OpenSLES tidak punya mode exclusive sama sekali.
    if (mOpenSLESFallback.load(std::memory_order_acquire)) {
        return true;
    }

    const int32_t apiDevice = actualDeviceId();

    // 0 = Android memilih (tidak ada preferensi maupun info). Tidak bisa
    // disimpulkan - biarkan ditentukan oleh isExclusive().
    if (apiDevice <= 0) {
        return false;
    }

    // (C-CLEAN(g), 2026-11-12): lookup satu perangkat di bawah lock
    // (deviceLacksExclusive), bukan getAvailableDevices() yang menyalin
    // SELURUH vector (+ string tiap deskriptor) per panggilan. Id
    // numerik perangkat hanya berarti di daftar yang dimuat
    // AudioDeviceManager; kalau perangkat tidak ada di daftar (sudah
    // dicabut / belum dikenal / daftar kosong), jangan mengarang
    // jawaban — deviceLacksExclusive mengembalikan false untuk itu.
    return AudioDeviceManager::get().deviceLacksExclusive(apiDevice);
}

int32_t AudioStreamController::channelCount()
const noexcept {

    // (C-SRATE): load atomic — hari ini hanya dibaca dari start() (thread
    // yang sama sesudah open()), tapi membernya atomic supaya aman kalau
    // nanti dibaca lintas-thread.
    return mChannelCount.load(std::memory_order_acquire);
}

// =====================================================
// FRAMES PER BURST
// =====================================================

int32_t AudioStreamController::framesPerBurst()
const noexcept {

    // (C-SRATE): load atomic — alasan sama seperti channelCount().
    return mFramesPerBurst.load(std::memory_order_acquire);
}

// =====================================================
// BUFFER SIZE IN FRAMES
// =====================================================

int32_t AudioStreamController::bufferSizeInFrames()
const noexcept {

    // Salinan lokal (M4): dibaca dari start() (thread manager), sementara
    // thread error Oboe bisa me-reset mStream kapan saja.
    // getBufferSizeInFrames() Oboe = ukuran buffer AKTUAL yang dipakai
    // stream (bukan kapasitas). Hanya dilaporkan — pemanggil tidak pernah
    // memanggil setBufferSizeInFrames(), jadi ukuran ini apa adanya dari
    // Oboe/AAudio (C-XRUN, 2026-11-12).
    auto stream = streamCopy();
    return stream ? stream->getBufferSizeInFrames() : 0;
}

// =====================================================
// ERROR CALLBACK
// =====================================================

void AudioStreamController::
onErrorAfterClose(
    oboe::AudioStream*,
    oboe::Result error
) {

    // Kasus nyata yang memicu ini: headset dicolok. Android memindahkan rute
    // dan mengirim `request DISCONNECT in data callback`; stream yang berjalan
    // ditutup paksa. Log perangkat untuk kasus ini:
    //
    //   onAudioDeviceUpdate() devices 3 => 3033
    //   onAudioDeviceUpdate() request DISCONNECT in data callback
    //   checkForDisconnectRequest() mRequestDisconnect acknowledged
    //   AAudioStream_requestStop(s#1) called   (state 4 -> 9)
    //
    // Oboe memanggil callback ini SETELAH stream ditutup. Pada titik ini
    // stream tidak bisa dipakai lagi.
    __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
        "STREAM TERPUTUS oleh sistem (%s) - stream dibuang, minta pemilik "
        "membuka ulang",
        oboe::convertToText(error));

    mRunning.store(
        false,
        std::memory_order_release
    );

    // C-CACHE (2026-11-12): reset cache identitas stream — jalur kematian
    // stream yang sama seperti close(): tanpa ini, sesudah stream diputus
    // paksa sistem, actualDeviceId()/actualSampleRate() tetap melaporkan
    // perangkat/laju stream mati sampai reopen berikutnya.
    mActualDeviceId.store(0, std::memory_order_release);
    // (C-SRATE): store atomic — reset item 17 dari thread error Oboe,
    // dibaca lintas-thread dari actualSampleRate().
    mSampleRate.store(0, std::memory_order_release);
    // (logcat #23): reset cache laju hardware — jalur kematian stream yang
    // sama seperti close().
    mHardwareSampleRate.store(0, std::memory_order_release);

    // Reset di bawah lock (M4): getter dari JS thread (actualSampleRate/
    // actualDeviceId) membaca mStream lewat salinan yang sama.
    {
        std::lock_guard<std::mutex> lock(mStreamMutex);
        mStream.reset();
    }

    // Beri tahu pemilik (AudioEngine -> EngineManager). DI SINI kunci
    // perbaikannya: sebelum ini callback hanya reset + diam, sehingga audio
    // mati permanen setelah headset dicolok - tidak ada yang membuka stream
    // kembali maupun memuat ulang track ke stream baru.
    //
    // Salin handler dulu: pemilik boleh menggantinya dari thread lain saat
    // restart, dan kita tidak mau memanggil std::function yang sedang diubah.
    std::function<void()> handler = mDisconnectHandler;

    if (handler) {
        handler();
    }
}

} // namespace pristine