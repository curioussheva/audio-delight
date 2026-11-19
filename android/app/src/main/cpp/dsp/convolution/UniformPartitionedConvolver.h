// =====================================================
// dsp/convolution/UniformPartitionedConvolver.h
// =====================================================
//
// Konvolver partitioned seragam — SATU partisi, dibangun FRESH untuk
// HRTF (2026-11-19). BUKAN kelanjutan skeleton `PartitionedConvolver`
// / `FFTConvolver` di direktori ini (keduanya shell kosong: prepare +
// reset saja, tanpa process, tanpa buffer, tanpa IR — tidak ada yang
// bisa "dilengkapi", hanya bentuk antarmuka).
//
// Desain (per laporan hrtf-design-report.md §2):
//   - Blok 256 sampel, FFT 512, satu partisi menutup seluruh HRIR
//     256-tap. Strukturnya bisa diskalakan ke IR lebih panjang
//     (tambah partisi), tapi v1 hanya butuh satu.
//   - Dibangun di atas `FFTPlan` (radix-2, sudah teruji jalur
//     visualizer/analyzer) — tanpa dependensi baru.
//   - Streaming untuk `process()` dengan `frames` berapa pun
//     (callback Oboe memotong di 1920 frame; 1920 bukan kelipatan
//     256, jadi blok parsial PASTI terjadi): FIFO input + FIFO output
//     linear, tanpa alokasi sesudah prepare.
//   - Latensi tetap tepat SATU BLOK (256 sampel = 5,3 ms @48 kHz):
//     FIFO output di-prime 256 nol saat reset, sehingga process()
//     selalu mengeluarkan tepat `frames` sampel — tidak pernah
//     dropout, tidak pernah zero-pad darurat di tengah lagu. Untuk
//     pemutar musik latensi ini tidak relevan (tanpa lip-sync,
//     tanpa live monitoring); yang penting sinyalnya tidak pernah
//     terpotong.
//
// Aturan realtime: semua buffer dialokasikan di setKernel()/prepare();
// process() tidak mengalokasi, tidak memanggil fungsi yang bisa
// memblokir, dan tidak menyentuh kernel (kernel hanya dibaca).
//
// SPDX-License-Identifier: MIT

#pragma once

#include <vector>

#include "../../fft/FFTPlan.h"

namespace pristine {

class UniformPartitionedConvolver {
public:

    static constexpr int kBlockSize = 256;
    static constexpr int kFftSize = 512;

    // Panjang kernel maksimum v1 = satu blok. IR lebih panjang ditolak
    // (return false) — butuh multi-partisi, di luar cakupan v1.
    static constexpr int kMaxKernelLength = kBlockSize;

    UniformPartitionedConvolver();

    // Muat kernel dan hitung spektrumnya sekali. Kernel disalin +
    // dinormalisasi TIDAK di sini — pemanggil yang mengatur trim
    // (HRTFNode melipat trim ke kernel sebelum setKernel).
    // Kernel harus finite; panjang 1..kMaxKernelLength.
    // Return false bila kernel tidak valid (state lama dipertahankan).
    bool setKernel(
        const float* kernel,
        int length
    );

    // Siapkan FIFO. Dipanggil sekali sebelum process(); boleh dipanggil
    // ulang (me-reset state). sampleRate dicatat untuk dokumentasi;
    // konvolver ini tidak tergantung laju (kernel sudah pada laju
    // stream saat dimuat).
    void prepare(int sampleRate);

    // Kosongkan delay line + FIFO, lalu prime output dengan satu blok
    // nol (latensi tetap satu blok). Dipanggil DSPGraph saat output
    // non-finite, dan HRTFNode saat toggle OFF -> ON (ekor basi dari
    // pemakaian sebelumnya tidak boleh meledak keluar).
    void reset();

    // Konvolusi streaming: `frames` sampel masuk -> `frames` sampel
    // keluar. frames boleh berapa pun (0 = no-op). Bila kernel belum
    // dimuat (!isReady), passthrough: input disalin ke output supaya
    // salah konfigurasi tidak membisukan audio.
    void process(
        const float* input,
        float* output,
        int frames
    );

    inline bool isReady() const { return mReady; }

    inline int sampleRate() const { return mSampleRate; }

private:

    // Proses SATU blok penuh dari depan FIFO input; hasilnya (256
    // sampel, sudah overlap-add dengan tail) ditambahkan ke FIFO
    // output. Dipanggil hanya bila FIFO input berisi >= 1 blok.
    void processBlock();

    FFTPlan mFft;

    std::vector<Complex> mKernelSpectrum;  // FFT kernel, ukuran 512

    // Scratch per blok (dialokasikan di prepare()).
    std::vector<float> mBlockIn;     // 512, input zero-padded
    std::vector<Complex> mBlockSpec; // 512
    std::vector<float> mBlockOut;    // 512, hasil IFFT

    std::vector<float> mTail;  // overlap-add, ukuran 256

    // FIFO linear (bukan ring — blok kecil, memmove murah).
    std::vector<float> mInBuf;
    std::vector<float> mOutBuf;
    int mInCount = 0;
    int mOutCount = 0;

    int mSampleRate = 48000;
    bool mReady = false;
};

} // namespace pristine
