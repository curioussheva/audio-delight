#pragma once

#include "FFTConvolver.h"

namespace pristine {

class PartitionedConvolver {
public:

    void prepare(
        int blockSize
    );

    void reset();

private:

    FFTConvolver mFFT;
};

} // namespace pristine