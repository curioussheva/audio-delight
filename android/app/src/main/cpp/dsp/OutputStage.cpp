// =====================================================
// dsp/OutputStage.cpp
// =====================================================

#include "OutputStage.h"

#include "../core/PanLaw.h"

#include <algorithm>
#include <cmath>

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void OutputStage::prepare(
    int sampleRate
) {

    mSampleRate = sampleRate;

    mGain.prepare(
        sampleRate
    );

    mLimiter.prepare(
        sampleRate
    );
}

// =====================================================
// RESET
// =====================================================

void OutputStage::reset() {

    mGain.reset();

    mLimiter.reset();

    mDCLeft.reset();
    mDCRight.reset();
}

// =====================================================
// PROCESS
// Final audio stage before DAC
// =====================================================

void OutputStage::process(
    float* left,
    float* right,
    int32_t numFrames
) {

    // =============================================
    // GAIN
    // =============================================

    mGain.process(
        left,
        right,
        numFrames
    );

    // =============================================
    // LIMITER
    // =============================================

    if (mLimiterEnabled) {

        mLimiter.process(
            left,
            right,
            numFrames
        );
    }

    // =============================================
    // DC BLOCKER
    // =============================================

    for (
        int32_t i = 0;
        i < numFrames;
        ++i
    ) {

        left[i] =
            mDCLeft.process(
                left[i]
            );

        right[i] =
            mDCRight.process(
                right[i]
            );
    }
}

// =====================================================
// GAIN
// =====================================================

void OutputStage::setGain(
    float gain
) {

    mGain.setGain(
        gain
    );
}

// =====================================================
// BALANCE
// =====================================================

void OutputStage::setBalance(
    float balance
) {

    // (C-PAN, 2026-11-12): hukum pan linear lewat helper bersama
    // (core/PanLaw.h) — rumus sama seperti sebelumnya, hanya dipindah.
    // Perilaku tidak berubah. Catatan: kelas ini saat ini tidak
    // diinstansiasi di mana pun (0 pemakai) — dikonversi supaya
    // "satu hukum" tetap benar bila dipakai lagi.
    const PanGains pan = panLawLinear(balance);

    mGain.setChannelGain(
        pan.left,
        pan.right
    );
}

// =====================================================
// LIMITER
// =====================================================

void OutputStage::setLimiterEnabled(
    bool enabled
) {

    mLimiterEnabled = enabled;
}

} // namespace pristine