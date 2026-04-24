#include "AudioEngine.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PristineEngine", __VA_ARGS__)

// ==========================================
// IMPLEMENTASI BIQUAD FILTER
// ==========================================

void BiquadFilter::setPeakingEQ(float freq, float Q, float gainDb, float sampleRate) {
    float A = powf(10.0f, gainDb / 40.0f);
    float omega = 2.0f * (float)M_PI * freq / sampleRate;
    float alpha = sinf(omega) / (2.0f * Q);
    
    float a0 = 1.0f + alpha / A;
    coeffs.b0 = (1.0f + alpha * A) / a0;
    coeffs.b1 = (-2.0f * cosf(omega)) / a0;
    coeffs.b2 = (1.0f - alpha * A) / a0;
    coeffs.a1 = (-2.0f * cosf(omega)) / a0;
    coeffs.a2 = (1.0f - alpha / A) / a0;
}

void BiquadFilter::setLowShelf(float freq, float Q, float gainDb, float sampleRate) {
    float A = powf(10.0f, gainDb / 40.0f);
    float omega = 2.0f * (float)M_PI * freq / sampleRate;
    float alpha = sinf(omega) / (2.0f * Q);
    float cosW = cosf(omega);
    float sqrtA2 = 2.0f * sqrtf(A) * alpha;

    float a0 = (A + 1.0f) + (A - 1.0f) * cosW + sqrtA2;
    coeffs.b0 = (A * ((A + 1.0f) - (A - 1.0f) * cosW + sqrtA2)) / a0;
    coeffs.b1 = (2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosW)) / a0;
    coeffs.b2 = (A * ((A + 1.0f) - (A - 1.0f) * cosW - sqrtA2)) / a0;
    coeffs.a1 = (-2.0f * ((A - 1.0f) + (A + 1.0f) * cosW)) / a0;
    coeffs.a2 = ((A + 1.0f) + (A - 1.0f) * cosW - sqrtA2) / a0;
}

float BiquadFilter::process(float in) {
    float out = in * coeffs.b0 + z1;
    z1 = in * coeffs.b1 + z2 - coeffs.a1 * out;
    z2 = in * coeffs.b2 - coeffs.a2 * out;
    return out;
}

// ==========================================
// IMPLEMENTASI AUDIO ENGINE
// ==========================================

AudioEngine::AudioEngine() : mStream(nullptr) { // Tambahkan inisialisasi nullptr
    mBuffer.resize(kBufferSize, 0.0f);
    recalculateFilters(); 
}

void AudioEngine::recalculateFilters() {
    float freqs[] = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    for(int i = 0; i < 10; i++) {
        mEqBandsLeft[i].setPeakingEQ(freqs[i], 1.414f, mEqGains[i], mSampleRate);
        mEqBandsRight[i].setPeakingEQ(freqs[i], 1.414f, mEqGains[i], mSampleRate);
    }
    mBassBoostLeft.setLowShelf(100.0f, 0.707f, mBassBoostGain, mSampleRate);
    mBassBoostRight.setLowShelf(100.0f, 0.707f, mBassBoostGain, mSampleRate);
}

void AudioEngine::start() {
    oboe::AudioStreamBuilder builder;
    builder.setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive)
           ->setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(oboe::ChannelCount::Stereo)
           // Konversi otomatis jika file lagu vs DAC hardware beda format
           ->setSampleRateConversionAllowed(true)
           ->setFormatConversionAllowed(true)
           ->setChannelConversionAllowed(true)
           ->setCallback(this)
           ->openStream(&mStream);
           
    if (mStream != nullptr) {
        mSampleRate = mStream->getSampleRate();
        LOGD("Oboe Stream Started. Actual Sample Rate: %f", mSampleRate);
        
        recalculateFilters(); // Pastikan filter menggunakan sample rate aslinya DAC
        mStream->requestStart();
    } else {
        LOGD("Failed to open Oboe stream");
    }
}

