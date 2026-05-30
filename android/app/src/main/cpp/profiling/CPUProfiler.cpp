#include "CPUProfiler.h"
#include <android/log.h>

namespace pristine {

void CPUProfiler::beginSample(const std::string& name) {
    (void)name;
    // stub
}

void CPUProfiler::endSample() {}
void CPUProfiler::report() {}

} // namespace pristine