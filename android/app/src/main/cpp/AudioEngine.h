#pragma once
#include <oboe/Oboe.h>
#include <vector>
#include <atomic>
#include <cmath>
#include <algorithm>

// --- STRUKTUR DSP ---
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
    BiquadCoefficients coeffs = {1.0f, 0.0f, 0.0f, 0.0f, 0.0f};
};

// --- AUDIO ENGINE ---
class AudioEngine : public oboe::AudioStreamCallback {
public:
    AudioEngine();
    void start();
    void pushData(const float *data, int32_t numSamples);
    
    // Setters untuk TurboModules/JNI
    void setEqBand(int bandIndex, float gainDb);
    void setBassBoost(float gainDb);
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);
    void setExclusiveMode(bool enabled);

    // Oboe Callbacks
    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) override;
    void onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) override;

private:
    oboe::AudioStream *mStream = nullptr;
    float mSampleRate = 48000.0f;
    
    // Optimasi Ring Buffer menggunakan Pangkat 2 (Bitwise Masking)
    static constexpr uint32_t kBufferSize = 131072; // 2^17 (cukup untuk buffer panjang tanpa lag)
    static constexpr uint32_t kBufferMask = kBufferSize - 1;
    
    std::vector<float> mBuffer;
    std::atomic<uint32_t> mWriteIndex{0};
    std::atomic<uint32_t> mReadIndex{0};

    // DSP States (Dipisah Kiri & Kanan)
    BiquadFilter mEqBandsLeft[10];
    BiquadFilter mEqBandsRight[10];
    BiquadFilter mBassBoostLeft;
    BiquadFilter mBassBoostRight;

    // Parameter Audio (Atomic untuk thread-safety)
    std::atomic<float> mMasterGain{1.0f};
    std::atomic<float> mBalance{0.0f};
    std::atomic<float> mStereoWide{1.0f};

    // Cache nilai dB untuk rekalkulasi jika Sample Rate berubah (DAC ditukar)
    float mEqGains[10] = {0.0f};
    float mBassBoostGain = 0.0f;
    
    void recalculateFilters();
};
 