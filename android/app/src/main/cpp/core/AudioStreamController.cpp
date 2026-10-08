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

    // Simpan permintaan supaya restart() (device/laju berubah) membuka ulang
    // dengan nilai yang sama, bukan kembali ke default.
    mRequestedSampleRate.store(requestedSampleRate, std::memory_order_release);
    mRequestedDeviceId.store(deviceId, std::memory_order_release);
    mActualDeviceId.store(0, std::memory_order_release);

    __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
        "open: diminta laju=%d device=%d exclusive=%s",
        requestedSampleRate, deviceId, exclusive ? "ya" : "tidak");

    // =============================================
    // PERCOBAAN 1: AAudio
    // =============================================
    //
    // AAudio adalah jalur utama karena punya mode Exclusive - satu-satunya
    // cara mengirim sampel ke DAC tanpa melewati mixer Android, dan syarat
    // untuk bit-perfect. OpenSLES tidak punya mode itu.
    //
    // AAudio tersedia sejak Android 8.0 (API 26). Kalau perangkat lebih lama,
    // atau AAudio gagal membuka stream (mis. driver bermasalah), kita jatuh
    // ke OpenSLES di bawah - hanya sebagai fallback.
    {
        oboe::AudioStreamBuilder builder;

        if (!buildStream(builder, callback, exclusive, requestedSampleRate, deviceId)) {
            return false;
        }
        builder.setAudioApi(oboe::AudioApi::AAudio);

        std::shared_ptr<oboe::AudioStream> stream;
        const auto result = builder.openStream(stream);

        if (result == oboe::Result::OK && stream) {
            mStream = std::move(stream);
            __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
                "open: AAudio BERHASIL (requested=%d, actual=%d, device=%d, exclusive=%s)",
                requestedSampleRate, mStream->getSampleRate(),
                mStream->getDeviceId(),
                exclusive ? "ya" : "tidak");
        } else {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "open: AAudio gagal (%s) - mencoba OpenSLES fallback",
                oboe::convertToText(result));
        }
    }

    // =============================================
    // PERCOBAAN 2: OpenSLES (fallback device lama)
    // =============================================
    if (!mStream) {
        oboe::AudioStreamBuilder builder;

        if (!buildStream(builder, callback, exclusive, requestedSampleRate, deviceId)) {
            return false;
        }
        builder.setAudioApi(oboe::AudioApi::OpenSLES);

        std::shared_ptr<oboe::AudioStream> stream;
        const auto result = builder.openStream(stream);

        if (result != oboe::Result::OK || !stream) {
            __android_log_print(ANDROID_LOG_ERROR, "AudioStreamController",
                "open: AAudio DAN OpenSLES gagal (%s)",
                oboe::convertToText(result));
            return false;
        }

        mStream = std::move(stream);
        mOpenSLESFallback.store(true, std::memory_order_release);

        // Penting: di OpenSLES tidak ada jalur exclusive, jadi sampel SELALU
        // lewat mixer sistem. Dicatat sebagai peringatan supaya tidak
        // dilaporkan sebagai bit-perfect padahal bukan.
        __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
            "open: OpenSLES fallback dipakai (actual=%d, device=%d). "
            "TIDAK ada jalur exclusive - bit-perfect ke DAC tidak tersedia "
            "di jalur ini.",
            mStream->getSampleRate(), mStream->getDeviceId());
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
        const int32_t actualDevice = mStream ? mStream->getDeviceId() : 0;
        mActualDeviceId.store(actualDevice, std::memory_order_release);

        if (deviceId > 0 && actualDevice != deviceId) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "DEVICE MISMATCH: diminta device=%d, dapat=%d - permintaan "
                "tidak dihormati (perangkat dicabut / tidak bisa dibuka?)",
                deviceId, actualDevice);
        }
    }

    // ð¥ DEBUG: log actual stream rate
    {
        int32_t actualRate = mStream ? mStream->getSampleRate() : 0;
        int32_t actualFrames = mStream ? mStream->getFramesPerBurst() : 0;
        __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
            "OPEN RESULT: ACTUAL rate=%d, framesPerBurst=%d, api=%s",
            actualRate, actualFrames,
            mStream ? oboe::convertToText(mStream->getAudioApi()) : "?");

        // Laju berbeda dari yang diminta = device/DAC tidak mendukung laju itu.
        // Bukan error fatal: yang penting decoder TAHU laju sebenarnya supaya
        // resample-nya benar. Sebelumnya dibandingkan dengan konstanta 48000,
        // yang salah begitu laju bisa diminta dinamis.
        if (requestedSampleRate > 0 && actualRate != requestedSampleRate) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "RATE MISMATCH: diminta=%d, dapat=%d (rasio %.3fx) - "
                "device/DAC tidak mendukung laju itu",
                requestedSampleRate, actualRate,
                static_cast<float>(actualRate) / static_cast<float>(requestedSampleRate));
        }
    }

    // =============================================
    // CACHE STREAM INFO
    // =============================================

    mSampleRate =
        mStream->getSampleRate();

    mChannelCount =
        mStream->getChannelCount();

    mFramesPerBurst =
        mStream->getFramesPerBurst();

    mFormat =
        mStream->getFormat();

    mApi =
        mStream->getAudioApi();

    mPerfMode =
        mStream->getPerformanceMode();

    mSharingMode =
        mStream->getSharingMode();

    mExclusive.store(
        mSharingMode ==
        oboe::SharingMode::Exclusive,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// BUILD STREAM
// =====================================================

bool AudioStreamController::buildStream(
    oboe::AudioStreamBuilder& builder,
    oboe::AudioStreamCallback* callback,
    bool exclusive,
    int32_t requestedSampleRate,
    int32_t deviceId
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

    return true;
}

// =====================================================
// START
// =====================================================

bool AudioStreamController::start() {

    if (!mStream) {
        return false;
    }

    const auto result =
        mStream->requestStart();

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

    if (!mStream) {
        return;
    }

    mStream->requestStop();

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

    if (mStream) {

        mStream->close();

        mStream.reset();
    }
}

// =====================================================
// RESTART
// =====================================================

bool AudioStreamController::restart(
    oboe::AudioStreamCallback* callback
) {

    const bool exclusive =
        isExclusive();

    // Laju dan perangkat yang diminta DULU, bukan default: restart biasanya
    // dipicu oleh perubahan salah satunya, dan membuka ulang tanpa nilainya
    // akan membatalkan pilihan yang sedang berlaku (stream kembali ke 48000
    // dan perangkat sistem). `close()` tidak menghapus nilai tersimpan ini.
    const int32_t rate =
        mRequestedSampleRate.load(std::memory_order_acquire);

    const int32_t device =
        mRequestedDeviceId.load(std::memory_order_acquire);

    close();

    if (
        !open(
            callback,
            exclusive,
            rate,
            device
        )
    ) {
        return false;
    }

    return start();
}

// =====================================================
// IS OPEN
// =====================================================

bool AudioStreamController::isOpen()
const noexcept {

    return mStream != nullptr;
}

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
    return mStream ? mStream->getSampleRate() : mSampleRate;
}

