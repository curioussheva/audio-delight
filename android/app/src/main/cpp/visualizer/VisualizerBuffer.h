// =====================================================
// visualizer/VisualizerBuffer.h
// =====================================================

#pragma once

#include <atomic>
#include <cstdint>
#include <cstring>

namespace pristine {

class VisualizerBuffer {
public:

    // B17-V1 (2026-11-15): ring 4096, jendela baca 2048. Dulu kSize =
    // 2048 = jendela baca, jadi penulis (chunk audio thread ≤1920 frame)
    // bisa menimpa awal jendela yang sedang dibaca UI thread (tear
    // V-m2, 0,004% di stress test). Sekarang jendela baca hanya separuh
    // ring: penulis harus menulis 2048 sample penuh (~43 ms @ 48 kHz)
    // sebelum mencapai awal jendela. Jendela FFT Kotlin/JNI tetap 2048
    // (kReadSize) — TIDAK 8192 (keputusan desain: +~170 ms latensi).
    static constexpr uint32_t kSize = 4096;
    static constexpr uint32_t kReadSize = 2048;
    static constexpr uint32_t kMask = kSize - 1;

    VisualizerBuffer();

    // audio thread / stop path — kosongkan ring + reset posisi tulis.
    // Hanya dipanggil saat audio thread SUDAH tidak menulis
    // (AudioEngine::stop() sesudah stream ditutup): kalau write()
    // sedang berjalan bersamaan, store pos+frames-nya sesudah clear()
    // bisa menghidupkan lagi posisi lama. Sesudah stream close Oboe
    // menjamin tidak ada lagi onAudioReady, jadi ini aman di sana.
    // Zero dulu, baru store mWritePos = 0 (release): pembaca yang
    // mengambil pos sesudah store membaca nol semua.
    void clear() noexcept;

    // audio thread
    void write(
        const float* left,
        const float* right,
        int32_t frames
    );

    // audio thread — varian sadar-stride untuk buffer interleaved
    // (L,R,L,R,...). Dipakai jalur shortcut BitPerfect di
    // AudioCallback::applyPipeline, yang tidak lagi men-deinterleave
    // ke mLeft/mRight. Mixdown + sanitasi SAMA PERSIS dengan write()
    // (lihat mixdownSanitized di .cpp) — bukan jalur kedua yang bisa drift.
    void writeInterleaved(
        const float* interleaved,
        int32_t frames
    );

    // ui thread
    void read(
        float* dst,
        int32_t size
    ) const;

private:

    alignas(16) float mBufferA[kSize];

    std::atomic<uint32_t> mWritePos{0};
};

} 