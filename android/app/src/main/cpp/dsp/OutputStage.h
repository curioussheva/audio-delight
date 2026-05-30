// =====================================================
// dsp/OutputStage.h
// Final Output Processing Stage
// =====================================================

#pragma once

#include "DCBlocker.h"
#include "Limiter.h"
#include "GainProcessor.h"

namespace pristine {

class OutputStage {
public:

    OutputStage() = default;

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int sampleRate
    );

    void reset();

    // =============================================
    // PROCESS
    // =============================================

    void process(
        float* left,
        float* right,
        int32_t numFrames
    );

    // =============================================
    // CONTROL
    // =============================================

    void setGain(
        float gain
    );

    void setBalance(
        float balance
    );

    void setLimiterEnabled(
        bool enabled
    );

private:

    // =============================================
    // DSP MODULES
    // =============================================

    GainProcessor mGain;

    Limiter mLimiter;

    DCBlocker mDCLeft;
    DCBlocker mDCRight;

    // =============================================
    // STATE
    // =============================================

    bool mLimiterEnabled = true;

    int mSampleRate = 48000;
};

} // namespace pristine