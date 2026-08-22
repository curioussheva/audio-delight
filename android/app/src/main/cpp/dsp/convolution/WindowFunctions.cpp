#include "WindowFunctions.h"
#include <cmath>
#include <algorithm>
#include <vector>

namespace audio {

std::vector<float> createHanningWindow(int size) {
    std::vector<float> w(size);
    for (int i = 0; i < size; ++i) {
        w[i] = 0.5f * (1.0f - cosf(2.0f * M_PI * i / (size - 1)));
    }
    return w;
}

std::vector<float> createHammingWindow(int size) {
    std::vector<float> w(size);
    for (int i = 0; i < size; ++i) {
        w[i] = 0.54f - 0.46f * cosf(2.0f * M_PI * i / (size - 1));
    }
    return w;
}

std::vector<float> createBlackmanWindow(int size) {
    std::vector<float> w(size);
    for (int i = 0; i < size; ++i) {
        w[i] = 0.42f - 0.5f * cosf(2.0f * M_PI * i / (size - 1)) + 0.08f * cosf(4.0f * M_PI * i / (size - 1));
    }
    return w;
}

std::vector<float> createRectangularWindow(int size) {
    return std::vector<float>(size, 1.0f);
}

} // namespace audio