// =====================================================
// dsp/DSPChain.cpp
// Final Production-Oriented Version
// =====================================================

#include "DSPChain.h"

#include "dynamics/LimiterNode.h"
#include "spatial/StereoWidenerNode.h"
#include "tone/EQNode.h"
#include "tone/GainNode.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void DSPChain::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate;
    mMaxFrames = maxFrames;

    // =========================================
    // BUILD DSP GRAPH
    // =========================================

    buildGraph();

    // =========================================
    // PREPARE GRAPH
    // =========================================

    mGraph.prepare(
        sampleRate,
        maxFrames
    );

    mPrepared = true;
}

// =====================================================
// RESET
// =====================================================

void DSPChain::reset() {

    mGraph.reset();
}

// =====================================================
// APPLY CONFIG
// =====================================================

void DSPChain::applyConfig(
    const DSPConfig& config
) {

    mConfig = config;

    mGraph.applyConfig(
        config
    );
}

// =====================================================
// PROCESS
// =====================================================

void DSPChain::process(
    float* left,
    float* right,
    int frames
) {

    if (!mPrepared) {
        return;
    }

    if (!mConfig.enabled) {
        return;
    }

    mGraph.process(
        left,
        right,
        frames
    );
}

// =====================================================
// BUILD GRAPH
// =====================================================

void DSPChain::buildGraph() {

    // =========================================
    // CLEAR OLD GRAPH
    // =========================================

    mGraph.clear();

    // =========================================
    // TONE STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<EQNode>()
    );

    // =========================================
    // SPATIAL STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            StereoWidenerNode
        >()
    );

    // =========================================
    // GAIN STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            GainNode
        >()
    );

    // =========================================
    // DYNAMICS STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            LimiterNode
        >()
    );
}

} // namespace pristine