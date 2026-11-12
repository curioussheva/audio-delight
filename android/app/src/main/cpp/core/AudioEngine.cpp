// =====================================================
// core/AudioEngine.cpp
// =====================================================

#include "AudioEngine.h"
#include <algorithm>
#include <android/log.h>
#include "../playback/PlaybackController.h"
#include "../devices/AudioDeviceManager.h"
#include "../dsp/PresetParser.h"
#include "DSPProcessingGate.h"

namespace pristine {

// (C-DSPMETRIC, 2026-11-12): "DSP aktif" yang sebenarnya — BUKAN flag
// isDSPEnabled() mentah. Flag itu tidak pernah menggerakkan jalur produksi:
// AudioPipeline.cpp:437 `enabled` sengaja SELALU true, bukan
// params.dspEnabled, dan setDSPEnabled tidak punya pemanggil TS (hanya
// deklarasi spec + JNI). Yang benar-benar memproses PCM di jalur produksi
// adalah DUA syarat sekaligus: gate produksi menyala (AudioCallback.cpp:173
// memagari applyPipeline) DAN mode bukan BitPerfect (AudioPipeline::process
// memetakan BitPerfect ke processBitPerfect() yang no-op). Jadi metrik
// dspEnabled harus melaporkan kondisi gabungan ini, bukan flag mentah —
// kalau tidak, getStats() mengklaim DSP aktif padahal tidak ada satu sample
// pun yang diproses (mis. mode BitPerfect, atau gate dimatikan di Settings).
static bool computeDSPActive(
    const AudioState& state
) noexcept {

    return state.processingMode() != ProcessingMode::BitPerfect &&
        DSPProcessingGate::enabled();
}

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioEngine::AudioEngine()
    :

