#pragma once

#include <cmath>
#include <vector>

namespace pristine {

// =====================================================
// FREE-FUNCTION WINDOW GENERATORS
// Return a full window buffer of the given size.
// =====================================================

std::vector<float> createHanningWindow(int size);
std::vector<float> createHammingWindow(int size);
std::vector<float> createBlackmanWindow(int size);
std::vector<float> createRectangularWindow(int size);

class WindowFunctions {
public:

    static inline float hann(
        int n,
        int size
    ) {

        return 0.5f *
               (
                   1.0f -
                   cosf(
                       2.0f *
                       M_PI *
                       n /
                       (size - 1)
                   )
               );
    }

    static inline float blackman(
        int n,
        int size
    ) {

        constexpr float a0 = 0.42f;
        constexpr float a1 = 0.5f;
        constexpr float a2 = 0.08f;

        const float phase =
            2.0f *
            M_PI *
            n /
            (size - 1);

        return
            a0 -
            a1 * cosf(phase) +
            a2 * cosf(2.0f * phase);
    }
};

} // namespace pristine