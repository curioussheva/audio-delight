// =====================================================
// visualizer/VisualizerBuffer.cpp
// =====================================================

#include "VisualizerBuffer.h"

#include <cmath>

namespace pristine {

// Mixdown stereo → mono: rata-rata L+R (V-m3 — dulu magic 0.5f).
constexpr float kVisualizerMixdownScale = 0.5f;

// =====================================================
// CONSTRUCTOR
// =====================================================

VisualizerBuffer::VisualizerBuffer() {

    memset(mBufferA, 0, sizeof(mBufferA));
}

// =====================================================
// WRITE (audio thread)
// =====================================================

// Mixdown stereo -> mono + sanitasi (V-M1), SATU implementasi untuk
// write() dan writeInterleaved() (C-CLEAN(e)): NaN/Inf/|x|>2 -> 0,
// supaya nilai liar tidak lolos ke FFT dan JS. Denormal TIDAK di-nol-kan
// di sini (hanya visualizer, bukan output) — sanitizeOutput di
// AudioCallback yang menanganinya untuk jalur ke speaker.
static float mixdownSanitized(
    float left,
    float right
) noexcept {

    float v =
        (
            left +
            right
        ) * kVisualizerMixdownScale;
    if (!std::isfinite(v) || std::fabs(v) > 2.0f) {
        v = 0.0f;
    }
    return v;
}

void VisualizerBuffer::write(
    const float* left,
    const float* right,
    int32_t frames
) {

    // 🔥 FIX (2026-11-11, V-M2): frames <= 0 menggerakkan mWritePos
    // MUNDUR (store(pos + frames) tanpa syarat) — write(-3) menimpa 3
    // sample yang sudah dipublikasi. Guard di sini, bukan andalkan
    // guard di AudioCallback (file lain).
    if (frames <= 0 || !left || !right) {
        return;
    }

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

        // 🔥 FIX (2026-11-11, V-M1): sanitasi di sini. AudioCallback
        // men-sanitize SALINAN lokal (l/r) untuk output, tapi mLeft/mRight
        // yang masuk ke write() tidak pernah di-update — NaN/Inf/|x|>2
        // lolos ke FFT dan JS (Kotlin mapToLogBins tidak guard NaN).
        dst[
            (pos + i) & kMask
        ] = mixdownSanitized(left[i], right[i]);
    }

    mWritePos.store(
        pos + frames,
        std::memory_order_release
    );
}

// =====================================================
// WRITE INTERLEAVED (audio thread, C-CLEAN(e))
// =====================================================

void VisualizerBuffer::writeInterleaved(
    const float* interleaved,
    int32_t frames
) {

    // Guard yang sama dengan write() (V-M2): frames <= 0 / null tidak
    // boleh menggerakkan mWritePos.
    if (frames <= 0 || !interleaved) {
        return;
    }

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
        ] = mixdownSanitized(
            interleaved[i * 2],
            interleaved[i * 2 + 1]
        );
    }

    mWritePos.store(
        pos + frames,
        std::memory_order_release
    );
}

// =====================================================
// CLEAR (stop path — B17-V1)
// =====================================================

void VisualizerBuffer::clear() noexcept {

    // Dulu tidak ada: sesudah stop, read() terus mengembalikan frame
    // terakhir dan spektrum membeku. Urutan penting: nol-kan dulu isi
    // ring, baru reset posisi (release) — pembaca yang load pos sesudah
    // store ini melihat jendela nol semua. Konsisten dengan write():
    // write() mem-publish lewat store(pos + frames, release) sesudah
    // menulis sample; di sini store(0, release) sesudah meng-nol-kan.
    // Pemanggil WAJIB memastikan audio thread tidak sedang menulis
    // (dipanggil dari AudioEngine::stop() sesudah stream ditutup).
    memset(mBufferA, 0, sizeof(mBufferA));
    mWritePos.store(
        0,
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

    // 🔥 FIX (2026-11-11, V-M2/V-m1): clamp jendela ke kReadSize (2048).
    // read(4096) mengembalikan data yang sama dua kali (index & kMask
    // selalu in-bounds, bukan OOB — tapi jendela berulang). size <= 0
    // no-op. B17-V1: clamp ke kReadSize, BUKAN kSize — ring kini 4096
    // tapi jendela baca tetap 2048 (jendela FFT Kotlin/JNI).
    if (size <= 0 || !dst) {
        return;
    }
    if (size > static_cast<int32_t>(kReadSize)) {
        size = static_cast<int32_t>(kReadSize);
    }

    // Baca dari buffer yang SAMA dengan yang ditulis (mBufferA).
    //
    // KOREKSI 2026-11-10 (B3): sebelumnya read() mengambil buffer
    // KEBALIKAN ("anti-tearing", commit 9848ed0d). Itu salah: mWriteBuffer
    // tidak pernah di-flip, jadi penulis selalu ke mBufferA sementara
    // pembaca selalu dari mBufferB yang isinya nol — read() selalu nol.
    // 2026-11-11 (V-m4): mBufferB + mWriteBuffer dihapus; satu buffer.
    //
    // Membaca buffer yang sama aman di sini: read() mengambil snapshot
    // mWritePos sekali (acquire) lalu menyalin jendela [pos-size, pos)
    // dari ring. Jendela itu BUKAN kebal dari penulis — penulis menulis
    // ke indeks (pos+i) & kMask, dan karena indeks dihitung modulo
    // kSize, penulis yang sudah menulis satu putaran ring penuh AKAN
    // sampai kembali ke awal jendela dan menimpanya selagi dibaca.
    // Yang benar: dengan ring 4096 dan jendela 2048 (B17-V1), penulis
    // harus menulis 2048 sample penuh (~43 ms @ 48 kHz) sesudah snapshot
    // pos diambil sebelum ia mencapai awal jendela — jadi tear hanya
    // terjadi kalau satu panggilan read() memakan waktu lebih dari itu
    // (atau polling UI tertinggal satu putaran). Komentar lama ("penulis
    // hanya menulis DI DEPAN jendela, posisi >= pos") salah: itu
    // mengabaikan pembungkusan modulo — posisi mentah memang naik terus,
    // tapi posisi DALAM RING membungkus dan kembali ke jendela.
    // Tear lap-around masih mungkin tapi jauh lebih jarang daripada saat
    // ring == jendela (dulu: chunk berikutnya langsung menimpa awal
    // jendela; V-m2, 0,004% di stress test).
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