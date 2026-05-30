#pragma once

namespace pristine {

enum class DecoderState {
    Idle,
    Opened,
    Decoding,
    Seeking,
    EndOfStream,
    Error
};

} // namespace pristine