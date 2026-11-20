// =====================================================
// dsp/convolution/UniformPartitionedConvolver.h
// =====================================================
//
// Konvolver partitioned seragam — blok 256 sampel, FFT 512, di atas
// `FFTPlan` (radix-2, sudah teruji jalur visualizer/analyzer) —
// tanpa dependensi baru.
//
// v1 (2026-11-19, HRTF): SATU partisi, menutup seluruh HRIR 256-tap.
// v2 (2026-11-20, convolver IR): MULTI-PARTISI — kernel sepanjang apa
// pun sampai kMaxMultiKernelLength (98.304 tap ≈ 2,05 dtk @48 kHz)
// dipecah menjadi partisi-partisi 256 tap; tiap blok input dikonvolusi
// dengan semua partisi lewat frequency-delay-line (FDL): spektrum blok
// input disimpan di ring buffer, lalu dijumlahkan dengan spektrum tiap
// partisi yang tertunda tepat sejauh partisi itu. Satu partisi = kasus
// khusus P=1: matematikanya IDENTIK dengan v1 (satu kali-kali spektrum,
// tanpa penjumlahan tambahan), jadi HRTF tidak berubah perilaku.
//
// Desain (per laporan hrtf-design-report.md §2, diperluas):
//   - Blok 256 sampel, FFT 512, satu partisi menutup 256 tap.
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
// GANTI KERNEL SAAT AUDIO JALAN (live swap, 2026-11-20):
//   - `setKernel()` (satu partisi) = prepare-time saja, pasang
//     langsung — dipakai HRTF dari prepare(), saat audio belum jalan.
//   - `setKernelPartitioned()` = aman dipanggil kapan pun (thread
//     JNI/UI): FFT semua partisi dikerjakan DI SINI (thread pemanggil,
//     bukan audio thread), hasilnya ditaruh di slot kernel yang sedang
//     TIDAK aktif, lalu `mPendingSlot` diumumkan lewat atomic.
//     Audio thread memasangnya di awal `process()` berikutnya
//     (installPendingKernel: balik slot aktif + bersihkan tail
//     dan FDL kernel lama — tanpa alokasi, tanpa FFT di audio
//     thread). FIFO input/output DIPERTAHANKAN saat swap supaya
//     tidak ada sampel yang hilang (residu < 256 sampel di FIFO
//     input diproses dengan kernel baru; output lama yang sudah
//     dihitung mengalir habis secara alami). Ekor kernel lama
//     dibuang (bukan di-crossfade): pemanggil (ConvolverNode)
//     yang menenggelamkan wet ke 0 saat swap supaya tidak terdengar
//     sebagai potongan.
//   - Slot FDL ikut double-buffer dengan cara yang sama: bila partisi
//     baru lebih banyak dari FDL aktif, thread pemanggil sudah
//     menyiapkan FDL baru (mStagedFdl); swap hanya mem-move pointer
//     (tanpa alokasi di audio thread).
//
// Aturan realtime: semua buffer dialokasikan di setKernel()/
// setKernelPartitioned()/prepare(); process() tidak mengalokasi,
// tidak memanggil fungsi yang bisa memblokir, dan tidak menyentuh
// kernel (kernel hanya dibaca).
//
// SPDX-License-Identifier: MIT

#pragma once

#include <atomic>
#include <vector>

#include "../../fft/FFTPlan.h"

namespace pristine {

class UniformPartitionedConvolver {
public:

    static constexpr int kBlockSize = 256;
    static constexpr int kFftSize = 512;

    // Panjang kernel maksimum jalur satu-partisi (v1, HRTF).
    // IR lebih panjang ditolak di jalur itu — pakai
    // setKernelPartitioned() di bawah.
    static constexpr int kMaxKernelLength = kBlockSize;

    // Batas jalur multi-partisi (v2, convolver IR): 384 partisi ×
    // 256 tap = 98.304 tap ≈ 2,05 dtk @48 kHz, 2,23 dtk @44,1 kHz.
    // IR lebih panjang DITOLAK pemanggil (bukan dipotong diam-diam).
    // Biaya per blok per kanal ≈ P × 512 kali-kompleks; P=375
    // (~2 dtk) ≈ 750 kali-kompleks/sampel — berat tapi masih jauh
    // di bawah kemampuan satu core HP modern; IR tipikal 0,5–1 dtk
    // (P=94–188) setengahnya.
    static constexpr int kMaxPartitions = 384;
    static constexpr int kMaxMultiKernelLength =
        kMaxPartitions * kBlockSize;

    UniformPartitionedConvolver();

    // Muat kernel satu partisi (HRTF). Kernel disalin — pemanggil
    // yang mengatur trim (HRTFNode melipat trim ke kernel sebelum
    // setKernel). Kernel harus finite; panjang 1..kMaxKernelLength.
    // Return false bila kernel tidak valid (state lama dipertahankan).
    // PREPARE-TIME SAJA: pasang langsung ke slot aktif.
    bool setKernel(
        const float* kernel,
        int length
    );

