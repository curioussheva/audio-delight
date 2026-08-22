#pragma once

#include <cstdint>

namespace pristine { namespace dsp {

class CrossfeedProcessor {
public:
    void setStrength(float strength); // 0..1
    void process(float* left, float* right, int32_t numFrames);
    void reset();
private:
    float mStrength = 0.5f;
    float mPrevL = 0.0f, mPrevR = 0.0f;
};

}} // namespace