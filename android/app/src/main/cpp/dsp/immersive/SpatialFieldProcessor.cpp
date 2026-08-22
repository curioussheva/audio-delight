#include "SpatialFieldProcessor.h"

namespace pristine { namespace dsp {

SpatialFieldProcessor::SpatialFieldProcessor() = default;
void SpatialFieldProcessor::setWidth(float width) { mWidth = width; }
void SpatialFieldProcessor::setDepth(float depth) { mDepth = depth; }
void SpatialFieldProcessor::process(float* left, float* right, int32_t numFrames) {
    // stub: do nothing
    (void)left; (void)right; (void)numFrames;
}
void SpatialFieldProcessor::reset() { mPrevL = mPrevR = 0.0f; }

}} // namespace