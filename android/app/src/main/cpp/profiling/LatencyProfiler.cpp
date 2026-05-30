#include "LatencyProfiler.h"

namespace pristine {

void LatencyProfiler::start() {
    mStart = std::chrono::steady_clock::now();
}

void LatencyProfiler::end() {
    auto end = std::chrono::steady_clock::now();
    mLatencyMs = std::chrono::duration<float, std::milli>(end - mStart).count();
}

float LatencyProfiler::getLatencyMs() const {
    return mLatencyMs;
}

} // namespace pristine