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

    // (B14-E3, 2026-11-14): mWidth = nilai berjalan (ramp), mTarget =
    // nilai tujuan dari applyConfig. Dulu setWidth langsung menimpa
    // mWidth -> zipper saat slider lebar digeser.
    float mWidth = 1.0f;
    float mTarget = 1.0f;
};

} // namespace pristine