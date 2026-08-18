#pragma once

#include <atomic>
#include <cstdint>

namespace pristine {
namespace dsp {

// Narrowband resonator: menguatkan komponen frekuensi solfeggio yang SUDAH
// ADA di sinyal musik yang sedang main (RBJ constant skirt-gain bandpass,
// wet/dry sesuai intensity). Dipanggil langsung dari ImmersivePipeline
// setiap audio callback — in-place, stereo, real-time safe.
class SolfeggioResonator {
public:
    SolfeggioResonator();

    void prepare(int32_t sampleRate);
    void setFrequency(float hz);        // target solfeggio freq, mis. 528.0f
    void setIntensity(float intensity); // 0-1: jumlah resonansi / wet mix

    // In-place, stereo. left/right masing-masing punya IIR state sendiri
    // (independen) supaya tidak ada crosstalk channel.
    void process(float* left, float* right, int32_t numFrames);

    void reset();

private:
    void updateCoefficientsIfNeeded();
    void processChannel(
        float* channel,
        int32_t numFrames,
        float& x1, float& x2,
        float& y1, float& y2
    );

    // Ditulis dari control thread (JNI), dibaca dari audio thread.
    std::atomic<float> mFreq{528.0f};
    std::atomic<float> mIntensity{0.5f};

    // Audio-thread-only: cache + koefisien biquad.
    float mCachedFreq = -1.0f;
    float mCachedIntensity = -1.0f;
    float mSampleRate = 48000.0f;

    // RBJ bandpass coefficients (constant 0 dB peak gain)
    float mB0 = 0.0f, mB1 = 0.0f, mB2 = 0.0f, mA1 = 0.0f, mA2 = 0.0f;

    // Direct Form I state — terpisah per channel.
    float mLx1 = 0.0f, mLx2 = 0.0f, mLy1 = 0.0f, mLy2 = 0.0f;
    float mRx1 = 0.0f, mRx2 = 0.0f, mRy1 = 0.0f, mRy2 = 0.0f;
};

} // namespace dsp
} // namespace pristine
