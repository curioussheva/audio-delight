#pragma once
#include <string>
#include <chrono>

namespace pristine {

class CPUProfiler {
public:
    void beginSample(const std::string& name);
    void endSample();
    void report();
};

} // namespace pristine