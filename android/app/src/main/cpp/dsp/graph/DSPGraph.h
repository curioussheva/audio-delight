#pragma once

#include <array>
#include <memory>

#include "DSPNode.h"

namespace pristine {

class DSPGraph {
public:

    static constexpr int kMaxNodes = 32;

    void prepare(
        int sampleRate,
        int maxFrames
    );

    void reset();

    bool addNode(
        std::unique_ptr<DSPNode> node
    );
    
    void applyConfig(
        const DSPConfig& config
    );

    void clear();

    void process(
        float* left,
        float* right,
        int frames
    );

private:

    int mSampleRate = 48000;
    int mMaxFrames = 1920;

    std::array<
        std::unique_ptr<DSPNode>,
        kMaxNodes
    > mNodes;

    int mNodeCount = 0;
};

} // namespace pristine