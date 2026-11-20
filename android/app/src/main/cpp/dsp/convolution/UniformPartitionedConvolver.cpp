// =====================================================
// dsp/convolution/UniformPartitionedConvolver.cpp
// =====================================================
//
// Konvolver partitioned seragam, blok 256 / FFT 512, di atas
// FFTPlan. Lihat header untuk kontrak lengkap.
//
// v1 (satu partisi, HRTF) — algoritme per blok (overlap-add):
//   1. Ambil 256 sampel dari FIFO input, zero-pad ke 512.
//   2. FFT maju -> kalikan dengan spektrum kernel -> FFT balik.
//   3. 256 sampel pertama + tail blok sebelumnya = output blok;
//      256 sampel kedua disimpan sebagai tail baru.
//
// v2 (multi-partisi, convolver IR) — langkah 2 menjadi FDL:
//   2a. Simpan spektrum blok input ke ring FDL.
//   2b. Jumlahkan, untuk tiap partisi p, spektrum blok input p blok
//       yang lalu × spektrum partisi p (partisi 0 = tanpa tunda,
//       partisi 1 = tertunda satu blok, dst).
//   2c. FFT balik dari jumlah itu.
//   P=1 identik dengan v1.
//
// Streaming: FIFO input menampung blok parsial antar panggilan
// process(); FIFO output di-prime 256 nol saat reset, sehingga
// process() selalu mengeluarkan tepat `frames` sampel (invarian:
// level FIFO output = 256 - (totalInput mod 256), selalu >= 1
// sebelum drain — dibuktikan di header; host test menguji semua
// ukuran frames 1..1920).
//
// SPDX-License-Identifier: MIT

#include "UniformPartitionedConvolver.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace pristine {

namespace {

// Kapasitas FIFO: residual (< 256) + satu panggilan process() penuh
// (maks 1920 frame, DSPGraph::mMaxFrames) + margin. Dipakai juga
// untuk menampung hasil satu panggilan terburuk (level sebelum drain
// <= 256 + 2048).
constexpr int kFifoCapacity = 4096;

// Potongan append per iterasi, supaya frames berapa pun aman.
constexpr int kAppendChunk = 1024;

bool allFinite(const float* data, int length) {
    for (int i = 0; i < length; ++i) {
        if (!std::isfinite(data[i])) {
            return false;
        }
    }
    return true;
}

} // namespace

UniformPartitionedConvolver::UniformPartitionedConvolver()
    : mFft(kFftSize) {
}

// =====================================================
// HITUNG SPEKTRUM PARTISI
// =====================================================
// Scratch LOKAL (bukan member): fungsi ini dipanggil dari
// setKernelPartitioned() yang boleh jalan saat audio thread sedang
// memakai mBlockIn/mBlockSpec di processBlock() — scratch member
// akan teracak. Alokasi di sini terjadi di thread pemanggil, bukan
// audio thread.

bool UniformPartitionedConvolver::computeSpectra(
    const float* kernel,
    int length,
    std::vector<std::vector<Complex>>& spectra,
    int& outPartitions,
    int& outLength
) {

    if (
        !kernel ||
        length <= 0 ||
        length > kMaxMultiKernelLength ||
        !allFinite(kernel, length)
    ) {
        return false;
    }

    const int partitions =
        (length + kBlockSize - 1) / kBlockSize;

    spectra.assign(
        static_cast<size_t>(partitions),
        std::vector<Complex>(
            static_cast<size_t>(kFftSize),
            Complex(0.0f, 0.0f)
        )
    );

    std::vector<float> blockIn(
        static_cast<size_t>(kFftSize),
        0.0f
    );

    for (int p = 0; p < partitions; ++p) {
        const int offset = p * kBlockSize;
        const int tapCount =
            std::min(kBlockSize, length - offset);

        std::fill(blockIn.begin(), blockIn.end(), 0.0f);
        std::copy(
            kernel + offset,
            kernel + offset + tapCount,
            blockIn.begin()
        );

        mFft.forward(
            blockIn.data(),
            spectra[static_cast<size_t>(p)].data()
        );
    }

    outPartitions = partitions;
    outLength = length;
    return true;
}

// =====================================================
// SET KERNEL — SATU PARTISI (HRTF, prepare-time)
// =====================================================

