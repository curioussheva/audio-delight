#include "EQNode.h"

namespace pristine {

void EQNode::prepare(
    int,
    int
) {
}

void EQNode::reset() {

    mEQ.reset();
}

void EQNode::process(
    float* left,
    float* right,
    int count
) {

    mEQ.process(
        left,
        right,
        count
    );
}

EQProcessor&
EQNode::processor() {

    return mEQ;
}

// =====================================================
// APPLY CONFIG
// =====================================================

void EQNode::applyConfig(
    const DSPConfig& config
) {

    for (int band = 0; band < EQProcessor::kBands; ++band) {

        mEQ.setBandGain(
            band,
            config.eqGain[band]
        );
    }

    mEQ.setBassBoost(
        config.bassBoost
    );
}

} // namespace pristine