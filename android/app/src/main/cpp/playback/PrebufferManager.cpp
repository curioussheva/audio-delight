#include "PrebufferManager.h"

#include "../utils/Logger.h"

namespace pristine::playback {

// =====================================================
// CONSTRUCTOR
// =====================================================

PrebufferManager::PrebufferManager(
    DecoderFactory factory
)
    : decoderFactory_(
        std::move(factory)
    ) {
}

// =====================================================
// DESTRUCTOR
// =====================================================

PrebufferManager::~PrebufferManager() {

    cancel();

    if (
        worker_.joinable()
    ) {
        worker_.join();
    }
}

// =====================================================
// START
// =====================================================

void PrebufferManager::startPrebuffer(
    const TrackInfo& track,
    uint64_t maxFrames
) {

    cancel();

    if (
        worker_.joinable()
    ) {
        worker_.join();
    }

    decodedFrames_.store(
        0,
        std::memory_order_release
    );

    targetFrames_.store(
        maxFrames,
        std::memory_order_release
    );

    cancelRequested_.store(
        false,
        std::memory_order_release
    );

    state_.store(
        PrebufferState::Running,
        std::memory_order_release
    );

    worker_ = std::thread(
        &PrebufferManager::decodeLoop,
        this,
        track,
        maxFrames
    );
}

// =====================================================
// CANCEL
// =====================================================

void PrebufferManager::cancel() {

    cancelRequested_.store(
        true,
        std::memory_order_release
    );

    state_.store(
        PrebufferState::Cancelled,
        std::memory_order_release
    );
}

// =====================================================
// STATE
// =====================================================

PrebufferState
PrebufferManager::state() const noexcept {

    return state_.load(
        std::memory_order_acquire
    );
}

bool PrebufferManager::isReady() const noexcept {

    return
        state() ==
        PrebufferState::Ready;
}

// =====================================================
// PROGRESS
// =====================================================

float PrebufferManager::progress() const noexcept {

    const auto target =
        targetFrames_.load(
            std::memory_order_acquire
        );

    if (target == 0) {
        return 0.0f;
    }

    return static_cast<float>(
        decodedFrames_.load(
            std::memory_order_acquire
        )
    ) / static_cast<float>(
        target
    );
}

// =====================================================
// TAKE PREBUFFER
// =====================================================

std::unique_ptr<PrebufferedTrack>
PrebufferManager::takePrebuffer() {

    std::lock_guard<std::mutex>
        lock(mutex_);

    return std::move(
        prebufferedTrack_
    );
}

// =====================================================
// DECODE LOOP
// =====================================================

void PrebufferManager::decodeLoop(
    TrackInfo track,
    uint64_t maxFrames
) {

    auto decoder =
        decoderFactory_();

    if (!decoder) {

        state_.store(
            PrebufferState::Error,
            std::memory_order_release
        );

        return;
    }

    auto result =
        std::make_unique<
            PrebufferedTrack
        >();

    result->track = track;

    try {

        // -------------------------------------------------
        // TODO:
        // decoder->open(track.uri)
        // decoder->read(...)
        // -------------------------------------------------

        uint64_t totalFrames = 0;

        while (
            !cancelRequested_.load(
                std::memory_order_acquire
            )
        ) {

            // =================================================
            // PLACEHOLDER
            // Replace with actual decoder API
            // =================================================

            constexpr uint32_t
                kChunkFrames = 4096;

            if (
                totalFrames >=
                maxFrames
            ) {
                break;
            }

            const uint64_t framesToCopy =
                std::min<uint64_t>(
                    kChunkFrames,
                    maxFrames -
                    totalFrames
                );

            result->pcmData.resize(
                result->pcmData.size() +
                framesToCopy * 2,
                0.0f
            );

            totalFrames +=
                framesToCopy;

            decodedFrames_.store(
                totalFrames,
                std::memory_order_release
            );
        }

        if (
            cancelRequested_.load(
                std::memory_order_acquire
            )
        ) {

            state_.store(
                PrebufferState::Cancelled,
                std::memory_order_release
            );

            return;
        }

        result->sampleRate =
            48000;

        result->channels =
            2;

        result->totalFrames =
            totalFrames;

        result->complete =
            true;

        {
            std::lock_guard<std::mutex>
                lock(mutex_);

            prebufferedTrack_ =
                std::move(result);
        }

        state_.store(
            PrebufferState::Ready,
            std::memory_order_release
        );
    }
    catch (
        const std::exception& e
    ) {

        {
            std::lock_guard<std::mutex>
                lock(mutex_);

            prebufferedTrack_ =
                std::make_unique<
                    PrebufferedTrack
                >();

            prebufferedTrack_->track =
                track;

            prebufferedTrack_->error =
                e.what();
        }

        state_.store(
            PrebufferState::Error,
            std::memory_order_release
        );
    }
}

} // namespace pristine::playback