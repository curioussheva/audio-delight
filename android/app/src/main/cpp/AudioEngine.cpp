#include "AudioEngine.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PristineEngine", __VA_ARGS__)

// --- IMPLEMENTASI BIQUAD FILTER ---

void BiquadFilter::setPeakingEQ(float freq, float Q, float gainDb, float sampleRate) {
    float A = powf(10.0f, gainDb / 40.0f);
    float omega = 2.0f * M_PI * freq / sampleRate;
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
    float omega = 2.0f * M_PI * freq / sampleRate;
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

// --- IMPLEMENTASI AUDIO ENGINE ---

AudioEngine::AudioEngine() {
    mBuffer.resize(48000 * 4); // Buffer untuk ~4 detik stereo (mencegah underrun)
    
    // Inisialisasi frekuensi EQ standar (Flat 0dB)
    float freqs[] = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    for(int i = 0; i < 10; i++) {
        mEqBandsLeft[i].setPeakingEQ(freqs[i], 1.414f, 0.0f, mSampleRate);
        mEqBandsRight[i].setPeakingEQ(freqs[i], 1.414f, 0.0f, mSampleRate);
    }
    mBassBoostLeft.setLowShelf(100.0f, 0.707f, 0.0f, mSampleRate);
    mBassBoostRight.setLowShelf(100.0f, 0.707f, 0.0f, mSampleRate);
}

void AudioEngine::start() {
    oboe::AudioStreamBuilder builder;
    builder.setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive) // Jalur langsung DAC
           ->setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(oboe::ChannelCount::Stereo)
           ->setCallback(this)
           ->openStream(&mStream);
           
    mSampleRate = mStream->getSampleRate();
    LOGD("Oboe Stream Started. Sample Rate: %f", mSampleRate);
    mStream->requestStart();
}

void AudioEngine::pushData(const float *data, int32_t numSamples) {
    for (int i = 0; i < numSamples; ++i) {
        mBuffer[mWriteIndex % mBuffer.size()] = data[i];
        mWriteIndex++;
    }
}

oboe::DataCallbackResult AudioEngine::onAudioReady(oboe::AudioStream *audioStream, void *audioData, int32_t numFrames) {
    float *output = static_cast<float *>(audioData);
    
    // Cache atomic variables secara lokal untuk performa
    float masterGain = mMasterGain.load();
    float balance = mBalance.load();
    float stereoWide = mStereoWide.load();

    for (int i = 0; i < numFrames; ++i) {
        if (mReadIndex + 1 < mWriteIndex) {
            // Ambil sample L dan R (Interleaved)
            float left = mBuffer[mReadIndex++ % mBuffer.size()];
            float right = mBuffer[mReadIndex++ % mBuffer.size()];

            // 1. Eksekusi 10-Band EQ
            for(int b = 0; b < 10; b++) {
                left = mEqBandsLeft[b].process(left);
                right = mEqBandsRight[b].process(right);
            }

            // 2. Eksekusi Bass Boost (Low-shelf)
            left = mBassBoostLeft.process(left);
            right = mBassBoostRight.process(right);

            // 3. Eksekusi Soundstage (Stereo Widener / Mid-Side Processing)
            float mid = (left + right) * 0.5f;
            float side = (left - right) * 0.5f * stereoWide;
            left = mid + side;
            right = mid - side;

            // 4. Eksekusi Balance & Master Gain
            float gainL = masterGain * (1.0f - std::max(0.0f, balance));
            float gainR = masterGain * (1.0f - std::max(0.0f, -balance));

            output[i * 2] = left * gainL;
            output[i * 2 + 1] = right * gainR;
        } else {
            // Jika buffer kosong (ExoPlayer telat kirim data), keluarkan silence
            output[i * 2] = 0.0f;
            output[i * 2 + 1] = 0.0f;
        }
    }
    return oboe::DataCallbackResult::Continue;
}

// --- FUNGSI SETTER UNTUK JNI ---

void AudioEngine::setEqBand(int band, float gainDb) {
    if (band < 0 || band > 9) return;
    float freqs[] = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    mEqBandsLeft[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
    mEqBandsRight[band].setPeakingEQ(freqs[band], 1.414f, gainDb, mSampleRate);
}

void AudioEngine::setBassBoost(float gainDb) {
    mBassBoostLeft.setLowShelf(100.0f, 0.707f, gainDb, mSampleRate);
    mBassBoostRight.setLowShelf(100.0f, 0.707f, gainDb, mSampleRate);
}

void AudioEngine::setMasterGain(float gain) { mMasterGain.store(gain); }
void AudioEngine::setBalance(float balance) { mBalance.store(balance); }
void AudioEngine::setStereoWide(float width) { mStereoWide.store(width); }
 