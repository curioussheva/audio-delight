#include "DSPBenchmark.h"
#include <chrono>
#include <android/log.h>

namespace pristine {

void DSPBenchmark::run(const std::string& testName, std::function<void()> testFunc, int iterations) {
    (void)testName; (void)testFunc; (void)iterations;
    // stub
}

} // namespace pristine