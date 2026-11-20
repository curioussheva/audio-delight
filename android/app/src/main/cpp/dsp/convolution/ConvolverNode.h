// =====================================================
// dsp/convolution/ConvolverNode.h
// =====================================================
//
// Convolver / impulse response loader (2026-11-20, item 4 deep
// insight §6): muat file IR .wav (concert hall, tube amp, karakter
// headphone) ala convolver ViPER4Android, dan konvolusikan mix stereo
// dengannya. "Ruang" sebagai fitur, bukan sekadar efek — identitas
// psikoakustik app.
//
// MESIN (bukan dari nol): UniformPartitionedConvolver multi-partisi
// (yang sama dengan HRTF — satu convolver per kanal, kernel mono yang
// sama di L dan R; true-stereo IR dengan kernel L/R berbeda di luar
// cakupan v1). v1 node lama (FIRFilter langsung, O(tap) per sampel)
// TIDAK dipakai: untuk IR 1 detik (48.000 tap) itu ~4,6 GMAC/detik
// stereo — mustahil realtime. FIRFilter dihapus bersama rewrite ini
// (0 pemakai lain).
//
// RANTAI: sesudah ReverbNode, sebelum HRTFNode (keputusan, lihat
// DSPChain::buildGraph): ekor IR ikut ter-spatialisasi HRTF seperti
// ekor reverb (alasan yang sama persis); sebelum gain (master gain
// mengatur level akhir termasuk IR) dan limiter (menangkap puncak
// campuran kering+IR).
//
// Kontrak (pola HRTFNode/ReverbNode):
//   - Node SELALU enabled di graph; applyConfig hanya mengatur
//     target wet (0/1). Graph melewatkan node yang disabled,
//     sehingga fade-out tidak mungkin terjadi (potong keras = klik).
//     Toggle dihaluskan one-pole ~10 ms (kSmooth yang sama).
//   - Wet settle di 0, atau belum ada IR -> process() langsung
//     return: passthrough bit-exact, biaya NOL.
//   - OFF -> ON: convolver di-reset dulu (ekor basi tidak boleh
//     meledak keluar), lalu wet fade-in.
//   - GANTI IR saat audio jalan: kernel baru di-stage lewat
//     setKernelPartitioned (FFT di thread pemanggil, bukan audio
//     thread); audio thread memasangnya di process() berikutnya.
//     Node mendeteksi swap lewat kernelGeneration() dan
//     menenggelamkan wet ke 0 — fade-in menutupi potongan ekor.
//   - IR TIDAK PERNAH dinormalisasi: karakter file dipertahankan
//     apa adanya. IR yang panas bisa mendorong limiter (node
//     terakhir) — itu tugas limiter, bukan convolver.
//   - Bit-perfect: node hanya hidup di DSPChain (processDSP);
//     processBitPerfect() no-op dan fast path melewatkan
//     updateParameters() — bypass struktural, bukan flag.
//
// LAJU SAMPEL: IR di-resample ke laju stream dengan Blackman-windowed
// sinc (matematika yang sama dengan HRTFNode::resampleKernel —
// diduplikasi di sini, bukan diekstrak, supaya HRTFNode yang sudah
// terverifikasi tidak disentuh). IR asli (laju file) DISIMPAN;
// prepare() me-resample ulang tiap kali laju stream berubah (ganti
// track / reopen). IR yang sesudah resample melebihi batas tap
// convolver (98.304 tap, ~2 dtk) DITOLAK saat load (status TooLong),
// dan node menjadi inert (passthrough) bila laju stream berubah
// ke nilai yang membuat IR tidak muat — tidak pernah membisukan
// audio.
//
// IR disimpan di DSPChain (master copy) — prepare() membangun ulang
// graph dengan node BARU, jadi node sendiri tidak bisa jadi
// satu-satunya pemilik original. DSPChain menyerahkan original ke
// node segar lewat setIrSource(); node me-rebuild kernel di prepare().
//
// SPDX-License-Identifier: MIT

#pragma once

#include <atomic>
#include <mutex>
#include <string>
#include <vector>

#include "../graph/DSPNode.h"
#include "UniformPartitionedConvolver.h"

namespace pristine {

class ConvolverNode : public DSPNode {
public:

