// =====================================================
// dsp/convolution/UniformPartitionedConvolver.cpp
// =====================================================
//
// Konvolver partitioned seragam, satu partisi, blok 256 / FFT 512,
// di atas FFTPlan. Lihat header untuk kontrak lengkap.
//
// Algoritme per blok (overlap-add):
//   1. Ambil 256 sampel dari FIFO input, zero-pad ke 512.
//   2. FFT maju -> kalikan dengan spektrum kernel -> FFT balik.
//   3. 256 sampel pertama + tail blok sebelumnya = output blok;
//      256 sampel kedua disimpan sebagai tail baru.
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

bool UniformPartitionedConvolver::setKernel(
    const float* kernel,
    int length
) {

    if (
        !kernel ||
        length <= 0 ||
        length > kMaxKernelLength ||
        !allFinite(kernel, length)
    ) {
        return false;
    }

    // Spektrum kernel: zero-pad ke 512 lalu FFT maju sekali.
    // mBlockIn dialokasikan di sini juga supaya setKernel sebelum
    // prepare() tetap aman (prepare() hanya me-reset state).
    if (mBlockIn.size() != static_cast<size_t>(kFftSize)) {
        mBlockIn.assign(kFftSize, 0.0f);
        mBlockSpec.assign(kFftSize, Complex(0.0f, 0.0f));
        mBlockOut.assign(kFftSize, 0.0f);
    }

    std::fill(mBlockIn.begin(), mBlockIn.end(), 0.0f);
    std::copy(kernel, kernel + length, mBlockIn.begin());

    if (mKernelSpectrum.size() != static_cast<size_t>(kFftSize)) {
        mKernelSpectrum.assign(kFftSize, Complex(0.0f, 0.0f));
    }
    mFft.forward(mBlockIn.data(), mKernelSpectrum.data());

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

void UniformPartitionedConvolver::prepare(
    int sampleRate
) {

    mSampleRate = sampleRate > 0 ? sampleRate : 48000;

    if (mBlockIn.size() != static_cast<size_t>(kFftSize)) {
        mBlockIn.assign(kFftSize, 0.0f);
        mBlockSpec.assign(kFftSize, Complex(0.0f, 0.0f));
        mBlockOut.assign(kFftSize, 0.0f);
    }
    if (mKernelSpectrum.size() != static_cast<size_t>(kFftSize)) {
        mKernelSpectrum.assign(kFftSize, Complex(0.0f, 0.0f));
    }
    if (mTail.size() != static_cast<size_t>(kBlockSize)) {
        mTail.assign(kBlockSize, 0.0f);
    }
    if (mInBuf.size() != static_cast<size_t>(kFifoCapacity)) {
        mInBuf.assign(kFifoCapacity, 0.0f);
        mOutBuf.assign(kFifoCapacity, 0.0f);
    }

    reset();
}

void UniformPartitionedConvolver::reset() {

    std::fill(mTail.begin(), mTail.end(), 0.0f);
    mInCount = 0;

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

    // 3) Kali spektrum kernel.
    for (int i = 0; i < kFftSize; ++i) {
        mBlockSpec[i] *= mKernelSpectrum[i];
    }

    // 4) FFT balik (sudah dibagi n di dalam inverse()).
    mFft.inverse(mBlockSpec.data(), mBlockOut.data());

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
