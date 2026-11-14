#include "StereoWidenerNode.h"

#include "../StereoWidener.h"

namespace pristine {

void StereoWidenerNode::prepare(
    int,
    int
) {
}

void StereoWidenerNode::reset() {

    // (B14-E3): snap ke target — sesudah reset tidak ada sapuan dari
    // nilai lama. Sama seperti GainNode::reset().
    mWidth = mTarget;
}

void StereoWidenerNode::process(
    float* left,
    float* right,
    int count
) {

    if (
        !left ||
        !right ||
        count <= 0
    ) {
        mWidth = mTarget;
        return;
    }

    // Sudah di target: jalur biasa (di width 1,0 StereoWidener::process
    // bypass bit-exact).
    if (mWidth == mTarget) {

        StereoWidener::process(
            left,
            right,
            count,
            mWidth
        );

        return;
    }

    // (B14-E3): ramp linear sepanjang buffer menuju target — geser slider
    // lebar tidak lagi melompat seketika (zipper). mWidth = mTarget di
    // akhir untuk membuang sisa pembulatan.
    const float step =
        (mTarget - mWidth) / static_cast<float>(count);

    for (int i = 0; i < count; ++i) {

        mWidth += step;

        const float mid =
            (left[i] + right[i]) * 0.5f;

        const float side =
            (left[i] - right[i]) * 0.5f * mWidth;

        left[i] = mid + side;
        right[i] = mid - side;
    }

    mWidth = mTarget;
}

void StereoWidenerNode::setWidth(
    float width
) {

    mTarget = width;
}

// =====================================================
// APPLY CONFIG
// =====================================================

void StereoWidenerNode::applyConfig(
    const DSPConfig& config
) {

    setWidth(
        config.stereoWidth
    );
}

} // namespace pristine