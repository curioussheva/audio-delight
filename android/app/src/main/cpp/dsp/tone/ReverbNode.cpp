#include "ReverbNode.h"

#include <algorithm>
#include <cmath>

namespace pristine {

// =====================================================
// PEMETAAN PRESET (Android PresetReverb 0..6)
// =====================================================
//
// Daftar preset SAMA dengan ReverbDropdown / REVERB_PRESET_MAP —
// tidak ada preset yang ditambah, dihapus, atau diurut ulang.
// feedback = 0,50 + roomSize * 0,34 (maks 0,84 < 1: stabil).
// damp = lowpass di loop comb (1 = gelap). Plate terang (0,10);
// aula besar gelap (0,20) karena udara menyerap treble.

ReverbParams ReverbParams::fromPreset(int preset) {
    switch (preset) {
        case 1:  // Small Room
            return ReverbParams{0.35f, 0.50f, 0.25f, 0.90f};
        case 2:  // Medium Room
            return ReverbParams{0.55f, 0.40f, 0.35f, 0.85f};
        case 3:  // Large Room
            return ReverbParams{0.70f, 0.30f, 0.45f, 0.80f};
        case 4:  // Medium Hall
            return ReverbParams{0.80f, 0.25f, 0.55f, 0.75f};
        case 5:  // Large Hall
            return ReverbParams{0.90f, 0.20f, 0.65f, 0.70f};
        case 6:  // Plate
            return ReverbParams{0.60f, 0.10f, 0.50f, 0.80f};
        case 0:  // Off
        default:
            return ReverbParams{0.0f, 0.0f, 0.0f, 1.0f};
    }
}

void ReverbNode::prepare(
    int sampleRate,
    int maxFrames
) {
    (void)maxFrames;
    mSampleRate = sampleRate > 0 ? sampleRate : 48000;

    // Delay diskalakan dari tuning 44,1 kHz; minimal 1 sampel supaya
    // tidak ada delay line berukuran 0 (la ju sampel berapa pun tetap
    // jalan — node tidak pernah berasumsi 44,1/48 kHz).
    const double scale =
        static_cast<double>(mSampleRate) / 44100.0;
    for (int c = 0; c < 4; ++c) {
        const std::size_t lenL = static_cast<std::size_t>(std::max(
            1,
            static_cast<int>(std::llround(kCombTunings[c] * scale))));
        const std::size_t lenR = static_cast<std::size_t>(std::max(
            1,
            static_cast<int>(
                std::llround((kCombTunings[c] + kStereoSpread) * scale))));
        mLeft.combs[c].buf.assign(lenL, 0.0f);
        mRight.combs[c].buf.assign(lenR, 0.0f);
        mLeft.combs[c].idx = 0;
        mRight.combs[c].idx = 0;
        mLeft.combs[c].filterStore = 0.0f;
        mRight.combs[c].filterStore = 0.0f;
    }
    for (int a = 0; a < 2; ++a) {
        const std::size_t lenL = static_cast<std::size_t>(std::max(
            1,
            static_cast<int>(std::llround(kAllpassTunings[a] * scale))));
        // Allpass kanan: tuning dibalik (441/556) supaya ekor stereo
        // tidak berkorelasi — pola yang sama dengan spread comb di atas.
        const std::size_t lenR = static_cast<std::size_t>(std::max(
            1,
            static_cast<int>(std::llround(
                kAllpassTunings[1 - a] * scale))));
        mLeft.allpasses[a].buf.assign(lenL, 0.0f);
        mRight.allpasses[a].buf.assign(lenR, 0.0f);
        mLeft.allpasses[a].idx = 0;
        mRight.allpasses[a].idx = 0;
    }
}

void ReverbNode::reset() {
    for (int c = 0; c < 4; ++c) {
        for (float& s : mLeft.combs[c].buf) s = 0.0f;
        for (float& s : mRight.combs[c].buf) s = 0.0f;
        mLeft.combs[c].idx = 0;
        mRight.combs[c].idx = 0;
        mLeft.combs[c].filterStore = 0.0f;
        mRight.combs[c].filterStore = 0.0f;
    }
    for (int a = 0; a < 2; ++a) {
        for (float& s : mLeft.allpasses[a].buf) s = 0.0f;
        for (float& s : mRight.allpasses[a].buf) s = 0.0f;
        mLeft.allpasses[a].idx = 0;
        mRight.allpasses[a].idx = 0;
    }
    // Reset TIDAK menyentuh wet/dry berjalan: reset() dipanggil DSPGraph
    // saat ganti mode — menyamakan wet ke target di sini akan memotong
    // fade yang sedang berjalan. Target tetap berlaku lewat process().
}

float ReverbNode::processChannel(
    Channel& ch,
    float input,
    float feedback,
    float damp
) {
    // --- 4 comb paralel (Freeverb) ---
    // out_comb = buf[idx]; filterstore = out*(1-damp) + store*damp;
    // buf[idx] = input + filterstore*feedback. Feedback < 1 + lowpass
    // bergain <= 1 -> stabil; DSPGraph me-reset node bila output
    // non-finite (pengaman lapis kedua).
    float out = 0.0f;
    const float damp2 = 1.0f - damp;
    for (int c = 0; c < 4; ++c) {
        Comb& comb = ch.combs[c];
        const float delayed = comb.buf[comb.idx];
        comb.filterStore =
            delayed * damp2 + comb.filterStore * damp;
        comb.buf[comb.idx] =
            input + comb.filterStore * feedback;
        if (++comb.idx >= comb.buf.size()) comb.idx = 0;
        out += delayed;
    }
    out *= 0.25f;  // rata-rata 4 comb

    // --- 2 allpass seri (Schroeder) ---
    // w = x + g*w[n-D]; y = w[n-D] - g*x. |g| = 0,5 < 1 -> allpass
    // sejati (magnitudo 1 di semua frekuensi), hanya fasa yang berubah.
    for (int a = 0; a < 2; ++a) {
        Allpass& ap = ch.allpasses[a];
        const float delayed = ap.buf[ap.idx];
        ap.buf[ap.idx] = out + delayed * kAllpassFeedback;
        if (++ap.idx >= ap.buf.size()) ap.idx = 0;
        out = delayed - out * kAllpassFeedback;
    }
    return out;
}

void ReverbNode::process(
    float* left,
    float* right,
    int count
) {
    if (!left || !right || count <= 0) {
        return;
    }

    // Preset 0 dan wet sudah settle di 0: tidak ada yang diproses —
    // biaya NOL, output tidak disentuh (bit-exact). Ini yang membuat
    // toggle OFF sama murahnya dengan saat node ini belum ada.
    // prepare() belum pernah dipanggil (delay line kosong): jangan
    // sentuh buffer — DSPChain menjamin prepare sebelum process, ini
    // hanya pengaman bila node dipakai di luar rantai.
    if (
        (mPreset == 0 &&
         mWetCurrent <= kSettledEps &&
         mWetTarget <= kSettledEps) ||
        mLeft.combs[0].buf.empty()
    ) {
        return;
    }

    const float feedback = 0.50f + mParams.roomSize * 0.34f;
    const float damp = mParams.damp;

    for (int i = 0; i < count; ++i) {
        // Haluskan wet/dry one-pole (pola GainNode): ganti preset tidak
        // mengklik. Di dalam ambang, terapkan selisih penuh (snap persis).
        if (std::fabs(mWetTarget - mWetCurrent) > kSettledEps) {
            mWetCurrent += (mWetTarget - mWetCurrent) * kSmooth;
        } else {
            mWetCurrent = mWetTarget;
        }
        if (std::fabs(mDryTarget - mDryCurrent) > kSettledEps) {
            mDryCurrent += (mDryTarget - mDryCurrent) * kSmooth;
        } else {
            mDryCurrent = mDryTarget;
        }

        const float dryL = left[i];
        const float dryR = right[i];
        const float wetL = processChannel(mLeft, dryL, feedback, damp);
        const float wetR = processChannel(mRight, dryR, feedback, damp);
        left[i] = dryL * mDryCurrent + wetL * mWetCurrent;
        right[i] = dryR * mDryCurrent + wetR * mWetCurrent;
    }
}

void ReverbNode::applyConfig(
    const DSPConfig& config
) {
    const int preset = config.reverbPreset;
    const bool wasOff = (mPreset == 0);
    mPreset = preset;
    mParams = ReverbParams::fromPreset(preset);
    mWetTarget = mParams.wet;
    mDryTarget = mParams.dry;

    // Prime pada pemakaian pertama (pola GainNode): render pertama
    // tidak menyapu dari default. 0 -> preset: bersihkan delay line
    // supaya ekor basi tidak meledak keluar saat reverb dinyalakan lagi.
    if (!mPrimed) {
        mWetCurrent = mWetTarget;
        mDryCurrent = mDryTarget;
        mPrimed = true;
    } else if (wasOff && preset != 0) {
        reset();
    }
}

} // namespace pristine
