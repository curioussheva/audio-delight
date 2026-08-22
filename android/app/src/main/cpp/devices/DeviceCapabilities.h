#pragma once
#include <vector>
#include <cstdint>

namespace pristine {

struct DeviceCapabilities {
    std::vector<int32_t> supportedSampleRates;
    std::vector<int32_t> supportedChannelCounts;
    bool supportsFloat = true;
    bool supports16bit = true;
};

} // namespace pristine