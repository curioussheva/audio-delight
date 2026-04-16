#include "AudioEngine.h"
#include <android/log.h>

#define LOG_TAG "AudioEngine"

AudioEngine::AudioEngine() {
    mBuffer.resize(kBufferCapacity, 0.0f);
}

bool AudioEngine::start() {
    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Output)
           ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive)
           ->setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(oboe::ChannelCount::Stereo)
           ->setSampleRate(48000) // Atur sample rate target
           ->setCallback(this);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) return false;

    return (mStream->requestStart() == oboe::Result::OK);
}

// Fungsi yang dipanggil oleh JNI feedNativeAudio
oboe::DataCallbackResult AudioEngine::onAudioReady(
    oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) {

    float* output = static_cast<float*>(audioData);
    int32_t numSamplesNeeded = numFrames * audioStream->getChannelCount();

    // Hitung berapa banyak data yang tersedia di buffer
    int32_t availableSamples = mWriteIndex - mReadIndex;

    if (availableSamples < numSamplesNeeded) {
        // Jika data kurang (underrun), kita isi silence agar tidak bunyi 'pop'
        memset(audioData, 0, numSamplesNeeded * sizeof(float));
        return oboe::DataCallbackResult::Continue;
    }

    for (int i = 0; i < numSamplesNeeded; ++i) {
        // Ambil data dari Ring Buffer
        output[i] = mBuffer[mReadIndex % kBufferCapacity];
        mReadIndex++;
    }

    // Safety check: jika read index terlalu jauh tertinggal (lag), loncat ke depan
    // Ini mencegah latency bertambah seiring berjalannya waktu
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