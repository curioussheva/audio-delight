#include "SpatialFieldProcessor.h"

#include "../../core/AudioTypes.h"

#include <algorithm>
#include <cmath>

namespace pristine { namespace dsp {

SpatialFieldProcessor::SpatialFieldProcessor() = default;

void SpatialFieldProcessor::setWidth(float width) {
    // C-IMMVAL: dulu disimpan mentah — NaN membuat mCurrentWidth NaN
    // permanen (smoothing NaN - NaN = NaN, widening mati selamanya sampai
    // reset) dan +Inf mengalikan side sampai output Inf.
    // clampFinite: non-finite -> fallback 1.0 = netral (default AudioState),
    // finite di luar [0,2] -> batas terdekat.
    mWidth = clampFinite(width, 0.0f, 2.0f, 1.0f);

    // Prime cache pada pemasangan pertama supaya render pertama tidak menyapu
    // nilai dari default ke nilai sebenarnya. Tanpa ini, width 1 / depth 0
    // tidak bit-exact pada buffer pertama (terukur pada test).
    // (C-IMMVAL): prime pakai mWidth yang SUDAH di-clamp — pakai `width`
    // mentah di sini mengembalikan NaN/Inf ke mCurrentWidth dan membatalkan
    // clamp di atas (smoothing Inf + -Inf = NaN, widening mati).
    if (!mPrimed) {
        mCurrentWidth = mWidth;
    }
}

void SpatialFieldProcessor::setDepth(float depth) {
    // (B15-I3): klem seperti setWidth — NaN -> 0.0 (tanpa ruang), finite di
    // luar [0,1] -> batas terdekat. Jalur live sudah aman (depth <= 0.4 dari
    // ImmersiveStage), ini hardening API. Prime pakai mDepth yang SUDAH
    // di-clamp, seperti setWidth (C-IMMVAL): prime dari `depth` mentah
    // mengembalikan NaN ke mCurrentDepth dan membatalkan clamp di atas.
    mDepth = clampFinite(depth, 0.0f, 1.0f, 0.0f);

    if (!mPrimed) {
        mCurrentDepth = mDepth;
    }
}

// =====================================================
// PREPARE
// =====================================================

void SpatialFieldProcessor::prepare(int32_t sampleRate) {
    // (B15-I3): tap dinyatakan dalam ms terhadap referensi 48 kHz; tanpa
    // penskalaan, kedalaman ruang menciut 4x di 192 kHz (12 ms -> 3 ms).
    // Laju tidak valid: biarkan tap apa adanya (default 48 kHz / nilai
    // prepare() valid terakhir). Pemanggil (ImmersiveStage::prepare)
    // sudah menolak laju <= 0 lebih dulu, jadi ini hanya pengaman.
    if (sampleRate <= 0) {
        return;
    }

    const float scale = static_cast<float>(sampleRate) / 48000.0f;
    mTapNear = std::min(
        static_cast<int32_t>(kTapNear * scale + 0.5f), kAmbienceSize - 1);
    mTapMid = std::min(
        static_cast<int32_t>(kTapMid * scale + 0.5f), kAmbienceSize - 1);
    mTapFar = std::min(
        static_cast<int32_t>(kTapFar * scale + 0.5f), kAmbienceSize - 1);
}

// =====================================================
// PROCESS
// =====================================================
//
// Urutan: ambience dulu, baru widening.
//
// Kalau widening lebih dulu, sinyal yang sudah dilebarkan ikut masuk ke delay
// line sehingga ambience-nya melebar juga - hasilnya terdengar seperti dua
// kali pelebaran dan citra jadi tidak stabil. Ambience dulu membuat ruangnya
// netral, lalu citra keseluruhan dilebarkan sekali.
void SpatialFieldProcessor::process(
    float* left,
    float* right,
    int32_t numFrames
) {

    if (!left || !right || numFrames <= 0) {
        return;
    }

    // Smoothing satu-pole. Koefisien kecil = transisi halus, cukup untuk
    // menghilangkan zipper noise tanpa terasa lambat.
    constexpr float kSmooth = 0.002f;

    const bool widthChanging = std::fabs(mCurrentWidth - mWidth) > 1e-4f;
    const bool depthChanging = std::fabs(mCurrentDepth - mDepth) > 1e-4f;

    const bool anyAmbience = mDepth > 1e-4f || mCurrentDepth > 1e-4f;

    for (int32_t i = 0; i < numFrames; ++i) {

        mCurrentWidth += widthChanging
            ? (mWidth - mCurrentWidth) * kSmooth
            : (mWidth - mCurrentWidth);

        mCurrentDepth += depthChanging
            ? (mDepth - mCurrentDepth) * kSmooth
            : (mDepth - mCurrentDepth);

        mPrimed = true;

        const float l = left[i];
        const float r = right[i];

        // ---- 1. Ambience (silang, dua tap) -------------------------------
        //
        // L mendapat gema dari R, dan sebaliknya. Umpan SILANG inilah yang
        // menciptakan kesan ruang; umpan searah hanya terdengar seperti gema
        // biasa yang menempel di belakang.

        float wetL = 0.0f;
        float wetR = 0.0f;

        if (anyAmbience) {
            // Tap KIRI dan KANAN sengaja memakai jarak yang BERBEDA, bukan
            // pasangan yang sama. Kalau keduanya simetris, ambience pada sinyal
            // mono (L == R) menghasilkan wetL == wetR - sehingga keluarannya
            // tetap identik dan ruangnya tidak terdengar sama sekali
            // (terukur: selisih L/R tepat 0).
            //
            // Dengan tap yang berbeda, kedua channel mendapat dekorasi yang
            // tidak sama, dan itu yang terdengar sebagai ruang.
            const int32_t tapA =
                (mWriteIndex - mTapNear + kAmbienceSize) % kAmbienceSize;
            const int32_t tapB =
                (mWriteIndex - mTapFar + kAmbienceSize) % kAmbienceSize;
            const int32_t tapC =
                (mWriteIndex - mTapMid + kAmbienceSize) % kAmbienceSize;

            wetL = (mAmbienceR[tapA] * 0.6f + mAmbienceR[tapC] * 0.4f)
                   * mCurrentDepth;
            wetR = (mAmbienceL[tapB] * 0.6f + mAmbienceL[tapA] * 0.4f)
                   * mCurrentDepth;
        }

        mAmbienceL[mWriteIndex] = l;
        mAmbienceR[mWriteIndex] = r;

        mWriteIndex = (mWriteIndex + 1) % kAmbienceSize;

        // Mix dry/wet: saat depth 0 ambience nol, jadi mix HARUS sama dengan
        // input. Versi sebelumnya mengalikan dry dengan 0.85 selalu - itu
        // menerapkan atenuasi -1.4 dB bahkan saat efeknya mati, dan melanggar
        // jaminan bypass.
        const float wet = mCurrentDepth;
        const float mixL = l * (1.0f - wet) + wetL;
        const float mixR = r * (1.0f - wet) + wetR;

        // ---- 2. Widen (mid/side) -----------------------------------------
        //
        // Width 1.0 = netral. Width < 1 menyempit, width > 1 melebar.

        if (std::fabs(mCurrentWidth - 1.0f) > 1e-4f) {
            const float mid = (mixL + mixR) * 0.5f;
            const float side = (mixL - mixR) * 0.5f;

            const float sideOut = side * mCurrentWidth;

            left[i] = mid + sideOut;
            right[i] = mid - sideOut;
        } else {
            left[i] = mixL;
            right[i] = mixR;
        }
    }
}

void SpatialFieldProcessor::reset() {

    for (int32_t i = 0; i < kAmbienceSize; ++i) {
        mAmbienceL[i] = 0.0f;
        mAmbienceR[i] = 0.0f;
    }

    mWriteIndex = 0;
    mCurrentWidth = mWidth;
    mCurrentDepth = mDepth;
}

}} // namespace
