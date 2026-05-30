#include "HeadphoneCorrection.h"
#include <cstring>

namespace pristine { namespace dsp {

bool HeadphoneCorrection::loadProfile(const std::string& model) {
    (void)model;
    // stub: load some default coefficients
    mFilterLeft = {1.0f};
    mFilterRight = {1.0f};
    return true;
}

void HeadphoneCorrection::process(float* left, float* right, int32_t numFrames) {
    applyFIR(mFilterLeft, left, numFrames);
    applyFIR(mFilterRight, right, numFrames);
}

void HeadphoneCorrection::applyFIR(const std::vector<float>& coeffs, float* inout, int32_t numFrames) {
    if (coeffs.empty()) return;
    for (int32_t i = 0; i < numFrames; ++i) {
        inout[i] *= coeffs[0]; // trivial
    }
}

void HeadphoneCorrection::reset() {}

}} // namespace