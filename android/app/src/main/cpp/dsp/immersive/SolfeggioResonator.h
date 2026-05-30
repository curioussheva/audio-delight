#pragma once
#include <cstdint>

namespace audio { namespace dsp {

class SolfeggioResonator {
public:
    SolfeggioResonator();
    void setFrequency(float hz);
    void setIntensity(float intensity); // 0-1
    void process(const float* input, float* output, int32_t numFrames, bool mixDry = true);
    void reset();

private:
    float mFreq = 528.0f;
    float mIntensity = 0.5f;
    float mPhase = 0.0f;
    float mPrevOutput = 0.0f;
    float mSampleRate = 48000.0f;
};

}} // namespace