bool UniformPartitionedConvolver::setKernel(
    const float* kernel,
    int length
) {

    if (
        !kernel ||
        length <= 0 ||
        length > kMaxKernelLength
    ) {
        return false;
    }

    std::vector<std::vector<Complex>> spectra;
    int partitions = 0;
    int outLength = 0;
    if (!computeSpectra(
            kernel,
            length,
            spectra,
            partitions,
            outLength
        )
    ) {
        return false;
    }

    // Pasang langsung ke slot 0 (jalur prepare-time — audio belum
    // jalan, tidak ada yang perlu di-swap). Kernel partitioned yang
    // mungkin sedang pending dibatalkan: jalur ini milik HRTF dan
    // tidak boleh tertimpa kernel IR, begitu pula sebaliknya di
    // instance yang sama tidak pernah terjadi (tiap node punya
    // convolver sendiri), tapi batalkan eksplisit supaya state
    // tidak ambigu.
    mKernelSpectra[0] = std::move(spectra);
    mNumPartitions[0] = partitions;
    mKernelLength[0] = outLength;
    mActiveSlot = 0;
    mPendingSlot.store(-1, std::memory_order_release);
    mStagedFdl.clear();
    ++mKernelGeneration;

    // Kernel baru = state lama tidak berlaku. prepare() mengalokasikan
    // buffer yang belum ada + me-reset state (termasuk prime FIFO
    // output) — jangan panggil reset() langsung di sini: sebelum
    // prepare() pertama, mOutBuf masih kosong dan prime tidak terjadi,
    // sehingga process() pertama akan kehabisan output (invarian FIFO
    // di header dilanggar).
    prepare(mSampleRate);
    mReady = true;
    return true;
}

// =====================================================
// SET KERNEL — MULTI-PARTISI (convolver IR, live-safe)
// =====================================================

bool UniformPartitionedConvolver::setKernelPartitioned(
    const float* kernel,
    int length
) {

    if (
        !kernel ||
        length <= 0 ||
        length > kMaxMultiKernelLength
    ) {
        return false;
    }

    std::vector<std::vector<Complex>> spectra;
    int partitions = 0;
    int outLength = 0;
    if (!computeSpectra(
            kernel,
            length,
            spectra,
            partitions,
            outLength
        )
    ) {
        return false;
    }

    // Slot staging = yang TIDAK aktif. Audio thread hanya membaca
    // slot aktif, jadi menulis slot ini aman kapan pun. Bila ada
    // kernel yang masih pending di slot yang sama, ia tertimpa —
    // benar: yang terbaru yang berlaku.
    const int stagingSlot = 1 - mActiveSlot;
    mKernelSpectra[stagingSlot] = std::move(spectra);
    mNumPartitions[stagingSlot] = partitions;
    mKernelLength[stagingSlot] = outLength;

    // FDL untuk kernel baru disiapkan DI SINI (thread pemanggil)
    // bila partisi baru melebihi FDL aktif — swap nanti hanya
    // mem-move (tanpa alokasi di audio thread). Bila P baru <=
    // ukuran FDL aktif, FDL lama dipakai ulang (di-nol-kan saat
    // reset di install).
    // mFdl TIDAK dibaca di sini: ukurannya bisa berubah di audio
    // thread (installPendingKernel) — baca itu dari thread ini
    // adalah data race. Selalu siapkan staged FDL; install yang
    // memutuskan memakainya atau tidak.
    mStagedFdl.assign(
        static_cast<size_t>(partitions),
        std::vector<Complex>(
            static_cast<size_t>(kFftSize),
            Complex(0.0f, 0.0f)
        )
    );

    // Umumkan TERAKHIR, release: semua tulisan di atas terlihat
    // audio thread sesudah acquire di installPendingKernel().
    mPendingSlot.store(stagingSlot, std::memory_order_release);
    return true;
}

// =====================================================
// INSTALL PENDING KERNEL
// =====================================================

