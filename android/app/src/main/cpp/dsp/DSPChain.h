// =====================================================
// dsp/DSPChain.h
// Final Production-Oriented Version
// =====================================================

#pragma once

#include "../core/DSPConfig.h"

#include "graph/DSPGraph.h"

namespace pristine {

class DSPChain {
public:

    // =================================================
    // LIFECYCLE
    // =================================================

    void prepare(
        int sampleRate,
        int maxFrames
    );

    void reset();

    // =================================================
    // CONFIG
    // =================================================

    void applyConfig(
        const DSPConfig& config
    );

    // =================================================
    // PROCESS
    // =================================================

    void process(
        float* left,
        float* right,
        int frames
    );

private:

    // =================================================
    // GRAPH
    // =================================================

    void buildGraph();

private:

    DSPGraph mGraph;

    DSPConfig mConfig;

    int mSampleRate = 48000;
    int mMaxFrames = 1920;

    bool mPrepared = false;
};

} // namespace pristine