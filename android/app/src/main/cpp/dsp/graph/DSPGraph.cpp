#include "DSPGraph.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void DSPGraph::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate;
    mMaxFrames = maxFrames;

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i]->prepare(
            sampleRate,
            maxFrames
        );
    }
}

// =====================================================
// RESET
// =====================================================

void DSPGraph::reset() {

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i]->reset();
    }
}

// =====================================================
// CLEAR
// =====================================================

void DSPGraph::clear() {

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i].reset();
    }

    mNodeCount = 0;
}

// =====================================================
// ADD NODE
// =====================================================

bool DSPGraph::addNode(
    std::unique_ptr<DSPNode> node
) {

    if (!node) {
        return false;
    }

    if (
        mNodeCount >=
        kMaxNodes
    ) {
        return false;
    }

    node->prepare(
        mSampleRate,
        mMaxFrames
    );

    mNodes[mNodeCount++] =
        std::move(node);

    return true;
}

// =====================================================
// PROCESS
// =====================================================

void DSPGraph::process(
    float* left,
    float* right,
    int frames
) {

    for (int i = 0; i < mNodeCount; ++i) {

        auto& node =
            mNodes[i];

        if (
            !node ||
            !node->isEnabled()
        ) {
            continue;
        }

        node->process(
            left,
            right,
            frames
        );
    }
}

} // namespace pristine