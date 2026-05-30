#pragma once
#include <functional>

namespace pristine {

class AudioSessionManager {
public:
    static AudioSessionManager& get();
    bool requestAudioFocus();
    void abandonAudioFocus();
    void setOnAudioFocusChange(std::function<void(int focusChange)> callback);
private:
    AudioSessionManager() = default;
};

} // namespace pristine