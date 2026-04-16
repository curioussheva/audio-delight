#ifndef PRISTINE_AUDIO_ENGINE_H
#define PRISTINE_AUDIO_ENGINE_H

#include <oboe/Oboe.h>
#include <vector>
#include <atomic>

class AudioEngine : public oboe::AudioStreamCallback {
public:
    AudioEngine();
    bool start();
    void stop();

    // Fungsi baru untuk menerima data dari Java/JNI
    void pushData(const float* data, int32_t numSamples);

    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream *audioStream,
        void *audioData,
        int32_t numFrames) override;

private:
    std::shared_ptr<oboe::AudioStream> mStream;

    // Ring Buffer Implementation
    std::vector<float> mBuffer;
    std::atomic<int32_t> mReadIndex{0};
    std::atomic<int32_t> mWriteIndex{0};
    const int32_t kBufferCapacity = 8192 * 8; // Kapasitas sekitar 65k samples
};

#endif 