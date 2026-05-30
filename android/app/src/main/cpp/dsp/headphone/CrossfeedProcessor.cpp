#include "CrossfeedProcessor.h"
#include <algorithm>

namespace pristine { namespace dsp {

void CrossfeedProcessor::setStrength(float strength) {
    mStrength = std::clamp(strength, 0.0f, 1.0f);
}

void CrossfeedProcessor::process(float* left, float* right, int32_t numFrames) {
    const float blend = mStrength * 0.5f;
    for (int32_t i = 0; i < numFrames; ++i) {
        float l = left[i] * (1.0f - blend) + right[i] * blend;
        float r = right[i] * (1.0f - blend) + left[i] * blend;
        left[i] = l;
        right[i] = r;
    }
}

void CrossfeedProcessor::reset() {
    mPrevL = mPrevR = 0.0f;
}

}} // namespace