#include "ConvolverNode.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void ConvolverNode::prepare(
    int,
    int
) {

}

// =====================================================
// RESET
// =====================================================

void ConvolverNode::reset() {

    mLeft.reset();
    mRight.reset();
}

// =====================================================
// LOAD IR
// =====================================================

void ConvolverNode::loadImpulseResponse(
    const std::vector<float>& ir
) {

    mLeft.setKernel(ir);
    mRight.setKernel(ir);
}

// =====================================================
// PROCESS
// =====================================================

void ConvolverNode::process(
    float* left,
    float* right,
    int frames
) {

    for (int i = 0; i < frames; ++i) {

        left[i] =
            mLeft.process(left[i]);

        right[i] =
            mRight.process(right[i]);
    }
}

} // namespace pristine