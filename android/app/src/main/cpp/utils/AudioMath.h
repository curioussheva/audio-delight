#pragma once
#include <cmath>
#include <algorithm>

namespace pristine {

inline float dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

inline float linearToDb(float lin) {
    return 20.0f * std::log10(lin + 1e-12f);
}

inline float clamp(float x, float min, float max) {
    return std::max(min, std::min(x, max));
}

} // namespace pristine