#include "USBClockSync.h"

namespace pristine {

void USBClockSync::reset() {
    mDrift = 1.0;
}

double USBClockSync::getDriftRatio() {
    return mDrift;
}

void USBClockSync::updateFeedback(uint32_t feedback) {
    (void)feedback;
    // stub: compute drift
}

} // namespace pristine