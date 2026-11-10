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
    memset(mBufferB, 0, sizeof(mBufferB));
}

// =====================================================
// WRITE (audio thread)
// =====================================================

void VisualizerBuffer::write(
    const float* left,
    const float* right,
    int32_t frames
) {

    const int writeBuffer =
        mWriteBuffer.load(
            std::memory_order_relaxed
        );

    float* dst =
        writeBuffer == 0
        ? mBufferA
        : mBufferB;

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

    // Baca dari buffer yang SAMA dengan yang ditulis.
    //
    // KOREKSI 2026-11-10 (B3): sebelumnya baris ini mengambil buffer
    // KEBALIKAN ("anti-tearing", commit 9848ed0d). Itu salah: mWriteBuffer
    // tidak pernah di-flip (tidak ada store() di file mana pun), jadi
    // penulis selalu ke mBufferA sementara pembaca selalu dari mBufferB —
    // yang hanya berisi nol dari konstruktor. Hasilnya read() selalu nol,
    // dan visualizer tidak pernah menerima data nyata.
    //
    // Membaca buffer yang sama aman di sini: read() mengambil snapshot
    // mWritePos sekali (acquire) lalu menyalin jendela [pos-size, pos).
    // Penulis hanya menulis DI DEPAN jendela itu (posisi >= pos), jadi tidak
    // ada sample yang ditimpa saat sedang dibaca — kecuali pembacaan lebih
    // lambat dari satu putaran ring (2048 sample, ~43 ms @ 48 kHz), yang
    // tidak terjadi untuk salinan 2048 float.
    //
    // Jangan kembalikan logika "buffer kebalikan" tanpa memperbaiki
    // flip-nya — dan flip per panggilan write() (store(mWriteBuffer ^ 1))
    // JUGA salah: chunk yang berurutan akan tersebar selang-seling ke dua
    // buffer, jadi satu buffer tidak pernah berisi 2048 sample terakhir
    // yang utuh. (Koreksi atas rekomendasi P0 di AUDIT_2026-11-10.md —
    // rekomendasi itu salah, lihat test_visualizer_buffer.cpp.)
    const int readBuffer =
        mWriteBuffer.load(
            std::memory_order_relaxed
        );

    const float* src =
        readBuffer == 0
        ? mBufferA
        : mBufferB;

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