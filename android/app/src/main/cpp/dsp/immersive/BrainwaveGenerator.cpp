#include "BrainwaveGenerator.h"
#include <cmath>

namespace audio { namespace dsp {

BrainwaveGenerator::BrainwaveGenerator() = default;
void BrainwaveGenerator::setType(BrainwaveType type) { mType = type; }
void BrainwaveGenerator::setVolume(float volume) { mVolume = volume; }
void BrainwaveGenerator::generate(float* left, float* right, int32_t numFrames, float sampleRate) {
    // stub: fill with zeros
    for (int32_t i = 0; i < numFrames; ++i) {
        left[i] = 0.0f;
        right[i] = 0.0f;
    }
}
void BrainwaveGenerator::reset() { mPhaseL = mPhaseR = 0.0f; }

}} // namespace