#pragma once
#include <functional>
#include <chrono>
#include <thread>
#include <atomic>

namespace pristine {

class CallbackTimer {
public:
    CallbackTimer();
    ~CallbackTimer();
    void start(std::function<void()> callback, std::chrono::microseconds interval);
    void stop();
private:
    std::thread mThread;
    std::atomic<bool> mRunning{false};
    std::function<void()> mCallback;
    std::chrono::microseconds mInterval;
    void run();
};

} // namespace pristine