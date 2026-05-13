#include "AudioEngine.h"
#include <android/log.h>
#include <cstring>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PristineEngine", __VA_ARGS__)

// ================= BIQUAD =================

void BiquadFilter::setPeakingEQ(float freq, float Q, float gainDb, float sr) {
    float A = powf(10.0f, gainDb / 40.0f);
    float w = 2.0f * M_PI * freq / sr;
    float alpha = sinf(w) / (2.0f * Q);

    float a0 = 1 + alpha / A;

    coeffs.b0 = (1 + alpha * A) / a0;
    coeffs.b1 = (-2 * cosf(w)) / a0;
    coeffs.b2 = (1 - alpha * A) / a0;
    coeffs.a1 = (-2 * cosf(w)) / a0;
    coeffs.a2 = (1 - alpha / A) / a0;
}

void BiquadFilter::setLowShelf(float freq, float Q, float gainDb, float sr) {
    float A = powf(10.0f, gainDb / 40.0f);
    float w = 2.0f * M_PI * freq / sr;
    float alpha = sinf(w) / (2.0f * Q);
    float cosW = cosf(w);
    float beta = 2 * sqrtf(A) * alpha;

    float a0 = (A + 1) + (A - 1) * cosW + beta;

    coeffs.b0 = A * ((A + 1) - (A - 1) * cosW + beta) / a0;
    coeffs.b1 = 2 * A * ((A - 1) - (A + 1) * cosW) / a0;
    coeffs.b2 = A * ((A + 1) - (A - 1) * cosW - beta) / a0;
    coeffs.a1 = -2 * ((A - 1) + (A + 1) * cosW) / a0;
    coeffs.a2 = ((A + 1) + (A - 1) * cosW - beta) / a0;
}

float BiquadFilter::process(float in) {
    float out = in * coeffs.b0 + z1;
    z1 = in * coeffs.b1 + z2 - coeffs.a1 * out;
    z2 = in * coeffs.b2 - coeffs.a2 * out;
    return out;
}

// ================= ENGINE =================

AudioEngine::AudioEngine() {
    mBuffer.resize(kBufferSize, 0.0f);
    mVizBuffer.resize(kVizSize, 0.0f);
    recalculateFilters();
}

void AudioEngine::start() {
    if (mRunning.load()) return;

    oboe::AudioStreamBuilder builder;

    builder.setPerformanceMode(oboe::PerformanceMode::LowLatency)
        ->setSharingMode(mExclusiveMode.load()
            ? oboe::SharingMode::Exclusive
            : oboe::SharingMode::Shared)
        ->setFormat(oboe::AudioFormat::Float)
        ->setChannelCount(oboe::ChannelCount::Stereo)
        ->setCallback(this);

    if (builder.openStream(&mStream) != oboe::Result::OK || !mStream) {
        LOGD("Failed to open stream");
        return;
    }

    mSampleRate = mStream->getSampleRate();
    recalculateFilters();

    mReadIndex = 0;
    mWriteIndex = 0;

    mRunning = true;
    mStream->requestStart();
}

void AudioEngine::stop() {
    mRunning = false;

    if (mStream) {
        mStream->requestStop();
        mStream->close();
        mStream = nullptr;
    }
}

// ================= AUDIO INPUT =================

void AudioEngine::pushData(const float *data, int32_t numSamples) {
    uint32_t write = mWriteIndex.load();
    uint32_t read  = mReadIndex.load();

    if ((write - read) > kBufferSize - numSamples) {
        mReadIndex.store(write - kBufferSize / 2);
    }

    for (int i = 0; i < numSamples; i++) {
        mBuffer[write & kBufferMask] = data[i];
        write++;
    }

    mWriteIndex.store(write);
}

// ================= DSP =================

inline void AudioEngine::processDSP(float &left, float &right) {
    for (int i = 0; i < 10; i++) {
        left = mEqBandsLeft[i].process(left);
        right = mEqBandsRight[i].process(right);
    }

    left = mBassBoostLeft.process(left);
    right = mBassBoostRight.process(right);

    float mid = (left + right) * 0.5f;
    float side = (left - right) * 0.5f * mStereoWide.load();

    left = mid + side;
    right = mid - side;
}