    mCallback(
        mPipeline,
        mMetrics,
        mState
    ) {
}

// =====================================================
// DESTRUCTOR
// =====================================================

AudioEngine::~AudioEngine() {

    stop();
}

// =====================================================
// START
// =====================================================

// Hanya meneruskan ke controller (C-K2, 2026-11-12): tidak ada lagi member
// perantara. EngineManager memasang handler SEKALI di konstruktornya —
// sebelum stream pertama dibuka — jadi penulisan ini terjadi sebelum
// callback error Oboe mana pun bisa membacanya, dan tidak ada penulisan
// ulang tiap start() yang bisa balapan dengan onErrorAfterClose().
void AudioEngine::setStreamDisconnectHandler(
    std::function<void()> handler
) {
    mStreamController.setDisconnectHandler(std::move(handler));
}

bool AudioEngine::start(
    bool exclusiveMode,
    int32_t requestedSampleRate,
    int32_t requestedDeviceId
) {

    // (C-K3, 2026-11-12): guard memakai isRunning() gabungan — flag saja
    // tidak cukup. Sesudah stream diputus sistem, onErrorAfterClose()
    // mematikan mRunning controller tapi mState.running tetap true; guard
    // lama (flag saja) mengembalikan true tanpa stream yang hidup, dan
    // EngineManager::start() ikut early-return — audio mati sampai device
    // berubah lagi.
    if (
        isRunning()
    ) {
        return true;
    }

    // Flag masih true tapi stream sudah mati (kasus disconnect di atas):
    // bersihkan sisa state sebelum membuka stream baru. stop() idempotent
    // (stop()/close() controller no-op saat stream null, reset() hanya
    // clear) — dan reopen pun memanggil stop() dulu sebelum start().
    // Muat ulang track BUKAN di sini: itu tugas EngineManager::start()
    // (reloadIfDecoderRateMismatch sesudah start) / reopen.
    if (
        mState.isRunning()
    ) {
        stop();
    }

    // Laju 0 = pemanggil tidak menentukan: deteksi sendiri dari perangkat
    // yang DIPILIH (atau aktif), bukan gabungan semua perangkat output.
    // (C-R1, 2026-11-12: dulu DeviceRateDetector::refresh() menggabung laju
    // SEMUA device — DAC 384 kHz ikut menghitung walau audio keluar di
    // speaker — lalu rates.back() memilih 384000. Kini AudioDeviceManager
    // satu-satunya sumber data perangkat.)
    // Ini yang membuat laju tidak lagi hardcoded 48000.
    if (requestedSampleRate <= 0) {
        AudioDeviceManager::get().refreshDevices();
        const int32_t targetDevice = requestedDeviceId > 0
            ? requestedDeviceId
            : AudioDeviceManager::get().activeDeviceIdNumeric();
        const auto rates = targetDevice > 0
            ? AudioDeviceManager::get().supportedRatesForDevice(targetDevice)
            : std::vector<int32_t>{};
        if (!rates.empty()) {
            // Pakai laju tertinggi yang didukung perangkat yang DIPILIH
            // sebagai default saat tidak ada file spesifik yang diminta -
            // memberi ruang terbanyak untuk laju file asli tanpa konversi.
            requestedSampleRate =
                *std::max_element(rates.begin(), rates.end());
            __android_log_print(ANDROID_LOG_INFO, "AudioEngine",
                "start: laju dideteksi sendiri = %d (perangkat %d, %zu laju didukung)",
                requestedSampleRate, targetDevice, rates.size());
        } else {
            requestedSampleRate = 48000;
            __android_log_print(ANDROID_LOG_WARN, "AudioEngine",
                "start: laju perangkat %d tidak diketahui (atau sembarang), pakai default %d",
                targetDevice, requestedSampleRate);
        }
    }

    if (
        !mStreamController.open(
            &mCallback,
            exclusiveMode,
            requestedSampleRate,
            requestedDeviceId
        )
    ) {
        return false;
    }

    // Pakai laju AKTUAL dari stream, bukan yang diminta - kalau device/DAC
    // tidak mendukung laju yang diminta, decoder harus tahu laju sebenarnya
    // supaya resample-nya benar dan tidak ada konversi tambahan.
    const int32_t actualRate = mStreamController.actualSampleRate();

    // (C-P3, 2026-11-12): prepare() menerima kMaxFramesPerCallback, BUKAN
    // framesPerBurst. framesPerBurst bisa melebihi kMax (mis. stream
    // 192 kHz burst 20 ms = 3840 frame), sementara yang benar-benar
    // diterima process() TIDAK PERNAH lebih dari kMax: AudioCallback
    // memotong buffer besar jadi chunk ≤ kMax (C-C2) dan mLeft/mRight
    // hanya sebesar itu. Semua node in-place dan tidak ada satu pun yang
    // mengalokasi buffer sebesar maxFrames (Gain/Limiter/Widener:
    // prepare() kosong; EQ/Headphone: hanya laju yang diteruskan, buffer
    // tetap array biquad statis) — jadi nilai yang lebih kecil ini tidak
    // membuat satu node pun kekurangan buffer. Kontrak kini jujur:
    // maxFrames = batas atas nyata per pemanggilan process().
    mPipeline.prepare(
        actualRate,
        kMaxFramesPerCallback
    );

    mCallback.setSampleRate(
        actualRate
    );

    __android_log_print(ANDROID_LOG_INFO, "AudioEngine",
        "start: diminta rate=%d device=%d, dipakai rate=%d device=%d, "
        "exclusive=%s, api=%s%s",
        requestedSampleRate, requestedDeviceId,
        actualRate, mStreamController.actualDeviceId(),
        exclusiveMode ? "ya" : "tidak",
        mStreamController.usingOpenSLESFallback() ? "OpenSLES" : "AAudio",
        mStreamController.usingOpenSLESFallback()
            ? " (TANPA jalur exclusive - bit-perfect ke DAC tidak tersedia)"
            : "");

    if (
        !mStreamController.start()
    ) {

        mStreamController.close();

        return false;
    }

    mState.setExclusiveMode(exclusiveMode);
    mState.setRunning(true);

    // Metrik diisi dari kondisi stream NYATA (M5, 2026-11-10): dulu
    // getStats() selalu mengembalikan default (laju 48000, exclusive false,
    // dsp true) karena tidak ada yang menulis field-field ini.
    mMetrics.updateSampleRate(
        static_cast<uint32_t>(actualRate)
    );
    mMetrics.updateChannelCount(
        static_cast<uint32_t>(mStreamController.channelCount())
    );
    // (C-XRUN, 2026-11-12): properti stream yang tetap sesudah open —
    // diisi sekali di sini, seperti laju/channel. xruns TIDAK diisi di
    // sini (nilainya berubah selama playback — di-update live dari
    // AudioCallback::updateCallbackMetrics).
    mMetrics.updateBufferSizeFrames(
        mStreamController.bufferSizeInFrames()
    );
    mMetrics.updateFramesPerBurst(
        mStreamController.framesPerBurst()
    );
    mMetrics.setExclusiveMode(exclusiveMode);
    // (C-DSPMETRIC, 2026-11-12): laporkan kondisi AKTIF gabungan (mode !=
    // BitPerfect && gate menyala), bukan flag isDSPEnabled() mentah — flag
    // itu default false dan tidak pernah dibaca jalur produksi, jadi nilai
    // mentahnya menyesatkan (lihat computeDSPActive di atas).
    mMetrics.setDSPEnabled(computeDSPActive(mState));

    return true;
}

// =====================================================
// STOP
// =====================================================

int32_t AudioEngine::actualSampleRate() const {
    return mStreamController.actualSampleRate();
}

int32_t AudioEngine::actualDeviceId() const {
    return mStreamController.actualDeviceId();
}

bool AudioEngine::isDeviceHonored() const {
    // Tidak ada preferensi = tidak ada yang perlu dihormati.
    const int32_t requested = mStreamController.requestedDeviceId();
    if (requested <= 0) {
        return true;
    }
    return mStreamController.actualDeviceId() == requested;
}

bool AudioEngine::isExclusive() const {
    return mStreamController.isExclusive();
}

bool AudioEngine::usingOpenSLESFallback() const {
    return mStreamController.usingOpenSLESFallback();
}

bool AudioEngine::isPathInherentlyLossy() const {
    return mStreamController.isPathInherentlyLossy();
}

void AudioEngine::stop() {

    mState.setRunning(false);

    mStreamController.stop();

    mStreamController.close();

    reset();
}

// =====================================================
// IS RUNNING
// =====================================================

bool AudioEngine::isRunning() const {

    // (C-K3, 2026-11-12): flag saja berbohong sesudah disconnect. Stream
    // diputus sistem (headset dicolok): onErrorAfterClose() mematikan
    // mRunning controller + membuang stream, tapi mState.running tetap
    // true sampai ada yang memanggil stop(). isRunning() harus berarti
    // "audio BENAR-BENAR mengalir": flag DAN stream hidup. Dua atomic
    // load (acquire) — tanpa lock, aman dari audio thread.
    //
    // Semua pemanggil diperiksa terhadap semantik baru (tidak ada yang
    // butuh semantik lama "flag saja"):
    //   - EngineManager::start() guard: kini TIDAK early-return sesudah
    //     disconnect — start lanjut membuka stream baru (ini inti fix).
    //   - EngineManager::start() reload guard (:270): hanya reload kalau
    //     stream baru benar-benar hidup.
    //   - reopen wasRunning (:627): kini mencerminkan stream nyata; hanya
    //     dipakai log.
    //   - reopen reload guard (:645): hanya muat ulang kalau stream baru
    //     benar-benar hidup.
    //   - onTrackLoaded (:684), onDeviceRemoved (:741),
    //     setRequestedDeviceId (:388), setExclusiveMode (:957): sesudah
    //     disconnect mereka kini "tidak berjalan" — benar, karena recovery
    //     worker (requestStreamRecovery) yang menangani reopen + muat
    //     ulang track, bukan mereka.
    //   - NativePlaybackModule getControllerAndStartEngine(): play()
    //     sesudah disconnect kini benar-benar memanggil start() lagi.
    return mState.isRunning() && mStreamController.isRunning();
}

// =====================================================
// SET PLAYBACK CONTROLLER
// =====================================================

void AudioEngine::setPlaybackController(
    playback::PlaybackController* controller
) {

    mCallback.setPlaybackController(controller);
}

// (pushData dihapus 2026-11-12, C-FALLBACK: 0 pemanggil di seluruh
// cpp/jni/Kotlin; jalur fallback AudioBufferController/RingBuffer dihapus.)

// =====================================================
// PROCESSING MODE
// =====================================================

void AudioEngine::setProcessingMode(
    ProcessingMode mode
) {

    mState.setProcessingMode(mode);
}

// =====================================================
// GET MODE
// =====================================================

ProcessingMode
AudioEngine::getProcessingMode() const {

    return mState.processingMode();
}

// =====================================================
// DSP ENABLE
// =====================================================

void AudioEngine::setDSPEnabled(
    bool enabled
) {

    mState.setDSPEnabled(enabled);
    // Metrik mengikuti kondisi AKTIF gabungan (C-DSPMETRIC), bukan flag
    // mentah ini: flag tetap disimpan di state (disalin updateParameters()
    // ke mParams.dspEnabled, tapi tidak ada yang menggerakkannya di jalur
    // produksi) — yang menentukan apakah PCM benar-benar diproses adalah
    // mode + gate, lihat computeDSPActive di atas.
    mMetrics.setDSPEnabled(computeDSPActive(mState));
}

// =====================================================
// LIMITER ENABLE
// =====================================================

void AudioEngine::setLimiterEnabled(
    bool enabled
) {

    mState.setLimiterEnabled(enabled);
}

// =====================================================
// IMMERSIVE ENABLE
// =====================================================

void AudioEngine::setImmersiveEnabled(
    bool enabled
) {

    mState.setImmersiveEnabled(enabled);
}

// =====================================================
// VISUALIZER
// =====================================================

void AudioEngine::getVisualizerData(
    float* dst,
    int32_t size
) const {

    mCallback.visualizerBuffer().read(
        dst,
        size
    );
}

// =====================================================
// MASTER GAIN
// =====================================================

void AudioEngine::setMasterGain(
    float gain
) {

    mState.setMasterGain(gain);
}

// =====================================================
// BALANCE
// =====================================================

void AudioEngine::setBalance(
    float balance
) {

    mState.setBalance(balance);
}

// =====================================================
// STEREO WIDTH
// =====================================================

void AudioEngine::setStereoWidth(
    float width
) {

    mState.setStereoWidth(width);
}

// =====================================================
// BASS BOOST
// =====================================================

void AudioEngine::setBassBoost(
    float gainDb
) {

    // 🔥 FIX (2026-10-10): dulu bodi kosong. Slider bass di UI memanggil
    // `setFullEqualizer`/`setBassBoost` -> JNI -> EngineManager -> sini, lalu
    // berhenti: nilainya tidak pernah disimpan, jadi `EQProcessor` tidak
    // pernah menerima gain apa pun. Sekarang disimpan di AudioState dan
    // dibaca `AudioCallback::updateParameters()` tiap buffer.
    mState.setBassBoost(gainDb);
}

// =====================================================
// EQ BAND
// =====================================================

void AudioEngine::setEqBand(
    int band,
    float gainDb
) {

    // 🔥 FIX (2026-10-10): sama seperti setBassBoost — dulu bodi kosong,
    // sehingga EQ 10-band di UI tidak berefek. `setEqGain` sudah ada di
    // AudioState sejak awal tapi nol pemanggil.
    mState.setEqGain(band, gainDb);
}

// =====================================================
// EQ BANDS (MASSAL)
// =====================================================

void AudioEngine::setEqBands(
    const float* gains,
    int count
) {

    // (C-EQATOM, 2026-11-12): satu transaksi seqlock di AudioState, bukan
    // 10x setEqBand — updateParameters() tidak pernah membaca preset
    // setengah-jadi.
    mState.setEqGains(gains, count);
}

// =====================================================
// KOREKSI HEADPHONE (Fase D)
// =====================================================

bool AudioEngine::loadHeadphonePreset(
    const std::string& presetText,
    const std::string& name
) {

    // Parsing di thread PEMANGGIL (UI thread). Ini yang menjaga audio thread
    // bebas dari alokasi dan dari powf/cosf/sinf untuk 16 biquad.
    const ParseResult parsed =
        parseParametricPreset(presetText, name);

    if (!parsed.ok) {
        // Preset cacat: JANGAN pasang apa pun. Mengembalikan false, bukan
        // memasang sebagian. Lihat docs/BOILERPLATE_AND_STUBS.md §2.
        return false;
    }

    HeadphonePresetData data;

    // Konversi di PresetParser (dipakai bersama test), bukan disalin di sini.
    if (!toPresetData(parsed.preset, data)) {
        return false;
    }

    mState.setHeadphonePreset(data);

    return true;
}

int AudioEngine::validateHeadphonePreset(
    const std::string& presetText
) const {

    // Murni baca: parse lalu hitung. Tidak menyentuh AudioState sama sekali.
    const ParseResult parsed =
        parseParametricPreset(presetText);

    if (!parsed.ok) {
        return -1;
    }

    HeadphonePresetData data;

    if (!toPresetData(parsed.preset, data)) {
        return -1;
    }

    return static_cast<int>(data.filterCount);
}

void AudioEngine::clearHeadphonePreset() {

    mState.setHeadphonePreset(
        HeadphonePresetData{}
    );
}

void AudioEngine::setHeadphoneCorrectionEnabled(
    bool enabled
) {

    mState.setHeadphoneCorrectionEnabled(enabled);
}

bool AudioEngine::isHeadphoneCorrectionEnabled() const {

    return mState.isHeadphoneCorrectionEnabled();
}

// =====================================================
// SOLFEGGIO
// =====================================================

void AudioEngine::setSolfeggioFreq(
    float freq
) {

    mState.setSolfeggioFreq(freq);
}

// =====================================================
// BRAINWAVE
// =====================================================

void AudioEngine::setBrainwaveFreq(
    float freq
) {

    mState.setBrainwaveFreq(freq);
}

// =====================================================
// RESONANCE
// =====================================================

void AudioEngine::setResonanceIntensity(
    float intensity
) {

    mState.setResonanceIntensity(intensity);
}

// =====================================================
// STATS
// =====================================================

EngineStats
AudioEngine::getStats() const {

    return mMetrics.getStats();
}

// =====================================================
// RESET
// =====================================================

void AudioEngine::reset() {

    mPipeline.reset();

    mMetrics.reset();
}

} // namespace pristine 