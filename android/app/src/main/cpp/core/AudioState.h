// =====================================================
// core/AudioState.h
// =====================================================

#pragma once

#include <array>
#include <atomic>
#include <mutex>

#include "AudioTypes.h"

namespace pristine {

// =====================================================
// HASIL BACA PRESET HEADPHONE (C-P1, 2026-11-12)
// =====================================================
//
// headphonePreset() dulu mengembalikan bool: false untuk "tidak ada preset"
// MAUPUN "penulisan sedang berlangsung" — dua keadaan yang menuntut respons
// berlawanan dari pemanggil (yang satu harus membersihkan preset lama, yang
// satu harus mempertahankan preset buffer sebelumnya). Pemanggil
// (AudioCallback::updateParameters) malah mengabaikan return itu sama
// sekali, jadi keduanya diperlakukan sama. Enum ini memisahkan ketiganya.
//
//   Ok   = snapshot konsisten dan ada preset (filterCount > 0).
//   None = snapshot konsisten dan tidak ada preset (filterCount == 0).
//   Busy = penulisan sedang berlangsung, tidak selesai dalam batas
//          percobaan — `out` TIDAK disentuh sama sekali.

enum class PresetRead {
    Ok,
    None,
    Busy
};

// =====================================================
// REALTIME ENGINE STATE
// =====================================================

class AudioState {
public:

    // =============================================
    // RUNNING
    // =============================================