inline float AudioEngine::softClip(float x) {
    return tanhf(x);
}

// ================= CALLBACK =================

oboe::DataCallbackResult AudioEngine::onAudioReady(
    oboe::AudioStream *,
    void *audioData,
    int32_t numFrames) {

    float *out = static_cast<float *>(audioData);

    if (!mRunning.load()) {
        memset(out, 0, sizeof(float) * numFrames * 2);
        return oboe::DataCallbackResult::Continue;
    }

    uint32_t read = mReadIndex.load();

    for (int i = 0; i < numFrames; i++) {

        float left = 0.0f;
        float right = 0.0f;

        if (mWriteIndex.load() - read >= 2) {
            left  = mBuffer[read & kBufferMask]; read++;
            right = mBuffer[read & kBufferMask]; read++;
        }

        // 🔥 MODE SWITCH
        if (mProcessingMode.load() == DSP) {
            processDSP(left, right);

            float gain = mMasterGain.load();
            float balance = mBalance.load();

            float gainL = gain * (1.0f - std::max(0.0f, balance));
            float gainR = gain * (1.0f - std::max(0.0f, -balance));

            left  = softClip(left * gainL);
            right = softClip(right * gainR);
        }

        // write output
        out[i * 2]     = left;
        out[i * 2 + 1] = right;

        // 🔥 push to visualizer (AFTER processing)
        uint32_t vizIndex = mVizWrite.load();
        mVizBuffer[vizIndex & kVizMask] = (left + right) * 0.5f;
        mVizWrite.store(vizIndex + 1);
    }

    mReadIndex.store(read);
    return oboe::DataCallbackResult::Continue;
}

// ================= VISUALIZER =================

std::vector<float> AudioEngine::getVisualizerData() {
    std::vector<float> out(256, 0.0f);

    uint32_t write = mVizWrite.load();

    for (int i = 0; i < 256; i++) {
        out[i] = mVizBuffer[(write - 256 + i) & kVizMask];
    }

    return out;
}

// ================= CONTROL =================

void AudioEngine::setProcessingMode(int mode) {
    mProcessingMode.store(mode);
}

void AudioEngine::setExclusiveMode(bool enabled) {
    mExclusiveMode.store(enabled);
}

void AudioEngine::setEqBand(int band, float gainDb) {
    if (band < 0 || band > 9) return;

    mEqGains[band] = gainDb;

    float freqs[10] = {31,62,125,250,500,1000,2000,4000,8000,16000};

    mEqBandsLeft[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
    mEqBandsRight[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
}

void AudioEngine::setBassBoost(float gainDb) {
    mBassBoostGain = gainDb;

    mBassBoostLeft.setLowShelf(100, 0.707f, gainDb, mSampleRate);
    mBassBoostRight.setLowShelf(100, 0.707f, gainDb, mSampleRate);
}

void AudioEngine::setMasterGain(float g) {
    mMasterGain.store(g);
}

void AudioEngine::setBalance(float b) {
    mBalance.store(b);
}

void AudioEngine::setStereoWide(float w) {
    mStereoWide.store(w);
}

void AudioEngine::recalculateFilters() {
    float freqs[10] = {31,62,125,250,500,1000,2000,4000,8000,16000};

    for (int i = 0; i < 10; i++) {
        mEqBandsLeft[i].setPeakingEQ(freqs[i], 1.414f, mEqGains[i], mSampleRate);
        mEqBandsRight[i].setPeakingEQ(freqs[i], 1.414f, mEqGains[i], mSampleRate);
    }

    setBassBoost(mBassBoostGain);
}

void AudioEngine::onErrorAfterClose(
    oboe::AudioStream *,
    oboe::Result error) {

    LOGD("Stream error: %d", error);

    if (error == oboe::Result::ErrorDisconnected) {
        stop();
        start();
    }
} 