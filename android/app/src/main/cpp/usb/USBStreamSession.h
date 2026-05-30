#pragma once
#include <cstdint>

namespace audio {

class USBStreamSession {
public:
    bool start(int sampleRate, int framesPerBurst);
    void stop();
    bool write(const float* data, int32_t numFrames);
    bool isActive() const;
private:
    bool mActive = false;
};

} // namespace audio