    inline void setRunning(
        bool value
    ) {

        mRunning.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isRunning() const {

        return mRunning.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // DSP ENABLE
    // =============================================

    inline void setDSPEnabled(
        bool value
    ) {

        mDSPEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isDSPEnabled() const {

        return mDSPEnabled.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // LIMITER ENABLE
    // =============================================

    inline void setLimiterEnabled(
        bool value
    ) {

        mLimiterEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isLimiterEnabled() const {

        return mLimiterEnabled.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // IMMERSIVE ENABLE
    // =============================================

    inline void setImmersiveEnabled(
        bool value
    ) {

        mImmersiveEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isImmersiveEnabled() const {

        return mImmersiveEnabled.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // EXCLUSIVE MODE
    // =============================================

    inline void setExclusiveMode(
        bool value
    ) {

        mExclusiveMode.store(
            value,
            std::memory_order_release
        );
    }

    inline bool exclusiveMode() const {

        return mExclusiveMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // PROCESSING MODE
    // =============================================

    inline void setProcessingMode(
        ProcessingMode mode
    ) {

        mProcessingMode.store(
            mode,
            std::memory_order_release
        );
    }

    inline ProcessingMode
    processingMode() const {

        return mProcessingMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // MASTER GAIN
    // =============================================

    inline void setMasterGain(
        float value
    ) {

        mMasterGain.store(
            value,
            std::memory_order_release
        );
    }

    inline float masterGain() const {

        return mMasterGain.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // BALANCE
    // =============================================

    inline void setBalance(
        float value
    ) {

        mBalance.store(
            value,
            std::memory_order_release
        );
    }

    inline float balance() const {

        return mBalance.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // STEREO WIDTH
    // =============================================

    inline void setStereoWidth(
        float value
    ) {

        mStereoWidth.store(
            value,
            std::memory_order_release
        );
    }

    inline float stereoWidth() const {

        return mStereoWidth.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // SOLFEGGIO
    // =============================================

    inline void setSolfeggioFreq(
        float value
    ) {

        mSolfeggioFreq.store(
            value,
            std::memory_order_release
        );
    }

    inline float solfeggioFreq() const {

        return mSolfeggioFreq.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // BRAINWAVE
    // =============================================

    inline void setBrainwaveFreq(
        float value
    ) {

        mBrainwaveFreq.store(
            value,
            std::memory_order_release
        );
    }

    inline float brainwaveFreq() const {

        return mBrainwaveFreq.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // RESONANCE
    // =============================================

    inline void setResonanceIntensity(
        float value
    ) {

        mResonanceIntensity.store(
            value,
            std::memory_order_release
        );
    }

    inline float resonanceIntensity() const {

        return mResonanceIntensity.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // EQ
    // =============================================

    inline void setEqGain(
        int band,
        float gainDb
    ) {

        if (
            band < 0 ||
            band >= 10
        ) {
            return;
        }

        mEqGain[band].store(
            gainDb,
            std::memory_order_release
        );
    }

    inline float eqGain(
        int band
    ) const {

        if (
            band < 0 ||
            band >= 10
        ) {
            return 0.0f;
        }

        return mEqGain[band].load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // BASS BOOST
    // =============================================
    //
    // 🔥 FIX (2026-10-10): dulu `AudioEngine::setBassBoost()` bodi kosong
    // (`reserved for DSP pipeline param sync`), jadi slider bass di UI tidak
    // pernah sampai ke `EQProcessor::setBassBoost()`. Nilainya sekarang
    // disimpan di sini dan dibaca `AudioCallback::updateParameters()`.
    inline void setBassBoost(
        float gainDb
    ) {

        mBassBoost.store(
            gainDb,
            std::memory_order_release
        );
    }

    inline float bassBoost() const {

        return mBassBoost.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // HEADPHONE CORRECTION
    // =============================================
    //
    // 🔥 FASE D (2026-10-10): jalur koreksi headphone.
    //
    // Transfer preset dari UI thread ke audio thread memakai SEQLOCK, bukan
    // mutex: audio thread TIDAK BOLEH memblokir. Mutex akan membuat audio
    // thread menunggu UI thread, dan itu berarti glitch.
    //
    // Penulis (UI thread) menaikkan seq jadi GANJIL, menulis data, lalu
    // menaikkannya lagi jadi GENAP. Pembaca (audio thread) membaca seq,
    // menyalin, lalu membaca seq lagi — kalau berubah, penulisan sedang
    // berlangsung dan pembacaan diulang. Pembaca tidak pernah menulis apa pun,
    // jadi tidak ada risiko deadlock.
    //
    // Yang disalin hanya ~272 byte, dan itu terjadi di luar loop sample.

    inline void setHeadphoneCorrectionEnabled(
        bool value
    ) {

        mHeadphoneCorrectionEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isHeadphoneCorrectionEnabled() const {

        return mHeadphoneCorrectionEnabled.load(
            std::memory_order_acquire
        );
    }

    // Penulis: UI thread. Tidak boleh dipanggil dari audio thread.
    //
    // (C-P1, 2026-11-12): dua penulis — AudioEngine::loadHeadphonePreset()
    // dan AudioEngine::clearHeadphonePreset(), keduanya via JNI — diserialisasi
    // mutex ini. Praktiknya keduanya datang dari UI thread, tapi seqlock saja
    // tidak cukup bila dua penulis bertumpuk: urutan ganjil/genap dari dua
    // penulisan yang bersilangan bisa menghasilkan genap palsu di tengah
    // penulisan, dan pembaca mengira snapshot konsisten padahal robek.
    // Mutex ini hanya dipegang penulis (pembaca audio thread tetap seqlock
    // tanpa lock), dan tidak ada lock lain yang dipegang saat mengambilnya —
    // load/clear masuk lewat EngineManager tanpa memegang mMutex — jadi
    // tidak ada inversi urutan lock.
    inline void setHeadphonePreset(
        const HeadphonePresetData& preset
    ) {

        const std::lock_guard<std::mutex> lock(
            mPresetWriterMutex
        );

        const uint32_t seq =
            mPresetSeq.load(
                std::memory_order_relaxed
            );

        // Ganjil = penulisan sedang berlangsung.
        mPresetSeq.store(
            seq + 1,
            std::memory_order_relaxed
        );

        std::atomic_thread_fence(
            std::memory_order_release
        );

        mHeadphonePreset = preset;

        std::atomic_thread_fence(
            std::memory_order_release
        );

        // Genap = penulisan selesai.
        mPresetSeq.store(
            seq + 2,
            std::memory_order_relaxed
        );
    }

    // Pembaca: audio thread. Menyalin ke `out`.
    //
    // Mengembalikan PresetRead:
    //   Ok   — snapshot terbaca KONSISTEN dan ada preset terpasang.
    //   None — snapshot terbaca KONSISTEN tapi tidak ada preset
    //          (filterCount 0). `out` berisi snapshot konsisten itu.
    //   Busy — penulisan sedang berlangsung dan tidak selesai dalam batas
    //          percobaan. `out` TIDAK disentuh sama sekali: pemanggil harus
    //          mempertahankan preset buffer sebelumnya.
    //
    // Invarian: `out` HANYA ditulis dengan snapshot yang seq-nya
    // terverifikasi tidak berubah. Dulu `out` ditulis SEBELUM cek seq, jadi
    // komentar lama di sini ("jalur gagal mengembalikan false, BUKAN data
    // yang mungkin robek") menyesatkan: kegagalan tetap meninggalkan data
    // yang mungkin robek di `out`, dan pemanggil memakai `out` itu tanpa
    // memeriksa return — koefisien robek bisa terpasang walau fungsi
    // mengembalikan false. Dulu di sini ada fallback "pakai data terakhir
    // yang terbaca" — itu mengembalikan snapshot yang bisa berisi campuran
    // dua preset, dan test konkurensi menangkapnya: 3 robek dari 1,28 juta
    // pembacaan. Melewatkan koreksi satu buffer tidak terdengar; menerapkan
    // koefisien robek bisa menimbulkan pop. Gagal berisik, jangan sukses
    // palsu (docs/BOILERPLATE_AND_STUBS.md §2).
    inline PresetRead headphonePreset(
        HeadphonePresetData& out
    ) const {

        for (int attempt = 0; attempt < 8; ++attempt) {

            const uint32_t before =
                mPresetSeq.load(
                    std::memory_order_acquire
                );

            // Ganjil: penulisan sedang berlangsung, coba lagi.
            // `out` TIDAK disentuh di jalur ini.
            if (before & 1u) {
                continue;
            }

            // Salin ke lokal dulu: `out` baru ditulis SETELAH seq
            // terverifikasi tidak berubah selama penyalinan.
            HeadphonePresetData snapshot =
                mHeadphonePreset;

            std::atomic_thread_fence(
                std::memory_order_acquire
            );

            const uint32_t after =
                mPresetSeq.load(
                    std::memory_order_relaxed
                );

            if (before == after) {
                out = snapshot;
                return snapshot.filterCount > 0
                    ? PresetRead::Ok
                    : PresetRead::None;
            }
            // seq berubah selama penyalinan: snapshot mungkin campuran dua
            // preset — buang, coba lagi. `out` tetap utuh.
        }

        // Penulisan belum selesai setelah 8 percobaan: lewati koreksi buffer
        // ini. `out` sengaja TIDAK disentuh sama sekali.
        return PresetRead::Busy;
    }

private:

    // =============================================
    // ENGINE STATE
    // =============================================

    std::atomic<bool>
        mRunning{false};

    std::atomic<bool>
        mDSPEnabled{false};  // 🔥 FIX: default DSP disabled

    std::atomic<bool>
        mLimiterEnabled{true};

    std::atomic<bool>
        mImmersiveEnabled{false};

    std::atomic<bool>
        mExclusiveMode{false};

    // =============================================
    // PROCESSING MODE
    // =============================================

    std::atomic<ProcessingMode>
        mProcessingMode{
            ProcessingMode::DSP
        };

    // =============================================
    // OUTPUT
    // =============================================

    std::atomic<float>
        mMasterGain{1.0f};

    std::atomic<float>
        mBalance{0.0f};

    std::atomic<float>
        mStereoWidth{1.0f};

    // =============================================
    // IMMERSIVE AUDIO LAB
    // =============================================

    std::atomic<float>
        mSolfeggioFreq{528.0f};

    std::atomic<float>
        mBrainwaveFreq{0.0f};

    std::atomic<float>
        mResonanceIntensity{0.5f};

    // =============================================
    // EQ
    // =============================================

    std::array<
        std::atomic<float>,
        10
    > mEqGain {
        0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 0.0f, 0.0f, 0.0f
    };

    // 🔥 FIX (2026-10-10): bass boost (dB). Dulu tidak ada di state sama sekali,
    // jadi `AudioEngine::setBassBoost()` tidak punya tempat menyimpan.
    std::atomic<float>
        mBassBoost{0.0f};

    // =============================================
    // HEADPHONE CORRECTION (Fase D)
    // =============================================
    //
    // Seqlock: `mPresetSeq` ganjil saat penulisan berlangsung, genap saat
    // selesai. Lihat komentar di setHeadphonePreset()/headphonePreset().

    std::atomic<bool>
        mHeadphoneCorrectionEnabled{false};

    HeadphonePresetData
        mHeadphonePreset;

    std::atomic<uint32_t>
        mPresetSeq{0};

    // (C-P1, 2026-11-12): mutex khusus penulis preset — hanya diambil di
    // setHeadphonePreset(). Audio thread (pembaca seqlock) tidak pernah
    // menyentuhnya. AudioState kini non-copyable/non-movable karena mutex;
    // aman: AudioState hanya hidup sebagai member by-value di AudioEngine,
    // yang hidup sebagai member by-value di singleton EngineManager —
    // tidak ada yang menyalin atau memindahkan keduanya.
    std::mutex mPresetWriterMutex;
};

} // namespace pristine