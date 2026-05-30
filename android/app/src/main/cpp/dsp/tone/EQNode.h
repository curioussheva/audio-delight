#pragma once

#include "../EQProcessor.h"
#include "../graph/DSPNode.h"

namespace pristine {

class EQNode : public DSPNode {
public:

    void prepare(
        int sampleRate,
        int maxFrames
    ) override;

    void reset() override;

    void process(
        float* left,
        float* right,
        int count
    ) override;

    EQProcessor& processor();

private:

    EQProcessor mEQ;
};

} // namespace pristine