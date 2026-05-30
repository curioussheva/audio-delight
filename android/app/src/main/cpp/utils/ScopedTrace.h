#pragma once
#include <string>
#include <chrono>
#include <android/log.h>

namespace pristine {

class ScopedTrace {
public:
    explicit ScopedTrace(const std::string& name) : mName(name) {
        __android_log_print(ANDROID_LOG_DEBUG, "Trace", ">> %s", mName.c_str());
        mStart = std::chrono::steady_clock::now();
    }
    ~ScopedTrace() {
        auto end = std::chrono::steady_clock::now();
        auto us = std::chrono::duration_cast<std::chrono::microseconds>(end - mStart).count();
        __android_log_print(ANDROID_LOG_DEBUG, "Trace", "<< %s took %lld us", mName.c_str(), (long long)us);
    }
private:
    std::string mName;
    std::chrono::steady_clock::time_point mStart;
};

} // namespace pristine