#pragma once
#include <chrono>

namespace pristine {

class LatencyProfiler {
public:
    void start();
    void end();

    [[nodiscard]]
    float getLatencyMs() const;

private:
    std::chrono::steady_clock::time_point mStart;
    float mLatencyMs = 0.0f;
};

} // namespace pristine
