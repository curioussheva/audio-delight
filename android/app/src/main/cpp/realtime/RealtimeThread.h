#pragma once
#include <thread>
#include <atomic>
#include <functional>

class RealtimeThread {
public:
    explicit RealtimeThread(std::function<void()> task);
    ~RealtimeThread();
    bool start();               // set thread priority to realtime
    void stop();
    void join();
private:
    std::thread mThread;
    std::function<void()> mTask;
    std::atomic<bool> mRunning{false};
    static void threadEntry(RealtimeThread* self);
};