#pragma once
#include <cstdint>

namespace pristine { namespace dsp {

enum class BrainwaveType {
    DELTA, THETA, ALPHA, BETA, GAMMA
};

class BrainwaveGenerator {
public:
    BrainwaveGenerator();
    void setType(BrainwaveType type);
    void setVolume(float volume);
    void generate(float* left, float* right, int32_t numFrames, float sampleRate);
    void reset();

private:
    BrainwaveType mType = BrainwaveType::ALPHA;
    float mVolume = 0.2f;
    float mPhaseL = 0.0f, mPhaseR = 0.0f;
};

}} // namespace