    // Muat kernel multi-partisi (convolver IR): kernel dipecah
    // menjadi ceil(length / 256) partisi; tiap partisi di-FFT di
    // sini (thread pemanggil). Kernel harus finite; panjang
    // 1..kMaxMultiKernelLength. Return false bila kernel tidak valid
    // (state lama dipertahankan). AMAN SAAT AUDIO JALAN: hasil
    // ditaruh di slot non-aktif + diumumkan lewat mPendingSlot;
    // audio thread memasangnya di process() berikutnya (atau
    // prepare() bila dipanggil sebelum audio jalan).
    bool setKernelPartitioned(
        const float* kernel,
        int length
    );

    // Siapkan FIFO + FDL. Dipanggil sekali sebelum process(); boleh
    // dipanggil ulang (me-reset state). sampleRate dicatat untuk
    // dokumentasi; konvolver ini tidak tergantung laju (kernel sudah
    // pada laju stream saat dimuat).
    void prepare(int sampleRate);

    // Kosongkan delay line + FIFO + FDL, lalu prime output dengan
    // satu blok nol (latensi tetap satu blok). Dipanggil DSPGraph
    // saat output non-finite, HRTFNode saat toggle OFF -> ON, dan
    // ConvolverNode saat ganti IR (ekor basi dari pemakaian
    // sebelumnya tidak boleh meledak keluar).
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

    // Jumlah partisi kernel AKTIF (0 = belum ada kernel). Untuk
    // diagnostik / tes.
    inline int numPartitions() const {
        return mNumPartitions[mActiveSlot];
    }

    // Panjang kernel AKTIF dalam tap (0 = belum ada kernel).
    inline int kernelLength() const {
        return mKernelLength[mActiveSlot];
    }

    // Generasi kernel AKTIF: naik 1 tiap kali kernel baru terpasang
    // (setKernel / installPendingKernel). Pemanggil (ConvolverNode)
    // membandingkan nilai ini tiap process() untuk mendeteksi swap
    // kernel saat audio jalan — lalu menenggelamkan wet ke 0 supaya
    // potongan ekor tidak terdengar. Panjang tap saja tidak cukup:
    // dua IR berbeda bisa sama panjangnya.
    inline int kernelGeneration() const {
        return mKernelGeneration;
    }

private:

    // Pasang kernel yang diumumkan setKernelPartitioned (bila ada):
    // balik slot aktif + ganti FDL bila sudah disiapkan + bersihkan
    // tail dan FDL (state kernel lama tidak berlaku untuk kernel
    // baru). FIFO input/output SENGAJA dipertahankan — lihat header.
    // No-op bila tidak ada yang pending. Dipanggil di awal
    // process() (audio thread) dan di akhir prepare() (sebelum audio
    // jalan). Tanpa alokasi.
    bool installPendingKernel();

    // Proses SATU blok penuh dari depan FIFO input; hasilnya (256
    // sampel, sudah overlap-add dengan tail) ditambahkan ke FIFO
    // output. Dipanggil hanya bila FIFO input berisi >= 1 blok.
    void processBlock();

    // Hitung spektrum semua partisi dari satu kernel, ke dalam
    // `spectra` (di-resize dulu). Dipakai kedua jalur setKernel.
    // Return false bila kernel tidak valid.
    bool computeSpectra(
        const float* kernel,
        int length,
        std::vector<std::vector<Complex>>& spectra,
        int& outPartitions,
        int& outLength
    );

    FFTPlan mFft;

    // Spektrum kernel per slot (double-buffer untuk live swap):
    // spectra[slot][partisi][bin], tiap partisi 512 bin.
    // Slot 0 = dipakai setKernel() (HRTF, prepare-time) + slot
    // aktif awal; slot 1 = staging setKernelPartitioned().
    std::vector<std::vector<Complex>> mKernelSpectra[2];
    int mNumPartitions[2] = {0, 0};
    int mKernelLength[2] = {0, 0};

    // Slot aktif (hanya disentuh audio thread + prepare()).
    int mActiveSlot = 0;

    // Generasi kernel aktif (naik tiap install; lihat
    // kernelGeneration()).
    int mKernelGeneration = 0;

    // Slot yang diumumkan thread pemanggil (-1 = tidak ada).
    // Release saat menulis, acquire saat membaca di process().
    std::atomic<int> mPendingSlot{-1};

    // FDL AKTIF: ring spektrum blok-blok input terakhir, satu entri
    // per partisi (mFdl[(mBlockCounter - p) mod P] = spektrum blok
    // input p blok yang lalu). Dialokasikan di prepare() sebesar
    // partisi aktif; diganti mStagedFdl saat swap ke P lebih besar.
    std::vector<std::vector<Complex>> mFdl;
    // FDL yang disiapkan thread pemanggil untuk kernel pending
    // (kosong bila P baru <= ukuran FDL aktif).
    std::vector<std::vector<Complex>> mStagedFdl;

    // Nomor blok input yang sedang diproses (untuk indeks ring FDL).
    int mBlockCounter = 0;

    // Scratch per blok (dialokasikan di prepare()).
    std::vector<float> mBlockIn;     // 512, input zero-padded
    std::vector<Complex> mBlockSpec; // 512
    std::vector<Complex> mAccumSpec; // 512, jumlah FDL × kernel
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
