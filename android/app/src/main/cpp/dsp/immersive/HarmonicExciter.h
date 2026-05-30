#pragma once
#include <cstdint>

namespace audio { namespace dsp {

class HarmonicExciter {
public:
    HarmonicExciter();
    void setDrive(float driveDb); // 0-24 dB
    void process(float* left, float* right, int32_t numFrames);
    void reset();

private:
    float mDrive = 0.0f;
    float mCoeff = 1.0f;
};

}} // namespace