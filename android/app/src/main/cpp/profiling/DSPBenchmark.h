#pragma once
#include <functional>
#include <string>

namespace pristine {

class DSPBenchmark {
public:
    void run(const std::string& testName, std::function<void()> testFunc, int iterations);
};

} // namespace pristine