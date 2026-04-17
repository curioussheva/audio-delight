#include "AudioEngine.h"
#include <android/log.h>
#include <cmath>

#define LOG_TAG "AudioEngine"
 
// Global pointer untuk JNI
AudioEngine* gAudioEngine = nullptr;

AudioEngine::AudioEngine() {
    mBuffer.resize(kBufferCapacity, 0.0f);
    gAudioEngine = this;
}

bool AudioEngine::start() {
    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Output)
           ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive)
           ->setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(oboe::ChannelCount::Stereo)
           ->setSampleRate(48000)
           ->setCallback(this);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) {
        __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "Failed to open stream: %d", result);
        return false;
    }

    return (mStream->requestStart() == oboe::Result::OK);
}

oboe::DataCallbackResult AudioEngine::onAudioReady(
    oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) {

    float* output = static_cast<float*>(audioData);
    int32_t numSamplesNeeded = numFrames * 2; // Stereo

    int32_t available = mWriteIndex - mReadIndex;

    if (available < numSamplesNeeded) {
        memset(audioData, 0, numSamplesNeeded * sizeof(float));
        return oboe::DataCallbackResult::Continue;
    }

    for (int i = 0; i < numSamplesNeeded; i += 2) {
        float sample = mBuffer[mReadIndex % kBufferCapacity];
        mReadIndex++;

        // Apply Master Volume & Balance
        float left  = sample * mMasterVolume * (1.0f - mBalance);
        float right = sample * mMasterVolume * (1.0f + mBalance);

        // TODO: Apply EQ, Bass Boost, Reverb, Sound Stage di sini nanti

        output[i]     = left;
        output[i + 1] = right;
    }

    if (mWriteIndex - mReadIndex > kBufferCapacity / 2) {
        mReadIndex = mWriteIndex.load() - numSamplesNeeded;
    }

    return oboe::DataCallbackResult::Continue;
}

void AudioEngine::stop() {
    if (mStream) {
        mStream->stop();
        mStream->close();
    }
}

// ==================== DSP CONTROLS ====================

void AudioEngine::setEqualizerBand(int bandIndex, float gain) {
    if (bandIndex >= 0 && bandIndex < 5) {
        mEqGains[bandIndex] = gain;
        __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "EQ Band %d = %.2f dB", bandIndex, gain);
    }
}

void AudioEngine::setBassBoost(float intensity) {
    mBassBoost = intensity;
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "Bass Boost = %.2f", intensity);
}

void AudioEngine::setReverb(float amount) {
    mReverbAmount = amount;
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "Reverb amount = %.2f", amount);
}

void AudioEngine::setSoundStage(float width) {
    mSoundStageWidth = width;
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "Sound Stage width = %.2f", width);
}

void AudioEngine::setMasterVolume(float volume) {
    mMasterVolume = volume;
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "Master Volume = %.2f", volume);
}

void AudioEngine::setBalance(float balance) {
    mBalance = balance;
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, "Balance = %.2f", balance);
}

void AudioEngine::setExclusiveMode(bool enabled) {
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, 
        "Exclusive Mode requested: %s", enabled ? "ON" : "OFF");

    if (!mStream) return;

    mStream->stop();
    mStream->close();

    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Output)
           ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(enabled ? oboe::SharingMode::Exclusive : oboe::SharingMode::Shared)
           ->setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(oboe::ChannelCount::Stereo)
           ->setSampleRate(48000)
           ->setCallback(this);

    oboe::Result result = builder.openStream(mStream);
    if (result == oboe::Result::OK) {
        mStream->requestStart();
    } else {
        __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "Failed to reopen stream: %d", result);
    }
}

void AudioEngine::pushData(const float* data, int32_t numSamples) {
    if (!data || numSamples <= 0) return;

    for (int32_t i = 0; i < numSamples; ++i) {
        mBuffer[mWriteIndex % kBufferCapacity] = data[i];
        mWriteIndex++;
    }

    if (mWriteIndex - mReadIndex > kBufferCapacity * 2) {
        mReadIndex = mWriteIndex.load() - kBufferCapacity;
    }
}