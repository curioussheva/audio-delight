#pragma once
#include "../../fft/FFTPlan.h"
#include <vector>

namespace audio { namespace dsp {

class FFTResonanceAnalyzer {
public:
    explicit FFTResonanceAnalyzer(int fftSize = 4096);
    void process(const float* left, const float* right, int32_t numFrames);
    float getDominantFrequency() const;
    void reset();

private:
    int mFFTSize;
    audio::FFTPlan mPlan;
    std::vector<float> mBuffer;
    int mWritePos;
};

}} // namespace