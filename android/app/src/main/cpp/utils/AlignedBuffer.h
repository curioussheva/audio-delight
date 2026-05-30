#pragma once
#include <cstdlib>
#include <memory>

template<typename T>
class AlignedBuffer {
public:
    explicit AlignedBuffer(size_t size, size_t alignment = 16)
        : mBuffer(static_cast<T*>(std::aligned_alloc(alignment, size * sizeof(T))), std::free) {
        if (!mBuffer) throw std::bad_alloc();
    }
    T* get() const { return mBuffer.get(); }
    T* operator->() const { return mBuffer.get(); }
private:
    std::unique_ptr<T, decltype(&std::free)> mBuffer;
};