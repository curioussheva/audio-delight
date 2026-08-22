#include "StereoWidenerNode.h"

#include "../StereoWidener.h"

namespace pristine {

void StereoWidenerNode::prepare(
    int,
    int
) {
}

void StereoWidenerNode::reset() {
}

void StereoWidenerNode::process(
    float* left,
    float* right,
    int count
) {

    StereoWidener::process(
        left,
        right,
        count,
        mWidth
    );
}

void StereoWidenerNode::setWidth(
    float width
) {

    mWidth = width;
}

// =====================================================
// APPLY CONFIG
// =====================================================

void StereoWidenerNode::applyConfig(
    const DSPConfig& config
) {

    setWidth(
        config.stereoWidth
    );
}

} // namespace pristine