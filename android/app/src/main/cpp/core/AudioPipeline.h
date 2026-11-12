#pragma once

#include <cstdint>

#include "AudioTypes.h"

#include "../dsp/DSPChain.h"

#include "ImmersiveStage.h"

namespace pristine {

// =====================================================
// AUDIO PIPELINE
// Realtime DSP orchestration layer
// =====================================================

class AudioPipeline {
public:

    AudioPipeline();

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int32_t sampleRate,
        int32_t maxFrames
    );

    void reset();
    // =============================================
    // PROCESS
    // =============================================

    void process(float* left, float* right, int32_t frames, const DSPParameters& params) noexcept;

private:

    // =============================================
    // MODES
    // =============================================

    void processBitPerfect(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

    void processDSP(
        float* left,
        float* right,
        int32_t frames,
        const DSPParameters& params
    ) noexcept;

    void processImmersive(
        float* left,
        float* right,
        int32_t frames,
        const DSPParameters& params
    ) noexcept;

    // =============================================
    // GANTI MODE LIVE (C-MODESW, 2026-11-12)
    // =============================================
    //
    // Dipanggil dari process() HANYA saat mode benar-benar berubah
    // (mLastMode != mode baru). Mereset rantai TUJUAN dan mempersenjatai
    // fade-in — lihat onModeChanged() di .cpp untuk alasan masing-masing
    // pilihan. Bukan tiap buffer: gerbangnya perbandingan mode di
    // process(), jadi biaya deteksi satu banding enum per chunk.
    void onModeChanged(
        ProcessingMode mode
    ) noexcept;

    // Fade-in linear output rantai tujuan sesudah ganti mode, 0 -> 1
    // selama mFadeFramesTotal frame. No-op bila tidak ada fade aktif
    // (mFadeFramesRemaining == 0). Dipanggil dari processDSP() /
    // processImmersive() SESUDAH rantai diproses, TIDAK dari
    // processBitPerfect() — BitPerfect harus tetap bit-exact.
    void applyModeSwitchFade(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

private:

    // =============================================
    // KONFIGURASI DSP
    // =============================================
    //
    // �� FIX (2026-10-10): `DSPChain::applyConfig()` dulu NOL pemanggil dari
    // jalur produksi — semua referensinya berputar di dalam `dsp/` sendiri.
    // Akibatnya `DSPChain::mConfig` selamanya default, dan keempat node
    // (EQ, StereoWidener, Gain, Limiter) berjalan sebagai identity:
    // mode DSP mengeluarkan PCM yang identik dengan BitPerfect.
    //
    // Sekarang config dibangun dari `DSPParameters` dan dikirim ke rantai
    // HANYA saat nilainya berubah — `applyConfig()` menghitung koefisien
    // biquad (powf/cosf/sinf), jadi memanggilnya tiap buffer akan membebani
    // audio thread tanpa manfaat.
    //
    // Lihat docs/DSP_CHAIN_AUDIT.md.
    void applyDSPConfig(
        const DSPParameters& params
    ) noexcept;

    DSPConfig mDspConfig;

    // Snapshot config yang terakhir benar-benar dikirim ke rantai. Dipakai
    // untuk mendeteksi perubahan.
    DSPConfig mAppliedConfig;

    // false = belum pernah dikirim, jadi kirim pertama selalu dilakukan.
    bool mConfigApplied = false;

    DSPChain mDSP;

    // Rantai proses mode Immersive. Dipindahkan dari cpp/modes/ImmersivePipeline
    // (dihapus 5a386f0a9) - lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.
    // Hidup sepanjang umur AudioPipeline; prepare() dipanggil saat stream dibuka.
    ImmersiveStage mImmersive;

    // (mSampleRate/mMaxFrames dihapus 2026-11-10: hanya ditulis di prepare(),
    // tidak pernah dibaca.)
    // (C-MODESW, 2026-11-12): mSampleRate DIHIDUPKAN LAGI — sekarang dibaca:
    // durasi fade-in ganti mode (8 ms) dihitung dalam frame dari laju ini.
    // mMaxFrames tetap tidak disimpan: tidak ada pemakai.
    int32_t mSampleRate = 0;

    // =============================================
    // GANTI MODE LIVE (C-MODESW, 2026-11-12)
    // =============================================
    //
    // Mode yang diproses buffer terakhir. Hanya ditulis di process()
    // (audio thread saja) — tidak perlu atomic: AudioState sudah jadi
    // satu-satunya jembatan antar-thread, dan mLastMode murni jejak lokal
    // audio thread atas nilai yang dibaca dari sana.
    //
    // (C-DEFMODE, 2026-11-12): nilai awal DSP, sama seperti default runtime
    // (AudioState). Nilai ini tidak pernah dibaca sebelum ditulis pertama
    // kali (mModeSeen == false di buffer pertama), jadi perubahan ini
    // netral-perilaku — hanya menghapus literal BitPerfect keempat yang
    // bertentangan dengan default lainnya.
    ProcessingMode mLastMode{ProcessingMode::DSP};

    // false = process() belum pernah dipanggil sejak prepare()/reset()
    // terakhir, jadi buffer pertama HANYA mencatat mode (tanpa reset dan
    // tanpa fade — node masih segar dari prepare()/buildGraph atau baru
    // dibersihkan reset(), fade di start playback akan terdengar sebagai
    // dip di awal lagu).
    bool mModeSeen = false;

    // Fade-in ganti mode: total frame (8 ms @ mSampleRate) dan sisa frame
    // yang belum di-fade. 0 = tidak ada fade aktif. Sisa disimpan antar
    // chunk supaya fade yang lebih panjang dari satu chunk (mis. 8 ms @
    // 192 kHz = 1536 frame masih < kMax 1920, tapi laju lebih tinggi /
    // chunk lebih pendek tetap tertutup) selesai dengan benar.
    int32_t mFadeFramesTotal = 0;
    int32_t mFadeFramesRemaining = 0;

    // =============================================
    // SMOOTHING GAIN IMMERSIVE (C-SMOOTH, 2026-11-12)
    // =============================================
    //
    // Master gain + balance mode Immersive diterapkan inline di
    // processImmersive() (bukan lewat GainNode) — dan dulu langsung
    // menimpa per buffer: zipper noise yang sama seperti GainNode.
    // Di-smooth per sample dengan one-pole (kSmooth = 0,002f, ambang
    // 1e-4f — konstanta yang sama dengan SpatialFieldProcessor dan
    // GainNode). Prime pertama kali supaya buffer pertama langsung di
    // target; prepare()/reset() membuka prime lagi supaya tidak ada
    // sapuan dari nilai lama sesudah reopen/stop. Nilai akhir TIDAK
    // berubah: begitu sampai, gain persis target.
    //
    // BitPerfect TIDAK tersentuh: processBitPerfect() no-op dan tidak
    // pernah membaca state ini (lihat process()).
    float mSmoothGainL = 1.0f;
    float mSmoothGainR = 1.0f;
    bool mGainPrimed = false;
};

} // namespace pristine 