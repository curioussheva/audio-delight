#include "BitPerfectPipeline.h"

namespace pristine {

// =====================================================
// PROCESS
// =====================================================

void BitPerfectPipeline::process(
    float* left,
    float* right,
    int32_t numFrames,
    const DSPParameters& params
) {

    // Explicitly unused
    (void)left;
    (void)right;
    (void)numFrames;
    (void)params;

    // =================================================
    // INTENTIONALLY EMPTY
    //
    // Audio must pass through untouched:
    // - no EQ
    // - no gain
    // - no limiter
    // - no stereo widening
    // - no resampling
    // - no normalization
    // =================================================
}

// =====================================================
// RESET
// =====================================================

void BitPerfectPipeline::reset() {

    // Nothing to reset
}

} // namespace pristine