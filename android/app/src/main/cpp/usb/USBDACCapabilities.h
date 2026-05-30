#pragma once
#include <vector>
#include <cstdint>

namespace pristine {

struct USBDACCapabilities {
    std::vector<int32_t> supportedSampleRates;
    int32_t bitsPerSample = 32;
    bool supportsDSD = false;
    bool supportsExclusive = true;
};

} // namespace pristine