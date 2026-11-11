// =====================================================
// visualizer/VisualizerBuffer.cpp
// =====================================================

#include "VisualizerBuffer.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

VisualizerBuffer::VisualizerBuffer() {

    memset(mBufferA, 0, sizeof(mBufferA));
}

// =====================================================
// WRITE (audio thread)
// =====================================================

void VisualizerBuffer::write(
    const float* left,
    const float* right,
    int32_t frames
) {

    // 🔥 KOREKSI (2026-11-11, V-m4): satu buffer saja. Dulu ada mBufferB +
    // mWriteBuffer (desain double-buffer), tapi mWriteBuffer tidak pernah
    // di-flip (0 store di repo) — penulis selalu ke mBufferA sementara
    // pembaca lama selalu dari mBufferB yang isinya nol (B3, 2026-11-10).
    // Buffer B 8 KB tak pernah dibaca maupun ditulis; hapus saja.
    float* dst = mBufferA;

    uint32_t pos =
        mWritePos.load(
            std::memory_order_relaxed
        );

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        dst[
            (pos + i) & kMask
        ] =
            (
                left[i] +
                right[i]
            ) * 0.5f;
    }

    mWritePos.store(
        pos + frames,
        std::memory_order_release
    );
}

// =====================================================
// READ (ui thread)
// =====================================================

void VisualizerBuffer::read(
    float* dst,
    int32_t size
) const {

    // Baca dari buffer yang SAMA dengan yang ditulis (mBufferA).
    //
    // KOREKSI 2026-11-10 (B3): sebelumnya read() mengambil buffer
    // KEBALIKAN ("anti-tearing", commit 9848ed0d). Itu salah: mWriteBuffer
    // tidak pernah di-flip, jadi penulis selalu ke mBufferA sementara
    // pembaca selalu dari mBufferB yang isinya nol — read() selalu nol.
    // 2026-11-11 (V-m4): mBufferB + mWriteBuffer dihapus; satu buffer.
    //
    // Membaca buffer yang sama aman di sini: read() mengambil snapshot
    // mWritePos sekali (acquire) lalu menyalin jendela [pos-size, pos).
    // Penulis hanya menulis DI DEPAN jendela itu (posisi >= pos), jadi
    // tidak ada sample yang ditimpa saat sedang dibaca — kecuali pembacaan
    // lebih lambat dari satu putaran ring (2048 sample, ~43 ms @ 48 kHz):
    // tearing lap-around TERBUKTI nyata tapi jarang (0,004% di stress
    // test, ~1 frame robek per 21 menit di polling 20/s — V-m2, minor).
    //
    // Jangan kembalikan logika "buffer kebalikan" — dan flip per panggilan
    // write() JUGA salah: chunk yang berurutan akan tersebar selang-seling
    // ke dua buffer, jadi satu buffer tidak pernah berisi 2048 sample
    // terakhir yang utuh. (Koreksi atas rekomendasi P0 di
    // AUDIT_2026-11-10.md — rekomendasi itu salah, lihat
    // test_visualizer_buffer.cpp.)
    const float* src = mBufferA;

    const uint32_t pos =
        mWritePos.load(
            std::memory_order_acquire
        );

    for (
        int32_t i = 0;
        i < size;
        ++i
    ) {

        dst[i] =
            src[
                (pos - size + i)
                & kMask
            ];
    }
}

}