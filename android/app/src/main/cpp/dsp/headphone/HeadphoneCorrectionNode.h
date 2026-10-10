#pragma once

#include "../BiquadCascade.h"
#include "../graph/DSPNode.h"

namespace pristine {

// =====================================================
// HEADPHONE CORRECTION NODE
// =====================================================
//
// Node DSP yang menerapkan preset koreksi headphone hasil parse.
//
// POSISI DI RANTAI: sebelum EQNode.
//
// Alasannya: koreksi headphone = netralisasi alat. EQ user = selera. Urutan
// ini sama dengan AutoEQ + Equalizer APO. Kalau dibalik, setiap kali ganti
// headphone, tuning user harus diulang dari nol.
//
// Yang dilakukan node ini hanya MENERAPKAN preset yang sudah di-parse. Ia
// tidak mem-parse teks — parsing ada di PresetParser, dijalankan di UI thread.
// Lihat docs/HEADPHONE_CORRECTION.md §posisi.

class HeadphoneCorrectionNode : public DSPNode {

public:

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int sampleRate,
        int maxFrames
    ) override;

    void reset() override;

    void process(
        float* left,
        float* right,
        int frames
    ) override;

    // =============================================
    // CONFIG
    // =============================================

    void applyConfig(
        const DSPConfig& config
    ) override;

    // =============================================
    // AKSES
    // =============================================

    BiquadCascade& cascade();

    // Jumlah filter yang sedang aktif. Dipakai test dan diagnostik.
    int activeFilterCount() const;

private:

    BiquadCascade mCascade;

    // Snapshot preset yang terakhir dipasang. Dipakai untuk mendeteksi
    // perubahan — menghitung ulang koefisien 16 biquad (powf/cosf/sinf) tiap
    // buffer akan membebani audio thread tanpa manfaat.
    HeadphonePresetData mApplied;

    int mAppliedSampleRate = 0;

    bool mHasApplied = false;
};

} // namespace pristine