bool UniformPartitionedConvolver::installPendingKernel() {

    const int pending = mPendingSlot.exchange(
        -1,
        std::memory_order_acq_rel
    );
    if (pending < 0) {
        return false;
    }

    mActiveSlot = pending;
    if (!mStagedFdl.empty()) {
        mFdl = std::move(mStagedFdl);
    }

    // State kernel lama tidak berlaku untuk kernel baru: tail
    // overlap-add + FDL + penghitung blok dibersihkan. FIFO
    // input/output SENGAJA dipertahankan (lihat header): tidak ada
    // sampel yang hilang saat swap.
    std::fill(mTail.begin(), mTail.end(), 0.0f);
    for (auto& entry : mFdl) {
        std::fill(
            entry.begin(),
            entry.end(),
            Complex(0.0f, 0.0f)
        );
    }
    mBlockCounter = 0;

    mReady = true;
    ++mKernelGeneration;
    return true;
}

// =====================================================
// PREPARE
// =====================================================

void UniformPartitionedConvolver::prepare(
    int sampleRate
) {

    mSampleRate = sampleRate > 0 ? sampleRate : 48000;

    if (mBlockIn.size() != static_cast<size_t>(kFftSize)) {
        mBlockIn.assign(kFftSize, 0.0f);
        mBlockSpec.assign(kFftSize, Complex(0.0f, 0.0f));
        mAccumSpec.assign(kFftSize, Complex(0.0f, 0.0f));
        mBlockOut.assign(kFftSize, 0.0f);
    }
    if (mTail.size() != static_cast<size_t>(kBlockSize)) {
        mTail.assign(kBlockSize, 0.0f);
    }
    if (mInBuf.size() != static_cast<size_t>(kFifoCapacity)) {
        mInBuf.assign(kFifoCapacity, 0.0f);
        mOutBuf.assign(kFifoCapacity, 0.0f);
    }

    // Kernel yang di-stage sebelum prepare() pertama (mis. IR
    // dimuat sebelum engine start) dipasang di sini.
    installPendingKernel();

    // FDL sebesar partisi aktif (bila belum ada — mis. jalur
    // setKernel yang memanggil prepare() sebelum FDL dialokasikan).
    const int partitions = mNumPartitions[mActiveSlot];
    if (
        partitions > 0 &&
        mFdl.size() != static_cast<size_t>(partitions)
    ) {
        mFdl.assign(
            static_cast<size_t>(partitions),
            std::vector<Complex>(
                static_cast<size_t>(kFftSize),
                Complex(0.0f, 0.0f)
            )
        );
    }

    reset();
}

// =====================================================
// RESET
// =====================================================

void UniformPartitionedConvolver::reset() {

    std::fill(mTail.begin(), mTail.end(), 0.0f);
    mInCount = 0;
    mBlockCounter = 0;

    for (auto& entry : mFdl) {
        std::fill(
            entry.begin(),
            entry.end(),
            Complex(0.0f, 0.0f)
        );
    }

    // Prime: satu blok nol di FIFO output = latensi tetap satu blok.
    // Tanpa ini, panggilan process() pertama dengan frames bukan
    // kelipatan blok akan kehabisan output dan harus zero-pad darurat.
    mOutCount = 0;
    if (!mOutBuf.empty()) {
        std::fill(
            mOutBuf.begin(),
            mOutBuf.begin() + kBlockSize,
            0.0f
        );
        mOutCount = kBlockSize;
    }
}

