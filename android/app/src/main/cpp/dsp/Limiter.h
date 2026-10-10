#pragma once

#include <cmath>

#include "../core/AudioConstants.h"

namespace pristine {

// =====================================================
// LIMITER
// =====================================================
//
// 🔥 FIX (2026-10-10, "noise di beberapa file"): fungsi lama,
//
//     softClip(x) = x / (1 + |x|)
//
// diterapkan ke SETIAP sample tanpa syarat. Itu bukan limiter — itu kompresi
// nonlinear di seluruh rentang:
//
//     amplitudo 0.10 -> gain -0.83 dB, THD 1.62%
//     amplitudo 0.30 -> gain -2.28 dB, THD 4.39%
//     amplitudo 0.50 -> gain -3.52 dB, THD 6.68%
//     amplitudo 0.90 -> gain -5.58 dB, THD 10.30%
//
// Full scale kehilangan -6.02 dB (setengah amplitudo), dan sinyal biasa sudah
// terdistorsi harmonisa orde ganjil. Didengar sebagai "beberapa file noise" —
// paling parah di master yang dikompresi keras.
//
// Sekarang: identity di bawah threshold, baru membentuk di atasnya.
//   |x| <= threshold : y = x                        (bit-exact, nol distorsi)
//   |x| >  threshold : y = sign(x) * (t + (a-t)/(1 + (a-t)/(1-t)))
//
// Bentuk di atas threshold tetap kontinu dan terdiferensiasi (turunan 1 di
// titik sambung), monoton, dan asimtotik ke 1.0 — tidak seperti hard clip yang
// memotong dan menghasilkan harmonisa orde tinggi tak terbatas.
//
// Untuk jalur BitPerfect, kelas ini TIDAK dipakai: lihat sanitize() di bawah.
class Limiter {
public:

    // Threshold di mana pembentukan mulai. 1.0 = tidak pernah membentuk untuk
    // sinyal legal (output swr_convert selalu di [-1,1]); 0.98 memberi sedikit
    // headroom sebelum hard limit di 1.0.
    static constexpr float kThreshold = kLimiterThreshold;

    // =============================================
    // LIMITER (untuk mode DSP / Immersive)
    // =============================================

    static inline float apply(
        float x
    ) noexcept {

        const float a = fabsf(x);

        // Identity di bawah threshold — nol distorsi, bit-exact.
        if (a <= kThreshold) {
            return x;
        }

        const float over = a - kThreshold;      // > 0
        const float range = 1.0f - kThreshold;  // 0.02

        // Kompresi rasional: kontinu di a = kThreshold (y = kThreshold),
        // turunan 1 di sana, asimtot 1.0.
        const float y = kThreshold + over / (1.0f + over / range);

        return (x < 0.0f) ? -y : y;
    }

    // Nama lama dipertahankan supaya pemanggil yang ada tetap kompilasi.
    // PERILAKUNYA SUDAH BERUBAH — lihat catatan di atas.
    static inline float softClip(
        float x
    ) noexcept {

        return apply(x);
    }

    void prepare(int sampleRate) noexcept {
        (void)sampleRate;
        // Stateless — nothing to prepare.
    }

    void reset() noexcept {
        // Stateless — nothing to reset.
    }

    static inline void process(
        float* left,
        float* right,
        int count
    ) noexcept {

        for (int i = 0; i < count; ++i) {

            left[i] =
                apply(left[i]);

            right[i] =
                apply(right[i]);
        }
    }
};

// =====================================================
// SANITIZE (untuk jalur BitPerfect)
// =====================================================
//
// BitPerfect berarti NOL pemrosesan: tidak ada limiter, tidak ada kompresi,
// tidak ada gain. Yang tersisa hanya penjagaan terhadap nilai yang secara
// fisik mustahil — bukan bagian dari sinyal musik.
//
// Yang dibuang:
//   - NaN / Inf  : dari pembagian nol atau pointer race
//   - |x| > 2.0  : bit pattern malloc garbage. swr_convert selalu menghasilkan
//                  [-1,1], jadi nilai 1e18-1e32 adalah float VALID yang lolos
//                  isnan()/isinf() dan langsung ke DAC sebagai glitch sangat
//                  keras. Ditemukan 13.733 sample seperti ini di trek FLAC
//                  96kHz (lihat wiki/root-causes/audio-96khz-cacat.md).
//   - denormal   : di-flush ke nol. Hanya di bawah 1e-30, jadi tidak ada
//                  sinyal musik yang tersentuh.
//
// Yang TIDAK dilakukan: clamp, kompresi, gain, atau apa pun yang mengubah
// bentuk gelombang. Nilai [-2,2] lewat utuh, termasuk yang melewati 1.0 —
// kalau file memang overload, itu yang direkam, dan itu yang dikirim ke DAC.
inline bool sanitizeInline(float& x) noexcept {

    if (std::isnan(x) || std::isinf(x)) {
        x = 0.0f;
        return true;
    }

    const float a = fabsf(x);

    if (a > 2.0f) {
        x = 0.0f;
        return true;
    }

    if (a < kDenormalThreshold) {
        x = 0.0f;
    }

    return false;
}

} // namespace pristine
