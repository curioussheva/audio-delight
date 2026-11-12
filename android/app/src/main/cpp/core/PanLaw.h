// =====================================================
// core/PanLaw.h
// =====================================================
//
// SATU hukum pan untuk seluruh engine (C-PAN, 2026-11-12).
//
// Sebelum fix ini ada DUA hukum pan yang berbeda:
//   - GainNode::applyConfig (mode DSP, lewat DSPChain) dan
//     OutputStage::setBalance: LINEAR — tengah (1,0 / 1,0), 0 dB.
//   - AudioPipeline::processImmersive: CONSTANT-POWER cos/sin —
//     tengah (0,7071 / 0,7071), -3,01 dB.
//
// Akibatnya slider balance berperilaku beda per mode, dan pindah mode
// DSP -> Immersive di balance 0 terdengar sebagai lompatan volume
// -3 dB tanpa user menyentuh apa pun.
//
// KEPUTUSAN: hukum LINEAR (GainNode) yang dipakai di mana-mana.
// Alasan:
//   1. Sudah dipakai 2 dari 3 pemakai hukum pan — mode DSP adalah
//      referensi yang hidup; Immersive yang menyimpang.
//   2. Linear menjaga gain tengah = 1,0 di SEMUA mode, jadi tidak ada
//      lompatan level saat ganti mode.
//   3. Usulan opini (cosine taper) DITOLAK sebagai penyatu: rumus itu
//      BUKAN hukum GainNode (linear) — "samakan dengan GainNode" dan
//      kode usulan tersebut bertentangan. Memilih taper berarti
//      menambah hukum KETIGA, bukan menyatukan. Constant-power memang
//      menjaga persepsi kekerasan saat menggeser balance, tapi itu
//      bukan alasan cukup untuk memecah hukum antar mode.
//   Bila suatu hari constant-power memang diinginkan, putuskan DI SINI
//   — ganti ISI helper ini, jangan tambah rumus kedua di call site.
//   Satu hukum, satu helper.
//
// CATATAN LEVEL: fix ini TIDAK mengubah level keseluruhan di luar
// hukum pan (tanpa kompensasi gain). Yang berubah hanya mode
// Immersive: tengah naik dari 0,7071 ke 1,0 (+3,01 dB) — itu ISI
// perbaikannya (menghapus atenuasi tengah yang tidak disengaja),
// bukan kompensasi terpisah. Mode DSP tidak berubah sama sekali
// (GainNode sudah linear).
//
// Kontrak input: balance diasumsikan sudah tervalidasi di
// AudioState::setBalance (clampFinite ke [-1, 1], C-P2). Helper tetap
// meng-clamp defensif; nilai non-finite di luar kontrak merambat
// seperti sebelumnya (bukan urusan helper ini).

#pragma once

namespace pristine {

// Hasil hukum pan: pengali per kanal, TANPA master gain — pemanggil
// mengalikannya sendiri dengan master gain, seperti sebelumnya.
struct PanGains {
    float left = 1.0f;
    float right = 1.0f;
};

// Hukum pan LINEAR (balance law):
//   balance = -1  -> kiri penuh  (1, 0)
//   balance =  0  -> tengah      (1, 1)
//   balance = +1  -> kanan penuh (0, 1)
// Kanal yang berlawanan arah tidak disentuh; kanal searah dilemahkan
// linear menuju 0. Header-only + noexcept: aman dipanggil tiap buffer
// di audio thread (tanpa alokasi, tanpa trig).
inline PanGains panLawLinear(
    float balance
) noexcept {

    const float bal =
        balance < -1.0f
            ? -1.0f
            : (balance > 1.0f ? 1.0f : balance);

    PanGains gains;
    gains.left = bal <= 0.0f ? 1.0f : 1.0f - bal;
    gains.right = bal >= 0.0f ? 1.0f : 1.0f + bal;
    return gains;
}

} // namespace pristine
