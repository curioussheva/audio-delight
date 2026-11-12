#include "GainNode.h"

#include "../../core/PanLaw.h"
#include "../GainProcessor.h"

#include <cmath>

namespace pristine {

void GainNode::prepare(
    int,
    int
) {
}

void GainNode::reset() {

    // (C-SMOOTH): snap ke target — sesudah reset (mis. ganti mode ke DSP,
    // DSPChain::reset -> DSPGraph::reset) tidak ada sapuan dari nilai lama.
    // Sama seperti SpatialFieldProcessor::reset().
    mCurrentGainL = mTargetGainL;
    mCurrentGainR = mTargetGainR;
}

void GainNode::process(
    float* left,
    float* right,
    int count
) {

    if (
        !left ||
        !right ||
        count <= 0
    ) {
        return;
    }

    // Sudah settle: gain konstan — GainProcessor (NEON) seperti dulu,
    // tanpa biaya tambahan.
    if (
        std::fabs(mCurrentGainL - mTargetGainL) <= kSettledEps &&
        std::fabs(mCurrentGainR - mTargetGainR) <= kSettledEps
    ) {

        mCurrentGainL = mTargetGainL;
        mCurrentGainR = mTargetGainR;

        GainProcessor::process(
            left,
            right,
            count,
            mCurrentGainL,
            mCurrentGainR
        );

        return;
    }

    // Transisi: one-pole per sample — struktur cabang yang sama dengan
    // SpatialFieldProcessor::process(): di dalam ambang, terapkan selisih
    // penuh (snap persis ke target); di luar ambang, langkah kSmooth.
    for (
        int i = 0;
        i < count;
        ++i
    ) {

        mCurrentGainL +=
            std::fabs(mTargetGainL - mCurrentGainL) > kSettledEps
                ? (mTargetGainL - mCurrentGainL) * kSmooth
                : (mTargetGainL - mCurrentGainL);

        mCurrentGainR +=
            std::fabs(mTargetGainR - mCurrentGainR) > kSettledEps
                ? (mTargetGainR - mCurrentGainR) * kSmooth
                : (mTargetGainR - mCurrentGainR);

        left[i] *= mCurrentGainL;
        right[i] *= mCurrentGainR;
    }
}

void GainNode::setGain(
    float left,
    float right
) {

    mTargetGainL = left;
    mTargetGainR = right;

    // Prime pada pemakaian pertama supaya render pertama tidak menyapu
    // dari default 1,0 ke nilai sebenarnya (pola SpatialFieldProcessor::
    // setWidth/setDepth). Tanpa ini, buffer pertama sesudah prepare() /
    // buildGraph (node baru, state default) akan fade dari full-scale.
    if (!mPrimed) {
        mCurrentGainL = left;
        mCurrentGainR = right;
        mPrimed = true;
    }
}

// =====================================================
// APPLY CONFIG
// =====================================================

void GainNode::applyConfig(
    const DSPConfig& config
) {

    // (C-PAN, 2026-11-12): hukum pan linear lewat helper bersama
    // (core/PanLaw.h) — rumus sama seperti sebelumnya, hanya dipindah
    // supaya satu hukum dengan processImmersive(). Perilaku tidak berubah.
    const PanGains pan = panLawLinear(config.balance);

    setGain(
        config.masterGain * pan.left,
        config.masterGain * pan.right
    );
}

} // namespace pristine
