#pragma once

#include "../graph/DSPNode.h"

namespace pristine {

class GainNode : public DSPNode {
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

    void setGain(
        float left,
        float right
    );

private:

    float mGainL = 1.0f;
    float mGainR = 1.0f;
};

} // namespace pristine