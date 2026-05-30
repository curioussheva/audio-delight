#include "CallbackTimer.h"
#include <thread>

namespace pristine {

CallbackTimer::CallbackTimer() = default;
CallbackTimer::~CallbackTimer() { stop(); }

void CallbackTimer::start(std::function<void()> callback, std::chrono::microseconds interval) {
    stop();
    mCallback = callback;
    mInterval = interval;
    mRunning = true;
    mThread = std::thread(&CallbackTimer::run, this);
}

void CallbackTimer::stop() {
    mRunning = false;
    if (mThread.joinable()) mThread.join();
}

void CallbackTimer::run() {
    while (mRunning) {
        std::this_thread::sleep_for(mInterval);
        if (mRunning && mCallback) mCallback();
    }
}

} // namespace pristine