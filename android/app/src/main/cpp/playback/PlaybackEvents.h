#pragma once

#include <string>
#include <vector>
#include <algorithm>

#include "TransportState.h"

namespace pristine {
namespace playback {
struct PrebufferRequestedEvent;
struct TransitionRequestedEvent;
}

class PlaybackEvents {
public:
    virtual ~PlaybackEvents() = default;

    virtual void onTransportChanged(TransportState) {}
    virtual void onPlaybackCompleted() {}
    virtual void onPlaybackError(const std::string&) {}
    virtual void onBufferingStateChanged(bool) {}
};

class PlaybackEventListener {
public:
    virtual ~PlaybackEventListener() = default;

    virtual void onPrebufferRequested(const playback::PrebufferRequestedEvent&) {}
    virtual void onTransitionRequested(const playback::TransitionRequestedEvent&) {}
};

class PlaybackEventDispatcher {
public:
    void addListener(PlaybackEventListener* listener) {
        listeners_.push_back(listener);
    }

    void removeListener(PlaybackEventListener* listener) {
        listeners_.erase(
            std::remove(listeners_.begin(), listeners_.end(), listener),
            listeners_.end()
        );
    }

    void dispatch(const playback::PrebufferRequestedEvent& event) {
        for (auto* listener : listeners_) {
            listener->onPrebufferRequested(event);
        }
    }

    void dispatch(const playback::TransitionRequestedEvent& event) {
        for (auto* listener : listeners_) {
            listener->onTransitionRequested(event);
        }
    }

private:
    std::vector<PlaybackEventListener*> listeners_;
};

} // namespace pristine 