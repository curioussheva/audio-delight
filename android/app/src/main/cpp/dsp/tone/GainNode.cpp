#include "GainNode.h"

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

    float left =
        config.masterGain *
        (config.balance <= 0.0f
            ? 1.0f
            : 1.0f - config.balance);

    float right =
        config.masterGain *
        (config.balance >= 0.0f
            ? 1.0f
            : 1.0f + config.balance);

    setGain(left, right);
}

} // namespace pristine