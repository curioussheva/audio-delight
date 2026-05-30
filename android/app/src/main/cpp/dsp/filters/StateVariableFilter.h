#pragma once

namespace pristine {

class StateVariableFilter {
public:

    enum Mode {
        LowPass,
        BandPass,
        HighPass
    };

    void prepare(
        float sampleRate
    );

    void setFrequency(
        float frequency
    );

    void setResonance(
        float resonance
    );

    void setMode(
        Mode mode
    );

    void reset();

    float process(
        float input
    );

private:

    void update();

private:

    float mSampleRate = 48000.0f;

    float mFrequency = 1000.0f;
    float mResonance = 0.707f;

    float mF = 0.0f;

    float mLow = 0.0f;
    float mBand = 0.0f;

    Mode mMode = LowPass;
};

} // namespace pristine