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

    // === DSP Controls ===
    void setEqualizerBand(int bandIndex, float gain);     // band 0-4 (60Hz, 250Hz, 1kHz, 4kHz, 12kHz)
    void setBassBoost(float intensity);                   // 0.0 - 1.0
    void setReverb(float amount);                         // 0.0 - 1.0 (wet level)
    void setSoundStage(float width);                      // 0.0 - 1.0 (stereo width)
    void setMasterVolume(float volume);                   // 0.0 - 1.0
    void setBalance(float balance);                       // -1.0 (left) ... 1.0 (right)
    void setExclusiveMode(bool enabled);

    // Push audio data from Java
    void pushData(const float* data, int32_t numSamples);

    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream *audioStream,
        void *audioData,
        int32_t numFrames) override;

private:
    std::shared_ptr<oboe::AudioStream> mStream;

    // Ring Buffer
    std::vector<float> mBuffer;
    std::atomic<int32_t> mReadIndex{0};
    std::atomic<int32_t> mWriteIndex{0};
    const int32_t kBufferCapacity = 8192 * 8;

    // DSP Parameters (state)
    float mEqGains[5] = {0.0f};      // 5-band EQ
    float mBassBoost = 0.0f;
    float mReverbAmount = 0.0f;
    float mSoundStageWidth = 1.0f;   // 1.0 = normal stereo
    float mMasterVolume = 1.0f;
    float mBalance = 0.0f;           // -1.0 left, 1.0 right
};

#endif 