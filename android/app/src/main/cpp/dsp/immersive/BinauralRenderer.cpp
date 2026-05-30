#include "BinauralRenderer.h"

namespace audio { namespace dsp {

BinauralRenderer::BinauralRenderer() = default;
void BinauralRenderer::setAzimuth(float degrees) { mAzimuth = degrees; }
void BinauralRenderer::setElevation(float degrees) { mElevation = degrees; }
void BinauralRenderer::process(const float* monoInput, float* outLeft, float* outRight, int32_t numFrames) {
    // stub: copy input to both channels
    for (int32_t i = 0; i < numFrames; ++i) {
        outLeft[i] = monoInput[i];
        outRight[i] = monoInput[i];
    }
}
void BinauralRenderer::reset() {}

}} // namespace