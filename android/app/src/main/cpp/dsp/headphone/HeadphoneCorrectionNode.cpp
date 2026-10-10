// =====================================================
// dsp/headphone/HeadphoneCorrectionNode.cpp
// =====================================================

#include "HeadphoneCorrectionNode.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void HeadphoneCorrectionNode::prepare(
    int sampleRate,
    int
) {

    mAppliedSampleRate = sampleRate;

    // Rantai belum dikonfigurasi di sini: presetnya belum tentu ada saat
    // stream dibuka. Yang penting laju sudah tercatat, supaya applyConfig
    // pertama menghitung koefisien dengan laju yang benar.

    mHasApplied = false;

    // Node tanpa preset tidak boleh mengaku aktif. `DSPNode::mEnabled`
    // defaultnya true, jadi tanpa baris ini node akan "aktif" padahal tidak
    // ada satu filter pun terpasang — persis bentuk "tampak tersedia padahal
    // tidak ada" yang dihindari di docs/BOILERPLATE_AND_STUBS.md §2.
    setEnabled(false);
}

// =====================================================
// RESET
// =====================================================

void HeadphoneCorrectionNode::reset() {

    mCascade.reset();
}

// =====================================================
// PROCESS
// =====================================================

void HeadphoneCorrectionNode::process(
    float* left,
    float* right,
    int frames
) {

    mCascade.process(left, right, frames);
}

// =====================================================
// APPLY CONFIG
// =====================================================
//
// Berjalan di audio thread. Tidak mengalokasi: `mApplied` sudah jadi member,
// dan `mCascade` memakai array statis.
//
// Preset dibandingkan dengan yang terakhir dipasang. Kalau sama, tidak ada
// yang dikerjakan — menghitung ulang koefisien 16 biquad (powf/cosf/sinf)
// tiap buffer akan membebani audio thread tanpa manfaat.

void HeadphoneCorrectionNode::applyConfig(
    const DSPConfig& config
) {

    // Koreksi dimatikan: kosongkan rantai sekali saja.
    if (!config.headphoneCorrectionEnabled) {

        if (mHasApplied) {
            mCascade.clear();
            mApplied = HeadphonePresetData{};
            mHasApplied = false;
        }

        setEnabled(false);
        return;
    }

    const HeadphonePresetData& preset =
        config.headphonePreset;

    // Tidak ada preset terpasang: jangan sentuh buffer sama sekali.
    if (preset.filterCount <= 0) {

        if (mHasApplied) {
            mCascade.clear();
            mApplied = HeadphonePresetData{};
            mHasApplied = false;
        }

        setEnabled(false);
        return;
    }

    // Sudah terpasang dan identik: tidak ada yang perlu dihitung.
    if (mHasApplied && mAppliedSampleRate > 0) {

        bool same = (mApplied.preampDb == preset.preampDb) &&
                    (mApplied.filterCount == preset.filterCount);

        if (same) {
            for (int i = 0; i < preset.filterCount; ++i) {

                const auto& a = mApplied.filters[i];
                const auto& b = preset.filters[i];

                if (a.type != b.type ||
                    a.freqHz != b.freqHz ||
                    a.q != b.q ||
                    a.gainDb != b.gainDb) {
                    same = false;
                    break;
                }
            }
        }

        if (same) {
            setEnabled(true);
            return;
        }
    }

    // ---- Pasang preset -------------------------------------------
    //
    // Hanya di sini koefisien dihitung. Ini terjadi saat preset berganti,
    // bukan tiap buffer.

    mCascade.clear();
    mCascade.setPreamp(preset.preampDb);

    int index = 0;

    for (int i = 0; i < preset.filterCount; ++i) {

        if (index >= BiquadCascade::kMaxFilters) {
            break;
        }

        const auto& f = preset.filters[i];

        FilterType type = FilterType::Peaking;

        if (f.type == 1) {
            type = FilterType::LowShelf;
        } else if (f.type == 2) {
            type = FilterType::HighShelf;
        }

        if (!mCascade.setFilter(
                index, type, f.freqHz, f.q, f.gainDb,
                static_cast<float>(mAppliedSampleRate))) {
            break;
        }

        ++index;
    }

    mCascade.setActiveCount(index);

    mApplied = preset;
    mHasApplied = true;

    setEnabled(index > 0);
}

// =====================================================
// AKSES
// =====================================================

BiquadCascade&
HeadphoneCorrectionNode::cascade() {

    return mCascade;
}

int HeadphoneCorrectionNode::activeFilterCount() const {

    return mCascade.activeCount();
}

} // namespace pristine
