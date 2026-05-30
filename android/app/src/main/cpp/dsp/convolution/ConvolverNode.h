#pragma once

#include "../graph/DSPNode.h"

#include "FIRFilter.h"

namespace pristine {

class ConvolverNode : public DSPNode {
public:

    void prepare(
        int sampleRate,
        int maxFrames
    ) override;

    void reset() override;

    void process(
        float* left,
        float* right,
        int frames
    ) override;

    void loadImpulseResponse(
        const std::vector<float>& ir
    );

private:

    FIRFilter mLeft;
    FIRFilter mRight;
};

} // namespace pristine