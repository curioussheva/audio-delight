#pragma once

#include <cstdint>

#include "AudioTypes.h"

#include "../dsp/DSPChain.h"

// Prosesor mode Immersive.
//
// Dipindahkan dari `cpp/modes/ImmersivePipeline` (dihapus di 5a386f0a9).
// Keputusan ada di docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md: logika tiga
// mode hidup di satu tempat (AudioPipeline), bukan tiga kelas terpisah. Yang
// diadopsi adalah PERILAKU kelas lama, bukan filenya.
//
// Sama seperti DSPChain: hidup sepanjang umur AudioPipeline, prepare() dipanggil
// saat stream dibuka, process() dipanggil dari audio callback.
#include "../dsp/immersive/SolfeggioResonator.h"
#include "../dsp/immersive/BrainwaveGenerator.h"
#include "../dsp/immersive/HarmonicExciter.h"
#include "../dsp/immersive/SpatialFieldProcessor.h"
#include "../dsp/immersive/BinauralRenderer.h"

namespace pristine {

// =====================================================
// IMMERSIVE STAGE
// =====================================================
//
// Rantai proses untuk mode Immersive, dijalankan SETELAH DSPChain.
//
// Empat tahap aktif (urutannya disengaja, lihat process()):
//   1. Solfeggio resonance  - filter resonan pada frekuensi target
//   2. Harmonic exciter     - menambah harmonisa
//   3. Spatial field        - pelebaran stereo
//   4. Brainwave generator  - binaural beat (ditambahkan ke sinyal)
//
// BinauralRenderer sengaja TIDAK aktif: ia butuh input mono dan hanya masuk
// akal untuk headphone. Sama seperti kelas lamanya, ini disimpan untuk dipakai
// nanti, bukan dihapus.
class ImmersiveStage final {
public:

    ImmersiveStage() = default;

    // =============================================
    // LIFECYCLE
    // =============================================

    // Dipanggil saat stream dibuka (laju stream diketahui).
    void prepare(int32_t sampleRate);

    // Dipanggil dari audio callback. Realtime-safe: tanpa alokasi, tanpa lock,
    // hanya baca parameter yang dipetakan ke setter (kelas-kelasnya menyimpan
    // cache sendiri supaya setter tidak menghitung ulang tiap buffer).
    void process(
        float* left,
        float* right,
        int32_t numFrames,
        const DSPParameters& params
    );

    void reset();

    bool isPrepared() const { return mPrepared; }

private:

    // Frekuensi -> band brainwave standar (batas psikoakustik).
    static dsp::BrainwaveType mapFrequencyToBrainwaveType(float hz);

    dsp::SolfeggioResonator mSolfeggio;

    dsp::BrainwaveGenerator mBrainwave;

    dsp::HarmonicExciter mHarmonic;

    dsp::SpatialFieldProcessor mSpatial;

    // Belum dipakai di process() - lihat catatan di atas.
    dsp::BinauralRenderer mBinaural;

    int32_t mSampleRate = 48000;

    bool mPrepared = false;
};

} // namespace pristine
