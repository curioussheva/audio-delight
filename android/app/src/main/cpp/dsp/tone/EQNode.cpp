#include "EQNode.h"

namespace pristine {

void EQNode::prepare(
    int,
    int
) {
}

void EQNode::reset() {

    mEQ.reset();
}

void EQNode::process(
    float* left,
    float* right,
    int count
) {

    mEQ.process(
        left,
        right,
        count
    );
}

EQProcessor&
EQNode::processor() {

    return mEQ;
}

} // namespace pristine