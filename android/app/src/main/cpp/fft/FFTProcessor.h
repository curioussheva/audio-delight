#pragma once
#include "FFTPlan.h"
#include "WindowFunctions.h"
#include <vector>

namespace pristine {

class FFTProcessor {
public:
    explicit FFTProcessor(int fftSize);
    void process(const float* input, float* outputMagnitude);
    void setWindowType(const std::vector<float>& window);
private:
    int mFFTSize;
    FFTPlan mPlan;
    std::vector<float> mWindow;
    std::vector<float> mRealIn; // input real berjendela untuk forward()
    std::vector<Complex> mBuffer;
    std::vector<float> mMagnitude;
};

} // namespace pristine