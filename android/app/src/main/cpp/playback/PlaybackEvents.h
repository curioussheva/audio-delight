#pragma once

#include <string>

#include "TransportState.h"

namespace pristine {

class PlaybackEvents {
public:

    virtual ~PlaybackEvents() = default;

    virtual void onTransportChanged(
        TransportState
    ) {}

    virtual void onPlaybackCompleted() {}

    virtual void onPlaybackError(
        const std::string&
    ) {}

    virtual void onBufferingStateChanged(
        bool
    ) {}
};

} // namespace pristine