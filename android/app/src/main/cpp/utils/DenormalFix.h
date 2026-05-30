#pragma once
#include <cmath>

namespace pristine {

inline float zapDenormal(float x) {
    return std::fabs(x) < 1e-15f ? 0.0f : x;
}

} // namespace pristine