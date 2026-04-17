#pragma once
#include <oboe/Oboe.h>
#include <vector>
#include <atomic>
#include <cmath>
#include <algorithm>

struct BiquadCoefficients {
    float b0, b1, b2, a1, a2;
};

class BiquadFilter {
public:
    void setPeakingEQ(float freq, float Q, float gainDb, float sampleRate);
    void setLowShelf(float freq, float Q, float gainDb, float sampleRate);
    float process(float input);
private:
    float z1 = 0.0f, z2 = 0.0f; // State memori filter
    BiquadCoefficients coeffs = {1.0f, 0.0f, 0.0f, 0.0f, 0.0f};
};

class AudioEngine : public oboe::AudioStreamDataCallback {
public:
    AudioEngine();
    void start();
    void pushData(const float *data, int32_t numSamples);
    
    // Setters untuk JNI
    void setEqBand(int bandIndex, float gainDb);
    void setBassBoost(float gainDb);
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);
    void setExclusiveMode(bool enabled);

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) override;

private:
    oboe::AudioStream *mStream = nullptr;
    float mSampleRate = 48000.0f;
    
    // Lock-free Ring Buffer sederhana
    std::vector<float> mBuffer;
    std::atomic<int32_t> mWriteIndex{0};
    std::atomic<int32_t> mReadIndex{0};

    // DSP States (DIPISAH KIRI & KANAN)
    BiquadFilter mEqBandsLeft[10];
    BiquadFilter mEqBandsRight[10];
    BiquadFilter mBassBoostLeft;
    BiquadFilter mBassBoostRight;

    // Parameter Audio
    std::atomic<float> mMasterGain{1.0f};
    std::atomic<float> mBalance{0.0f};
    std::atomic<float> mStereoWide{1.0f};
};
 