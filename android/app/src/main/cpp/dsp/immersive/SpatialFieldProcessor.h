#pragma once
#include <cstdint>

namespace audio { namespace dsp {

class SpatialFieldProcessor {
public:
    SpatialFieldProcessor();
    void setWidth(float width);   // 0-2
    void setDepth(float depth);   // 0-1
    void process(float* left, float* right, int32_t numFrames);
    void reset();

private:
    float mWidth = 1.0f;
    float mDepth = 0.0f;
    float mPrevL = 0.0f, mPrevR = 0.0f;
};

}} // namespace