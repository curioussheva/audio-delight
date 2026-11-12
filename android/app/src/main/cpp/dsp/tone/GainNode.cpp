#include "GainNode.h"

#include "../../core/PanLaw.h"
#include "../GainProcessor.h"

namespace pristine {

void GainNode::prepare(
    int,
    int
) {
}

void GainNode::reset() {
}

void GainNode::process(
    float* left,
    float* right,
    int count
) {

    GainProcessor::process(
        left,
        right,
        count,
        mGainL,
        mGainR
    );
}

void GainNode::setGain(
    float left,
    float right
) {

    mGainL = left;
    mGainR = right;
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