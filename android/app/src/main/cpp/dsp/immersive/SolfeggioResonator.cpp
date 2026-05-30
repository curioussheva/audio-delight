#include "SolfeggioResonator.h"
#include <cmath>
#include <algorithm>

namespace audio { namespace dsp {

SolfeggioResonator::SolfeggioResonator() = default;

void SolfeggioResonator::setFrequency(float hz) { mFreq = hz; }
void SolfeggioResonator::setIntensity(float intensity) { mIntensity = std::clamp(intensity, 0.0f, 1.0f); }

void SolfeggioResonator::process(const float* input, float* output, int32_t numFrames, bool mixDry) {
    // stub: copy input to output
    for (int32_t i = 0; i < numFrames; ++i) {
        output[i] = input[i];
    }
}

void SolfeggioResonator::reset() { mPhase = 0.0f; mPrevOutput = 0.0f; }

}} // namespace