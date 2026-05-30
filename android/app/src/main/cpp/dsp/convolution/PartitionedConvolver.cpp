#include "PartitionedConvolver.h"

namespace pristine {

void PartitionedConvolver::prepare(
    int blockSize
) {

    mFFT.prepare(
        blockSize * 2
    );
}

void PartitionedConvolver::reset() {

    mFFT.reset();
}

} // namespace pristine