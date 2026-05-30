#pragma once
#include "FFTTypes.h"
#include <memory>

namespace audio {

class FFTPlan {
public:
    explicit FFTPlan(int n);  // n must be power of two
    ~FFTPlan();

    void forward(const float* realInput, Complex* complexOutput);
    void inverse(const Complex* complexInput, float* realOutput);
    int getSize() const { return mSize; }

private:
    int mSize;
    void* mCfg; // kiss_fft_cfg
};

} // namespace audio