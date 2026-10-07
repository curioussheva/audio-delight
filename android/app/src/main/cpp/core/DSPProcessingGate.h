#pragma once

namespace pristine {

// =====================================================
// DSP PROCESSING GATE
// =====================================================
//
// Sakelar untuk menyalakan pemrosesan DSP (AudioPipeline) di jalur produksi.
//
// KENAPA INI ADA
//
// Sampai 2026-10-07, `AudioPipeline::process()` - tempat ketiga mode
// (BitPerfect/DSP/Immersive) hidup - TIDAK PERNAH dipanggil di jalur produksi:
// `AudioCallback::onAudioReady()` memanggil `PlaybackController::render()` lalu
// `return` sebelum sempat memproses. Akibatnya mode DSP tidak melakukan apa pun
// dan bit-perfect hanya benar secara kebetulan.
//
// Menyambungkannya berarti `DSPChain` mulai benar-benar mengeksekusi PCM di
// jalur produksi - sesuatu yang belum pernah terjadi. Kalau ada bug di DSP,
// bug itu baru muncul sekarang. Karena itu penyambungan ini di belakang sakelar
// yang bisa dimatikan TANPA revert kode: matikan di satu tempat, perilaku
// kembali seperti sebelum perubahan.
//
// DEFAULT: false (perilaku lama). Dinyalakan setelah diuji di perangkat.
//
// Cara menyalakan:
//   - `setDSPProcessingEnabled(true)` dari native, atau
//   - `-DPRISTINE_DSP_IN_PRODUCTION=1` saat build (lihat CMakeLists.txt)
//
// Lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.

class DSPProcessingGate {
public:

    // true kalau AudioPipeline boleh memproses PCM di jalur produksi.
    //
    // Dibaca dari audio callback, jadi harus bebas lock dan bebas alokasi -
    // karena itu hanya satu atomic load.
    static bool enabled() noexcept;

    // Nyalakan/matikan. Aman dipanggil dari thread mana pun, termasuk saat
    // audio sedang berjalan: efeknya berlaku pada frame berikutnya.
    //
    // Mematikan saat mode Immersive/DSP aktif berarti efek berhenti di tengah
    // pemutaran tanpa jeda - itu disengaja, dan itulah yang membuat sakelar ini
    // berguna untuk membandingkan "dengan DSP" vs "tanpa DSP" secara langsung.
    static void setEnabled(bool enabled) noexcept;

    // Bawaan yang dipilih saat build (dari PRISTINE_DSP_IN_PRODUCTION).
    static bool buildDefault() noexcept;
};

} // namespace pristine
