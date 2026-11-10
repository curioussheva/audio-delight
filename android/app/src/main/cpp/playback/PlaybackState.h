#pragma once

#include "PlaybackTypes.h"

#include <atomic>

namespace pristine::playback {

// =====================================================
// THREAD SAFE PLAYBACK STATE
// =====================================================
//
// 🔥 DIPANGKAS (2026-11-10, dead-code playback): yang tersisa hanya status
// + posisi — dua hal yang benar-benar dibaca (JNI nativeGetPosition /
// nativeGetStatus dan updatePlaybackState internal). Dihapus (0 pemakai):
// PlaybackSnapshot + snapshot(), setQueueInfo, setBuffering/isBuffering,
// set/getPlaybackRate, get/setRepeatMode, get/setShuffleMode,
// get/set/clearCurrentTrack — beserta member-nya (repeat_, shuffle_,
// buffering_, rate_, queueIndex_, queueLength_, currentTrack_, trackMutex_).
// Mode repeat/shuffle hidup di TrackQueue (bukan di sini); laju hidup di
// PlaybackController::playbackRate_ (P-M9); currentTrack_ hanya ditulis
// updatePlaybackState tanpa satu pun pembaca (write-only).
class PlaybackState {
public:

    PlaybackState() = default;

    ~PlaybackState() = default;

    PlaybackState(
        const PlaybackState&
    ) = delete;

    PlaybackState& operator=(
        const PlaybackState&
    ) = delete;

    PlaybackState(
        PlaybackState&&
    ) = delete;

    PlaybackState& operator=(
        PlaybackState&&
    ) = delete;

    // =====================================
    // STATUS
    // =====================================

    [[nodiscard]]
    PlaybackStatus
    getStatus() const noexcept {

        return status_.load(
            std::memory_order_acquire
        );
    }

    void setStatus(
        PlaybackStatus status
    ) noexcept {

        status_.store(
            status,
            std::memory_order_release
        );
    }

    // =====================================
    // POSITION
    // =====================================

    [[nodiscard]]
    PlaybackPosition
    getPosition() const noexcept {

        PlaybackPosition pos;

        pos.positionMs =
            positionMs_.load(
                std::memory_order_acquire
            );

        pos.durationMs =
            durationMs_.load(
                std::memory_order_acquire
            );

        return pos;
    }

    void setPosition(
        uint64_t positionMs
    ) noexcept {

        positionMs_.store(
            positionMs,
            std::memory_order_release
        );
    }

    void setDuration(
        uint64_t durationMs
    ) noexcept {

        durationMs_.store(
            durationMs,
            std::memory_order_release
        );
    }

private:

    // Playback status

    std::atomic<PlaybackStatus>
        status_{
            PlaybackStatus::Stopped
        };

    // Position

    std::atomic<uint64_t>
        positionMs_{0};

    std::atomic<uint64_t>
        durationMs_{0};
};

} // namespace pristine::playback
