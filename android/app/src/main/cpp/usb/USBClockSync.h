#pragma once

#include <cstdint>

namespace pristine {

class USBClockSync {
public:
    void reset();
    double getDriftRatio();   // ratio between USB clock and system clock
    void updateFeedback(uint32_t feedback);
private:
    double mDrift = 1.0;
};

} // namespace pristine