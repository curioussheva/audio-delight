#pragma once

#include "../graph/DSPNode.h"

namespace pristine {

class StereoWidenerNode
    : public DSPNode {
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

    void applyConfig(
        const DSPConfig& config
    ) override;

    void setWidth(float width);

private:

    float mWidth = 1.0f;
};

} // namespace pristine