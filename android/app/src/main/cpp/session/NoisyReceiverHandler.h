#pragma once
#include <functional>

namespace pristine {

class NoisyReceiverHandler {
public:
    static NoisyReceiverHandler& get();
    void registerNoisyCallback(std::function<void()> callback);
    void startListening();
    void stopListening();
private:
    NoisyReceiverHandler() = default;
};

} // namespace pristine