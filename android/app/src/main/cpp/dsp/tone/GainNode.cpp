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

} // namespace pristine