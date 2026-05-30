#include "FIRFilter.h"

namespace pristine {

// =====================================================
// SET KERNEL
// =====================================================

void FIRFilter::setKernel(
    const std::vector<float>& kernel
) {

    mKernel = kernel;

    mDelay.assign(
        kernel.size(),
        0.0f
    );

    mPos = 0;
}

// =====================================================
// RESET
// =====================================================

void FIRFilter::reset() {

    std::fill(
        mDelay.begin(),
        mDelay.end(),
        0.0f
    );

    mPos = 0;
}

// =====================================================
// PROCESS
// =====================================================

float FIRFilter::process(
    float input
) {

    if (mKernel.empty()) {
        return input;
    }

    mDelay[mPos] = input;

    float out = 0.0f;

    int index = mPos;

    for (
        size_t i = 0;
        i < mKernel.size();
        ++i
    ) {

        out +=
            mKernel[i] *
            mDelay[index];

        index--;

        if (index < 0) {
            index =
                static_cast<int>(
                    mKernel.size() - 1
                );
        }
    }

    mPos++;

    if (
        mPos >=
        static_cast<int>(
            mKernel.size()
        )
    ) {
        mPos = 0;
    }

    return out;
}

} // namespace pristine