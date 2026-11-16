#include "SolfeggioResonator.h"

#include "../../core/AudioTypes.h"

#include <algorithm>
#include <cmath>

namespace pristine {
namespace dsp {

SolfeggioResonator::SolfeggioResonator() = default;

void SolfeggioResonator::prepare(int32_t sampleRate) {
    if (sampleRate > 0) mSampleRate = static_cast<float>(sampleRate);
    // DSP2-M1: koefisien dihitung dari mSampleRate; laju baru membuat cache
    // basi (resonansi 528 Hz pindah ke ~485 Hz sesudah reopen 48k->44,1k).
    // Invalidasi paksa updateCoefficientsIfNeeded() menghitung ulang.
    mCachedFreq = -1.0f;
}

void SolfeggioResonator::setFrequency(float hz) {
    // DSP-M6: clamp atas 0,45 x laju (di bawah Nyquist) — di atas itu
    // koefisien RBJ meledak (output inf, mis. 30 kHz @48 kHz). Batas bawah
    // 20 Hz tetap. mSampleRate default 48000.0f dan prepare() hanya
    // menerima laju > 0, jadi aman walau dipanggil sebelum prepare().
    // NaN tetap aman seperti sebelumnya: std::max(20, NaN) -> 20.
    const float maxFreq = 0.45f * mSampleRate;
    mFreq.store(std::min(std::max(20.0f, hz), maxFreq),
                std::memory_order_relaxed);
}

void SolfeggioResonator::setIntensity(float intensity) {
    // C-IMMVAL: std::clamp TIDAK menahan NaN — perbandingannya false
    // dua-duanya, jadi NaN lolos mentah, lalu wetTarget = NaN dan
    // mWetSmooth ikut jadi NaN (processChannel). clampFinite:
    // non-finite -> fallback 0.5 = default AudioState, finite di luar
    // [0,1] -> batas terdekat.
    mIntensity.store(clampFinite(intensity, 0.0f, 1.0f, 0.5f),
                     std::memory_order_relaxed);
}

// Recompute hanya saat FREKUENSI berubah — real-time safe, tidak ada
// trig/alloc/lock per-sample.
//
// C2 Batch 18: Q DIPATOK 4.0f, tidak lagi mengikuti intensity
// (dulu Q = 0.7 + intensity*7.3, jadi tiap geser slider menghitung ulang
// koefisien RBJ seketika = zipper). Intensity hanya mengubah wet (yang
// dihaluskan di processChannel), bukan lebar pita. Karena itu intensity
// sengaja TIDAK masuk syarat early-return di sini — perubahan intensity
// saja tidak boleh memicu hitung ulang koefisien.
// CATATAN KARAKTER: di intensity 1.0 Q berubah 8 -> 4 (pita lebih lebar),
// di 0.1 berubah 1,43 -> 4 (pita lebih sempit); di default 0,5 hampir
// sama (4,35 -> 4). Butuh verdict telinga di device.
void SolfeggioResonator::updateCoefficientsIfNeeded() {
    const float freq = mFreq.load(std::memory_order_relaxed);

    if (freq == mCachedFreq) return;

    mCachedFreq = freq;

    // Q tetap — lebar pita konstan di semua intensity.
    const float Q = 4.0f;

    // B15-I1: klem ulang ke 0,45 x laju SAAT INI — mFreq diklem di
    // setFrequency() terhadap laju saat itu, tapi prepare() ke laju lebih
    // rendah tidak mengklem ulang mFreq (mis. 21.600 Hz legal @48 kHz,
    // lalu stream 32 kHz -> w0 ~4,24 > pi, koefisien salah). Klem pada
    // nilai lokal: mFreq yang disimpan tidak diubah.
    const float effFreq = std::min(freq, 0.45f * mSampleRate);

    // I1-double: koefisien + state double di BiquadFilter (DF-II-T).
    // setBandpass memvalidasi + mengklem ulang (designOk: freq [1, 0.49*sr],
    // Q [0.1, 20]); gagal -> koefisien lama dipertahankan, filter tetap jalan.
    mBpL.setBandpass(effFreq, Q, mSampleRate);
    mBpR.setBandpass(effFreq, Q, mSampleRate);
}

float SolfeggioResonator::processChannel(
    float* channel,
    int32_t numFrames,
    BiquadFilter& bp,
    float wet,
    float wetTarget
) {
    for (int32_t i = 0; i < numFrames; ++i) {
        // C2 Batch 18: wet dihaluskan one-pole per sampel menuju target
        // (kWetSmooth = 0.002f, sama dengan GainNode/EQProcessor/
        // SpatialFieldProcessor) — bukan lompatan per buffer. Snap ke
        // target persis bila sudah dalam eps, ala GainNode.
        wet += (wetTarget - wet) * kWetSmooth;
        if (std::fabs(wetTarget - wet) <= kWetSettledEps) wet = wetTarget;

        const float x0 = channel[i];

        // I1-double: filter bandpass double (BiquadFilter::process,
        // DF-II Transposed, state + koefisien double).
        const float y0 = bp.process(x0);

        // B15-I1: ADITIF, bukan wet/dry — sinyal asli selalu utuh (unity
        // di luar band), resonansi DITAMBAHKAN: tengah pita 1 + wet
        // (maks +6,02 dB @ intensity 1). Rumus lama dry*x0 + wet*y0
        // memotong sinyal di luar band sampai -6 dB @ 0,5 dan tak pernah
        // menguatkan apa pun.
        channel[i] = x0 + wet * y0;
    }

    return wet;
}

void SolfeggioResonator::process(float* left, float* right, int32_t numFrames) {
    updateCoefficientsIfNeeded();

    // mCachedIntensity = target wet terbaru (intensity tidak lagi dibaca
    // di updateCoefficientsIfNeeded sejak C2 — koefisien hanya soal freq).
    mCachedIntensity = mIntensity.load(std::memory_order_relaxed);

    // Bypass total HANYA bila target 0 DAN wet sudah meluruh di bawah eps
    // — ekor resonansi tidak dipotong mendadak (dulu: return mentah saat
    // intensity <= 0 = klik). Selama wet meramp turun, filter tetap jalan
    // supaya state meluruh alami.
    if (mCachedIntensity <= 0.0f && mWetSmooth < kWetSettledEps) return;

    const float wetTarget = mCachedIntensity;

    // L dan R mulai dari wet yang sama dan maju identik (jumlah langkah
    // sama, target sama) — wL == wR; mWetSmooth diperbarui dari kiri.
    const float wetStart = mWetSmooth;
    const float wL = processChannel(left, numFrames, mBpL,
                                    wetStart, wetTarget);
    mWetSmooth = wL;

    if (right != nullptr && right != left) {
        processChannel(right, numFrames, mBpR,
                       wetStart, wetTarget);
    }
}

void SolfeggioResonator::reset() {
    mBpL.reset();
    mBpR.reset();
    mWetSmooth = 0.0f;
}

} // namespace dsp
} // namespace pristine
 