void UniformPartitionedConvolver::processBlock() {

    // 1) Blok input + zero-pad.
    std::copy(
        mInBuf.begin(),
        mInBuf.begin() + kBlockSize,
        mBlockIn.begin()
    );
    std::fill(
        mBlockIn.begin() + kBlockSize,
        mBlockIn.end(),
        0.0f
    );

    // Geser sisa FIFO input ke depan.
    const int remaining = mInCount - kBlockSize;
    if (remaining > 0) {
        std::memmove(
            mInBuf.data(),
            mInBuf.data() + kBlockSize,
            static_cast<size_t>(remaining) * sizeof(float)
        );
    }
    mInCount = remaining;

    // 2) FFT maju.
    mFft.forward(mBlockIn.data(), mBlockSpec.data());

    // 3) FDL: simpan spektrum blok ini, lalu jumlahkan tiap partisi
    //    dengan spektrum blok input yang tertunda tepat sejauh
    //    partisi itu. P=1: satu suku — identik dengan v1.
    const int partitions = mNumPartitions[mActiveSlot];
    const auto& spectra = mKernelSpectra[mActiveSlot];

    std::copy(
        mBlockSpec.begin(),
        mBlockSpec.end(),
        mFdl[static_cast<size_t>(mBlockCounter % partitions)].begin()
    );

    std::fill(
        mAccumSpec.begin(),
        mAccumSpec.end(),
        Complex(0.0f, 0.0f)
    );
    for (int p = 0; p < partitions; ++p) {
        int idx = (mBlockCounter - p) % partitions;
        if (idx < 0) {
            idx += partitions;
        }
        const auto& fdlEntry =
            mFdl[static_cast<size_t>(idx)];
        const auto& kern =
            spectra[static_cast<size_t>(p)];
        for (int i = 0; i < kFftSize; ++i) {
            mAccumSpec[static_cast<size_t>(i)] +=
                fdlEntry[static_cast<size_t>(i)] *
                kern[static_cast<size_t>(i)];
        }
    }
    ++mBlockCounter;

    // 4) FFT balik (sudah dibagi n di dalam inverse()).
    mFft.inverse(mAccumSpec.data(), mBlockOut.data());

    // 5) Overlap-add: paruh pertama + tail -> FIFO output;
    //    paruh kedua -> tail baru.
    for (int i = 0; i < kBlockSize; ++i) {
        mOutBuf[mOutCount + i] = mBlockOut[i] + mTail[i];
        mTail[i] = mBlockOut[kBlockSize + i];
    }
    mOutCount += kBlockSize;
}

void UniformPartitionedConvolver::process(
    const float* input,
    float* output,
    int frames
) {

    if (!input || !output || frames <= 0) {
        return;
    }

    // Pasang kernel yang diumumkan setKernelPartitioned — HARUS
    // sebelum cek mReady: IR pertama yang dimuat saat engine sudah
    // jalan tidak akan pernah terpasang bila cek ini mendahului.
    // Swap hanya membersihkan tail + FDL (FIFO dipertahankan —
    // lihat installPendingKernel), jadi tidak ada sampel hilang.
    installPendingKernel();

    // Belum ada kernel: passthrough (jangan membisukan audio karena
    // salah konfigurasi — HRTFNode yang bertugas tidak mengaktifkan
    // node bila kernel belum dimuat).
    if (!mReady) {
        std::copy(input, input + frames, output);
        return;
    }

    // 1) Append input per chunk, proses blok penuh yang tersedia,
    //    lalu drain sebanyak chunk itu dari FIFO output — interleaved,
    //    BUKAN append-semua-dulu-drain-belakangan: satu panggilan
    //    process() dengan frames besar (mis. 48000 sekaligus di host
    //    test) akan membuat FIFO output tumbuh sampai 256 + frames
    //    dan meluber dari kapasitasnya. Dengan drain per chunk,
    //    mOutCount tetap <= 256 + 1024 dan mInCount <= 256 + 1024.
    //
    // Invarian per chunk (sama seperti invarian per panggilan di
    // header): sebelum drain chunk ke-c, mOutCount >= chunk, jadi
    // tiap chunk mengeluarkan tepat `chunk` sampel dan total drain
    // = frames. Urutan FIFO terjaga: sampel keluar sesuai urutan
    // diproduksi.
    int outPos = 0;
    int remaining = frames;
    while (remaining > 0) {
        const int chunk = std::min(remaining, kAppendChunk);
        std::copy(
            input + (frames - remaining),
            input + (frames - remaining) + chunk,
            mInBuf.begin() + mInCount
        );
        mInCount += chunk;
        remaining -= chunk;

        while (mInCount >= kBlockSize) {
            processBlock();
        }

        const int toDrain = std::min(chunk, mOutCount);
        std::copy(
            mOutBuf.begin(),
            mOutBuf.begin() + toDrain,
            output + outPos
        );
        outPos += toDrain;

        const int outRemaining = mOutCount - toDrain;
        if (outRemaining > 0) {
            std::memmove(
                mOutBuf.data(),
                mOutBuf.data() + toDrain,
                static_cast<size_t>(outRemaining) * sizeof(float)
            );
        }
        mOutCount = outRemaining;
    }

    // Pengaman bila invarian di atas dilanggar (bug): jangan sampai
    // output kurang dari frames — isi sisanya dengan nol.
    if (outPos < frames) {
        std::fill(output + outPos, output + frames, 0.0f);
    }
}

} // namespace pristine
