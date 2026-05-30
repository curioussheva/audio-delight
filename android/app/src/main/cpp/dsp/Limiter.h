#pragma once

#include <cmath>

namespace pristine {

class Limiter {
public:

    static inline float softClip(
        float x
    ) {

        return
            x /
            (
                1.0f +
                fabsf(x)
            );
    }

    static inline void process(
        float* left,
        float* right,
        int count
    ) {

        for (int i = 0; i < count; ++i) {

            left[i] =
                softClip(left[i]);

            right[i] =
                softClip(right[i]);
        }
    }
};

}