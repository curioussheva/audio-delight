#include "FFTPlan.h"
#include <android/log.h>
#include <cstring>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "FFTPlan", __VA_ARGS__)

namespace audio {

FFTPlan::FFTPlan(int n) : mSize(n), mCfg(nullptr) {
    LOGD("FFTPlan created size %d (stub)", n);
    // In real implementation: mCfg = kiss_fft_alloc(n, 0, nullptr, nullptr);
}

FFTPlan::~FFTPlan() {
    // if (mCfg) free(mCfg);
}

void FFTPlan::forward(const float* realInput, Complex* complexOutput) {
    // stub
    if (!realInput || !complexOutput) return;
    for (int i = 0; i < mSize; ++i) {
        complexOutput[i] = Complex(realInput[i], 0.0f);
    }
}

void FFTPlan::inverse(const Complex* complexInput, float* realOutput) {
    if (!complexInput || !realOutput) return;
    for (int i = 0; i < mSize; ++i) {
        realOutput[i] = complexInput[i].real();
    }
}

} // namespace audio