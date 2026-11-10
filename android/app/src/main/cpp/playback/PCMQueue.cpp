#include "PCMQueue.h"

#include <algorithm>
#include <cstring>

namespace pristine::playback {

// =====================================================
// CONSTRUCTOR
// =====================================================

// 🔥 FIX (2026-11-10, p-m18): kapasitas DIBULATKAN ke power of two
// berikutnya kalau caller memberi bukan power of two. Sebelumnya ctor
// memakai nilai apa adanya dan mask_ = capacity - 1 — kalau capacity
// bukan power of two, indexMask() salah dan read/write mendarat di slot
// yang salah (korupsi senyap). Satu-satunya pemanggil saat ini memberi
// 1<<21 (sudah power of two), jadi ini pertahanan, bukan perbaikan bug
// yang sedang terjadi.
static size_t roundUpPowerOfTwo(size_t v) noexcept {
    size_t p = 1;
    while (p < v) p <<= 1;
    return p;
}

PCMQueue::PCMQueue(size_t capacitySamples)
    : buffer_(roundUpPowerOfTwo(capacitySamples))
    , capacity_(roundUpPowerOfTwo(capacitySamples))
    , mask_(roundUpPowerOfTwo(capacitySamples) - 1) {}

// =====================================================
// FAST INDEX MASK (NO MODULO)
// =====================================================

inline size_t PCMQueue::indexMask(size_t v) const noexcept {
    return v & mask_;
}

// =====================================================
// WRITE (COPY PATH)
// =====================================================

size_t PCMQueue::write(const float* input, size_t frames) {

    if (!input || frames == 0) return 0;

    // 🔥 FIX (2026-11-10, p-m18): epoch guard lawan clear().
    //
    // Race lama: write() menghitung w/free lalu memcpy, sementara clear()
    // dari thread lain menyetel readCount_ = writeCount_ (lama). Kalau
    // clear() mendarat di tengah memcpy, store writeCount_ = w + toWrite
    // di akhir write() menghidupkan lagi sample yang baru saja di-clear —
    // audio track LAMA muncul di awal track BARU.
    //
    // Sekarang: tangkap epoch di awal; clear() menaikkan epoch SEBELUM
    // me-reset readCount_. Kalau epoch berubah sebelum publish, buang
    // tulisan ini (data sudah tersalin ke buffer tapi tidak dipublish —
    // slot itu akan ditimpa write berikutnya, tidak pernah terbaca).
    // Sisa jendela: clear() yang mendarat tepat di antara pengecekan epoch
    // dan store di bawah (1-2 instruksi) — diterima; sebelumnya jendela
    // itu seluruh memcpy (puluhan mikrodetik).
    const uint64_t epoch = epoch_.load(std::memory_order_acquire);

    const uint64_t w = writeCount_.load(std::memory_order_relaxed);
    const uint64_t r = readCount_.load(std::memory_order_acquire);

    // safeDiff: 0 kalau r > w. Tanpa ini, `capacity_ - (w - r)` underflow
    // dan write() menulis jauh melebihi kapasitas (lihat komentar di header).
    const size_t used = safeDiff(w, r);
    const size_t free = (used < capacity_) ? (capacity_ - used) : 0u;
    const size_t toWrite = std::min(frames, free);

    if (toWrite == 0) return 0;   // queue penuh: buang, jangan tulis liar

    // Salin dalam dua segmen supaya tidak perlu indexMask per elemen.
    const size_t start = indexMask(static_cast<size_t>(w));
    const size_t first = std::min(toWrite, capacity_ - start);
    std::memcpy(&buffer_[start], input, first * sizeof(float));
    if (toWrite > first) {
        std::memcpy(&buffer_[0], input + first, (toWrite - first) * sizeof(float));
    }

    if (epoch_.load(std::memory_order_acquire) != epoch) {
        return 0;  // clear() terjadi selama copy — jangan publish
    }
    writeCount_.store(w + toWrite, std::memory_order_release);
    return toWrite;
}

// =====================================================
// READ (COPY PATH)
// =====================================================

size_t PCMQueue::read(float* output, size_t frames) {

    if (!output || frames == 0) return 0;

    const uint64_t r = readCount_.load(std::memory_order_relaxed);
    const uint64_t w = writeCount_.load(std::memory_order_acquire);

    const size_t available = safeDiff(w, r);
    const size_t toRead = std::min(frames, available);

    if (toRead == 0) return 0;

    const size_t start = indexMask(static_cast<size_t>(r));
    const size_t first = std::min(toRead, capacity_ - start);
    std::memcpy(output, &buffer_[start], first * sizeof(float));
    if (toRead > first) {
        std::memcpy(output + first, &buffer_[0], (toRead - first) * sizeof(float));
    }

    readCount_.store(r + toRead, std::memory_order_release);
    return toRead;
}

// =====================================================
// CLEAR
// =====================================================
//
// SATU operasi, bukan dua.
//
// Versi lama menulis writeIndex_ lalu readIndex_ secara terpisah. Thread audio
// bisa membaca di antara keduanya dan mendapat pasangan (w, r) yang tidak
// konsisten, yang lalu membuat available/free underflow.
//
// Dengan satu counter monotonik, "kosong" didefinisikan sebagai
// readCount_ == writeCount_. Menyamakan keduanya cukup dengan SATU store,
// jadi tidak ada jendela race sama sekali.
void PCMQueue::clear() noexcept {
    // 🔥 FIX (2026-11-10, p-m18): naikkan epoch DULU, baru reset read.
    // Urutan ini penting: write() yang sudah menangkap epoch lama akan
    // melihat perubahan di pengecekan sebelum publish dan membuang
    // tulisannya (lihat write()). Write yang mulai SETELAH bump ini
    // menangkap epoch baru dan berjalan normal.
    epoch_.fetch_add(1, std::memory_order_acq_rel);
    // Baca nilai write terkini, lalu set read = write. Satu store atomic.
    // Setelah ini available == 0 dan free == capacity_.
    const uint64_t w = writeCount_.load(std::memory_order_acquire);
    readCount_.store(w, std::memory_order_release);
}

// =====================================================
// QUERIES
// =====================================================

size_t PCMQueue::availableSamples() const noexcept {
    const uint64_t w = writeCount_.load(std::memory_order_acquire);
    const uint64_t r = readCount_.load(std::memory_order_acquire);
    return safeDiff(w, r);
}

size_t PCMQueue::freeSamples() const noexcept {
    const size_t used = availableSamples();
    return (used < capacity_) ? (capacity_ - used) : 0u;
}

size_t PCMQueue::capacitySamples() const noexcept {
    return capacity_;
}

} // namespace pristine::playback
