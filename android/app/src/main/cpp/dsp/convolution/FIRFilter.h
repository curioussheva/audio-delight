#pragma once

#include <vector>

namespace pristine {

class FIRFilter {
public:

    void setKernel(
        const std::vector<float>& kernel
    );

    void reset();

    float process(
        float input
    );

    inline bool empty() const {
        return mKernel.empty();
    }

private:

    std::vector<float> mKernel;
    std::vector<float> mDelay;

    int mPos = 0;
};

} // namespace pristine