void AudioEngine::pushData(const float *data, int32_t numSamples) {
    // Menulis data dari ExoPlayer ke dalam Ring Buffer
    for (int i = 0; i < numSamples; ++i) {
        mBuffer[mWriteIndex.load() & kBufferMask] = data[i];
        mWriteIndex.fetch_add(1);
    }
}

oboe::DataCallbackResult AudioEngine::onAudioReady(oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) {
    float *output = static_cast<float *>(audioData);
    
    // Cache local variables
    float masterGain = mMasterGain.load();
    float balance = mBalance.load();
    float stereoWide = mStereoWide.load();

    for (int i = 0; i < numFrames; ++i) {
        // Cek apakah ada data di buffer (mencegah underrun)
        if (mWriteIndex.load() - mReadIndex.load() >= 2) {
            
            // Baca buffer menggunakan bitwise masking (sangat cepat)
            float left = mBuffer[mReadIndex.load() & kBufferMask];
            mReadIndex.fetch_add(1);
            float right = mBuffer[mReadIndex.load() & kBufferMask];
            mReadIndex.fetch_add(1);

            // 1. DSP: 10-Band EQ
            for(int b = 0; b < 10; b++) {
                left = mEqBandsLeft[b].process(left);
                right = mEqBandsRight[b].process(right);
            }

            // 2. DSP: Bass Boost
            left = mBassBoostLeft.process(left);
            right = mBassBoostRight.process(right);

            // 3. DSP: Stereo Widener (Mid-Side Processing)
            float mid = (left + right) * 0.5f;
            float side = (left - right) * 0.5f * stereoWide;
            left = mid + side;
            right = mid - side;

            // 4. DSP: Balance & Gain
            float gainL = masterGain * (1.0f - std::max(0.0f, balance));
            float gainR = masterGain * (1.0f - std::max(0.0f, -balance));

            output[i * 2] = left * gainL;
            output[i * 2 + 1] = right * gainR;
            
        } else {
            // Buffer kosong (mengeluarkan silence agar stream tidak error)
            output[i * 2] = 0.0f;
            output[i * 2 + 1] = 0.0f;
        }
    }
    return oboe::DataCallbackResult::Continue;
}

void AudioEngine::onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) {
    LOGD("Oboe stream closed with error: %d", error);
    if (error == oboe::Result::ErrorDisconnected) {
        // Otomatis restart stream saat DAC / Headphone dicolok atau dicabut
        start(); 
    }
}

// ==========================================
// FUNGSI SETTER UNTUK JNI / TURBOMODULES
// ==========================================

void AudioEngine::setEqBand(int band, float gainDb) {
    if (band < 0 || band > 9) return;
    mEqGains[band] = gainDb; // Simpan nilai untuk recalculate
    float freqs[] = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    mEqBandsLeft[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
    mEqBandsRight[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
}

void AudioEngine::setBassBoost(float gainDb) {
    mBassBoostGain = gainDb; 
    mBassBoostLeft.setLowShelf(100.0f, 0.707f, gainDb, mSampleRate);
    mBassBoostRight.setLowShelf(100.0f, 0.707f, gainDb, mSampleRate);
}

void AudioEngine::setMasterGain(float gain) { 
    mMasterGain.store(gain); 
}

void AudioEngine::setBalance(float balance) { 
    mBalance.store(balance); 
}

void AudioEngine::setStereoWide(float width) { 
    mStereoWide.store(width); 
}

void AudioEngine::setExclusiveMode(bool enabled) {
    // Akan diimplementasikan jika ingin memaksa mode eksklusif di-restart on the fly
}
 
 std::vector<float> AudioEngine::getVisualizerData() {
    std::vector<float> data(128, 0.0f);
    uint32_t currentRead = mReadIndex.load();
    uint32_t currentWrite = mWriteIndex.load();

    // Pastikan ada cukup data (minimal 128 sample) sebelum mengambil
    if (currentWrite - currentRead >= 128) {
        for (int i = 0; i < 128; ++i) {
            data[i] = mBuffer[(currentRead - 128 + i) & kBufferMask];
        }
    }
    return data;
}
