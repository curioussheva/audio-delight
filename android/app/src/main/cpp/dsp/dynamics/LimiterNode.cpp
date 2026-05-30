#include "LimiterNode.h"

#include "../Limiter.h"

namespace pristine {

void LimiterNode::prepare(
    int,
    int
) {
}

void LimiterNode::reset() {
}

void LimiterNode::process(
    float* left,
    float* right,
    int count
) {

    Limiter::process(
        left,
        right,
        count
    );
}

} // namespace pristine