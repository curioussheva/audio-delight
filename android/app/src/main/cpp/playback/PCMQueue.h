#pragma once

#include <vector>
#include <atomic>
#include <cstddef>

namespace pristine::playback {

// =====================================================
// REALTIME PCM FIFO (SPSC lock-free)
// =====================================================
//
// SATU KANAL ATOMIC, BUKAN DUA.
//
// Versi lama memakai pasangan (writeIndex_, readIndex_) yang masing-masing
// 64-bit dan menghitung selisihnya:
//
//     available = w - r
//     free      = capacity_ - (w - r)
//
// Dengan aritmetika unsigned, begitu `r > w` kedua rumus itu UNDERFLOW dan
// menghasilkan angka raksasa:
//
//     capacity_ = 524288, w = 10, r = 524298  ->  free = 1048576
//
// Akibatnya `write()` menulis jauh lebih banyak daripada kapasitas dan
// `read()` membaca slot yang belum pernah ditulis. Gejalanya di device:
// sampel rusak bernilai 6.6e35 dan ratusan NaN per detik, tepat saat ganti
// track (logcat 2026-10-05 17:51 pada file 96 kHz).
//
// Penyebab `r > w` adalah `clear()` yang menulis dua atomic SECARA
// TERPISAH sementara thread audio sedang membaca keduanya:
//
//     writeIndex_.store(0);   // <- audio thread baca w = 0 di sini
//     readIndex_.store(0);    // <- ...lalu baca r = nilai LAMA
//
// Jendela di antara dua store itu membuat pasangan (w, r) tidak konsisten.
//
// Perbaikan: SATU atomic `writeCount_` / `readCount_` monotonik 64-bit tanpa
// pembungkusan di level indeks. Selisih dua counter monotonik TIDAK PERNAH
// underflow selama selisihnya < 2^63, dan clear() jadi satu operasi atomic
// sehingga tidak ada jendela race.

class PCMQueue {
public:
    // Kapasitas dibulatkan ke atas ke power of two berikutnya kalau yang
    // diberikan bukan power of two (p-m18, 2026-11-10) — mask_ butuh itu.
    explicit PCMQueue(size_t capacitySamples);

    // Producer (decoder thread). `frames` = jumlah SAMPLE (bukan frame stereo).
    // Mengembalikan jumlah sampel yang benar-benar ditulis; 0 = queue penuh
    // (atau input null/kosong). PB6-MINOR(e): kalau clear() balapan selama
    // copy, tulisan DIBUANG tanpa publish dan kembalian adalah
    // kWriteDiscardedEpoch (bukan 0) — supaya pemanggil bisa membedakannya
    // dari "queue penuh" dan tidak mencatat overrun palsu.
    size_t write(const float* input, size_t frames);

    // Sentinel kembalian write(): tulisan dibuang karena epoch berubah
    // (clear() selama copy). Nilai SIZE_MAX — tidak mungkin sebagai jumlah
    // sampel yang ditulis (kapasitas queue 2^22).
    static constexpr size_t kWriteDiscardedEpoch =
        static_cast<size_t>(-1);

    // Consumer (audio thread). `frames` = jumlah SAMPLE.
    size_t read(float* output, size_t frames);

    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): zero-copy API
    // beginWrite/commitWrite/beginRead/commitRead dihapus — 0 pemakai di
    // seluruh cpp/ (hanya write()/read() yang hidup). Menghapus API ini
    // juga menghapus p-m8 laten audit (reserve tanpa commit / commit tanpa
    // begin tidak dijaga).
    void clear() noexcept;

    // Queries (approximate, RT safe)
    size_t availableSamples() const noexcept;
    size_t freeSamples() const noexcept;
    size_t capacitySamples() const noexcept;

private:
    std::vector<float> buffer_;
    const size_t capacity_;
    const size_t mask_;

    // Counter monotonik. HANYA bertambah, tidak pernah di-reset kecuali
    // lewat clear() yang menulis SATU pasangan secara konsisten.
    // `available = writeCount_ - readCount_` selalu benar karena keduanya
    // monotonik dan selisihnya dijaga < capacity_.
    alignas(64) std::atomic<uint64_t> writeCount_{0};
    alignas(64) std::atomic<uint64_t> readCount_{0};

    // 🔥 FIX (2026-11-10, p-m18): generasi queue. clear() menaikkan epoch;
    // write() menangkap epoch di awal dan membuang publish kalau epoch
    // berubah sebelum store — supaya write yang balapan dengan clear()
    // tidak menghidupkan lagi sample yang baru di-clear. read() TIDAK
    // memakai epoch: sisi baca dilindungi clearing_ + waitForRenderIdle
    // di PlaybackController (p-m12), jadi tidak ada read yang sedang
    // berjalan saat clear().
    std::atomic<uint64_t> epoch_{0};

private:
    inline size_t indexMask(size_t v) const noexcept;

    // Hitung selisih dengan pengaman underflow. Kalau readCount_ sempat
    // melebihi writeCount_ (seharusnya tidak terjadi lagi), kembalikan 0
    // alih-alih angka raksasa.
    static inline size_t safeDiff(uint64_t a, uint64_t b) noexcept {
        return (a >= b) ? static_cast<size_t>(a - b) : 0u;
    }
};

} // namespace pristine::playback
