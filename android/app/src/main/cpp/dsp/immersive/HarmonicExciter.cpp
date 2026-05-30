#include "HarmonicExciter.h"
#include <algorithm>
#include <cmath>

namespace audio { namespace dsp {

HarmonicExciter::HarmonicExciter() = default;
void HarmonicExciter::setDrive(float driveDb) { 
    mDrive = driveDb;
    mCoeff = std::pow(10.0f, driveDb / 20.0f);
}
void HarmonicExciter::process(float* left, float* right, int32_t numFrames) {
    // stub: just apply gain
    for (int32_t i = 0; i < numFrames; ++i) {
        left[i] *= mCoeff;
        right[i] *= mCoeff;
    }
}
void HarmonicExciter::reset() {}

}} // namespace