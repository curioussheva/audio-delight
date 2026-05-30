#pragma once

#include <atomic>

namespace pristine {

class DSPNode {
public:

    virtual ~DSPNode() = default;

    virtual void prepare(
        int sampleRate,
        int maxFrames
    ) = 0;

    virtual void reset() = 0;

    virtual void process(
        float* left,
        float* right,
        int frames
    ) = 0;

    // =====================================
    // BYPASS
    // =====================================

    inline void setEnabled(
        bool enabled
    ) {

        mEnabled.store(
            enabled,
            std::memory_order_release
        );
    }

    inline bool isEnabled() const {

        return mEnabled.load(
            std::memory_order_acquire
        );
    }

protected:

    std::atomic<bool> mEnabled{true};
};

} // namespace pristine 