#pragma once
#include <cstdint>

namespace pristine { namespace dsp {

class BinauralRenderer {
public:
    BinauralRenderer();
    void setAzimuth(float degrees);  // -180..180
    void setElevation(float degrees);
    void process(const float* monoInput, float* outLeft, float* outRight, int32_t numFrames);
    void reset();

private:
    float mAzimuth = 0.0f;
    float mElevation = 0.0f;
};

}} // namespace