    // Status load IR — angka SAMA dengan IrLoadStatus (IRLoader.h)
    // dan ConvolverIrStatus di JS. JANGAN ubah nomornya tanpa
    // mengubah ketiga lapis itu.
    static constexpr int kLoadOk = 0;
    static constexpr int kLoadFileError = 1;
    static constexpr int kLoadFormatError = 2;
    static constexpr int kLoadTooLong = 3;
    static constexpr int kLoadSilent = 4;
    static constexpr int kLoadRateError = 5;

    void prepare(
        int sampleRate,
        int maxFrames
    ) override;

    void reset() override;

    void process(
        float* left,
        float* right,
        int frames
    ) override;

    void applyConfig(
        const DSPConfig& config
    ) override;

    // Serahkan IR asli (laju file) ke node — dipakai DSPChain saat
    // membangun graph baru (prepare). Node TIDAK me-resample di sini;
    // rebuild kernel terjadi di prepare() untuk laju stream saat itu.
    // Thread pemanggil: engine start (bukan audio thread).
    void setIrSource(
        const std::vector<float>& samples,
        int sampleRateHz
    );

    // Resample IR tersimpan ke `streamRateHz` dan stage kernelnya ke
    // kedua convolver (live-safe: FFT di thread pemanggil, pasang di
    // process() berikutnya). Dipakai prepare() dan DSPChain saat IR
    // baru dimuat saat audio jalan. Return false bila tidak ada IR
    // atau hasil resample melebihi batas tap (node tetap inert —
    // convolver tanpa kernel = passthrough, tidak membisukan audio).
    bool stageKernelForRate(int streamRateHz);

    // Hapus IR. Kernel di convolver SENGAJA tidak dibongkar di sini:
    // process() melihat mIrLoaded=false -> target wet 0 -> fade-out
    // memakai kernel lama (ekor berbunyi habis), lalu passthrough.
    // Kernel lama tertimpa saat IR baru dimuat / dibuang saat
    // prepare() berikut (node baru).
    void clearIr();

    // Untuk host test / diagnostik / info UI (via DSPChain).
    inline bool hasIr() const {
        return mIrLoaded.load(std::memory_order_acquire);
    }

    inline int irSampleRateHz() const {
        std::lock_guard<std::mutex> lock(mIrMutex);
        return mIrRateHz;
    }

    // Panjang IR (tap) sesudah resample ke `streamRateHz`, atau 0
    // bila tidak ada IR.
    int irTapsForRate(int streamRateHz) const;

    // Untuk host test / diagnostik.
    inline float wetCurrent() const { return mWetCurrent; }

private:

    void resetConvolvers();

    // Resample satu IR sekali jalan (prepare/load-time saja, bukan
    // realtime): Blackman-windowed sinc — matematika yang sama dengan
    // HRTFNode::resampleKernel (SincResampler tidak dipakai karena
    // process()-nya stub interpolasi linear).
    static bool resampleKernel(
        const float* in,
        int inLen,
        int inRate,
        float* out,
        int outLen,
        int outRate
    );

    UniformPartitionedConvolver mConvL;
    UniformPartitionedConvolver mConvR;

    // Scratch per panggilan process() (dialokasikan di prepare()).
    std::vector<float> mTmpL;
    std::vector<float> mTmpR;

    // IR asli (laju file) — sumber rebuild tiap prepare(). Dijaga
    // mIrMutex: ditulis thread JNI/UI (setIrSource/clearIr),
    // dibaca prepare()/stageKernelForRate (engine start / JNI).
    // process() (audio thread) TIDAK menyentuh ini — hanya
    // mIrLoaded (atomic) + state convolver.
    std::vector<float> mIrOriginal;
    int mIrRateHz = 0;
    std::atomic<bool> mIrLoaded{false};
    mutable std::mutex mIrMutex;

    int mSampleRate = 48000;
    int mMaxFrames = 1920;

    // Generasi kernel yang terakhir dilihat process() (untuk
    // deteksi swap — lihat process()).
    int mSeenGeneration = -1;

    float mWetTarget = 0.0f;
    float mWetCurrent = 0.0f;

    // Sama dengan GainNode / ReverbNode / HRTFNode (~10 ms @48 kHz).
    static constexpr float kSmooth = 0.002f;
    static constexpr float kSettledEps = 1e-4f;
};

} // namespace pristine
