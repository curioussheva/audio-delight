#include "AudioEngine.h"
#include <android/log.h>

#define LOG_TAG "AudioEngine"

// ==================== GLOBAL POINTER FOR JNI ====================
AudioEngine* gAudioEngine = nullptr;

AudioEngine::AudioEngine() {
    mBuffer.resize(kBufferCapacity, 0.0f);
    gAudioEngine = this;                    // Penting! Agar JNI bisa mengakses engine
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
    int32_t numSamplesNeeded = numFrames * audioStream->getChannelCount();

    int32_t availableSamples = mWriteIndex - mReadIndex;

    if (availableSamples < numSamplesNeeded) {
        // Underrun → isi silence
        memset(audioData, 0, numSamplesNeeded * sizeof(float));
        return oboe::DataCallbackResult::Continue;
    }

    for (int i = 0; i < numSamplesNeeded; ++i) {
        output[i] = mBuffer[mReadIndex % kBufferCapacity];
        mReadIndex++;
    }

    // Prevent latency buildup
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

// ==================== DSP CONTROL METHODS ====================

void AudioEngine::setEqualizerBand(int bandIndex, float gain) {
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, 
        "EQ Band %d set to %.2f dB (not yet implemented)", bandIndex, gain);
    // TODO: Implement real biquad EQ here later
}

void AudioEngine::setBassBoost(float intensity) {
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, 
        "Bass Boost set to %.2f (not yet implemented)", intensity);
    // TODO: Implement low-shelf filter here later
}

void AudioEngine::setExclusiveMode(bool enabled) {
    __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, 
        "Exclusive Mode requested: %s", enabled ? "ON" : "OFF");

    if (!mStream) return;

    // Restart stream dengan sharing mode baru
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

// ==================== PUSH DATA FROM JAVA ====================

void AudioEngine::pushData(const float* data, int32_t numSamples) {
    if (!data || numSamples <= 0) return;

    for (int32_t i = 0; i < numSamples; ++i) {
        mBuffer[mWriteIndex % kBufferCapacity] = data[i];
        mWriteIndex++;
    }

    // Prevent write index from growing too far ahead
    if (mWriteIndex - mReadIndex > kBufferCapacity * 2) {
        mReadIndex = mWriteIndex.load() - kBufferCapacity;
    }
} 