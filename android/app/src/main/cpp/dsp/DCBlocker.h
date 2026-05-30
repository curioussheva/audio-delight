#pragma once

#include <cmath>

namespace pristine {

class DCBlocker {
public:

    inline float process(
        float input
    ) {

        const float output =
            input -
            mPrevInput +
            (0.995f * mPrevOutput);

        mPrevInput = input;
        mPrevOutput = output;

        return output;
    }

    inline void reset() {

        mPrevInput = 0.0f;
        mPrevOutput = 0.0f;
    }

private:

    float mPrevInput = 0.0f;
    float mPrevOutput = 0.0f;
};

}