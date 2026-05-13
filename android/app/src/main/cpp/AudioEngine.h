#pragma once

#include <oboe/Oboe.h>
#include <vector>
#include <atomic>
#include <cmath>
#include <algorithm>

// ================= DSP =================

struct BiquadCoefficients {
    float b0, b1, b2, a1, a2;
};

class BiquadFilter {
public:
    void setPeakingEQ(float freq, float Q, float gainDb, float sampleRate);
    void setLowShelf(float freq, float Q, float gainDb, float sampleRate);
    float process(float input);

private:
    float z1 = 0.0f, z2 = 0.0f;
    BiquadCoefficients coeffs{1, 0, 0, 0, 0};
};

// ================= ENGINE =================

class AudioEngine : public oboe::AudioStreamCallback {
public:
    enum ProcessingMode {
        BIT_PERFECT = 0,
        DSP = 1
    };

public:
    AudioEngine();

    // lifecycle
    void start();
    void stop();
    bool isRunning() const { return mRunning.load(); }

    // audio input
    void pushData(const float *data, int32_t numSamples);

    // DSP control
    void setEqBand(int band, float gainDb);
    void setBassBoost(float gainDb);
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);

    // mode
    void setProcessingMode(int mode);
    void setExclusiveMode(bool enabled);

    // visualizer
    std::vector<float> getVisualizerData();

    // callback
    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream *stream,
        void *audioData,
        int32_t numFrames) override;

    void onErrorAfterClose(
        oboe::AudioStream *stream,
        oboe::Result error) override;

private:
    void recalculateFilters();
    inline void processDSP(float &left, float &right);
    inline float softClip(float x);

private:
    oboe::AudioStream *mStream = nullptr;
    float mSampleRate = 48000.0f;

    std::atomic<bool> mRunning{false};
    std::atomic<bool> mExclusiveMode{false};
    std::atomic<int>  mProcessingMode{DSP};

    // ring buffer
    static constexpr uint32_t kBufferSize = 131072;
    static constexpr uint32_t kBufferMask = kBufferSize - 1;

    std::vector<float> mBuffer;
    std::atomic<uint32_t> mWriteIndex{0};
    std::atomic<uint32_t> mReadIndex{0};

    // visualizer buffer (REAL OUTPUT)
    static constexpr uint32_t kVizSize = 2048;
    static constexpr uint32_t kVizMask = kVizSize - 1;

    std::vector<float> mVizBuffer;
    std::atomic<uint32_t> mVizWrite{0};

    // DSP
    BiquadFilter mEqBandsLeft[10];
    BiquadFilter mEqBandsRight[10];
    BiquadFilter mBassBoostLeft;
    BiquadFilter mBassBoostRight;

    std::atomic<float> mMasterGain{1.0f};
    std::atomic<float> mBalance{0.0f};
    std::atomic<float> mStereoWide{1.0f};

    float mEqGains[10]{0};
    float mBassBoostGain = 0.0f;
}; 