bool AudioStreamController::usingOpenSLESFallback() const noexcept {
    return mOpenSLESFallback.load(std::memory_order_acquire);
}

int32_t AudioStreamController::actualDeviceId() const noexcept {
    // Ambil dari stream yang hidup kalau ada - itu sumber paling akurat
    // setelah error callback menutup stream. Cache dipakai sebagai cadangan.
    if (mStream) {
        return mStream->getDeviceId();
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
// punya jalur langsung ke perangkat keras, atau stream jatuh ke OpenSLES.
//
// Kenapa perlu: pada jalur ini AAudio/OpenSLES SELALU menolak exclusive, jadi
// `isExclusive()` false - dan tanpa pembedaan ini UI akan menampilkan
// "exclusive ditolak" seolah-olah ada yang salah, padahal itu memang batas
// jalurnya. Sebaliknya pada USB DAC + AAudio, exclusive yang ditolak adalah
// kegagalan nyata yang harus dilaporkan.
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

    // Id numerik perangkat hanya berarti di daftar yang dimuat
    // AudioDeviceManager. Kalau daftarnya kosong (belum di-refresh), jangan
    // mengarang jawaban.
    const auto devices =
        AudioDeviceManager::get().getAvailableDevices();

    if (devices.empty()) {
        return false;
    }

    const std::string wanted = std::to_string(apiDevice);

    for (const auto& d : devices) {
        if (d.id == wanted) {
            return !d.supportsExclusive;
        }
    }

    // Perangkat tidak ada di daftar (sudah dicabut / belum dikenal): jangan
    // menyimpulkan apa pun.
    return false;
}

int32_t AudioStreamController::sampleRate() const noexcept {

    return mSampleRate;
}

// =====================================================
// CHANNEL COUNT
// =====================================================

int32_t AudioStreamController::channelCount()
const noexcept {

    return mChannelCount;
}

// =====================================================
// FRAMES PER BURST
// =====================================================

int32_t AudioStreamController::framesPerBurst()
const noexcept {

    return mFramesPerBurst;
}

// =====================================================
// FORMAT
// =====================================================

oboe::AudioFormat
AudioStreamController::format()
const noexcept {

    return mFormat;
}

// =====================================================
// API
// =====================================================

oboe::AudioApi
AudioStreamController::api()
const noexcept {

    return mApi;
}

// =====================================================
// PERFORMANCE MODE
// =====================================================

oboe::PerformanceMode
AudioStreamController::performanceMode()
const noexcept {

    return mPerfMode;
}

// =====================================================
// SHARING MODE
// =====================================================

oboe::SharingMode
AudioStreamController::sharingMode()
const noexcept {

    return mSharingMode;
}

// =====================================================
// STREAM
// =====================================================

oboe::AudioStream*
AudioStreamController::stream()
noexcept {

    return mStream.get();
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

    mStream.reset();

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