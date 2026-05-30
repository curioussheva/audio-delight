// =====================================================
// core/AudioTypes.h
// =====================================================

#pragma once

#include <cstdint>

namespace pristine {

// =====================================================
// SAMPLE TYPE
// =====================================================

using Sample = float;

// =====================================================
// CHANNEL LAYOUT
// =====================================================

enum class ChannelLayout : uint8_t {

    Mono  = 1,
    Stereo = 2
};

// =====================================================
// PROCESSING MODE
// =====================================================

enum class ProcessingMode : int32_t {

    BitPerfect = 0,
    DSP = 1,
    Immersive = 2
};

// =====================================================
// AUDIO ROUTE
// =====================================================

enum class AudioRoute : int32_t {

    Wired = 0,
    Bluetooth,
    USBExclusive,
    Default
};

// =====================================================
// STREAM STATE
// =====================================================

enum class StreamState : uint8_t {

    Stopped = 0,
    Starting,
    Running,
    Stopping,
    Error
};

// =====================================================
// AUDIO FORMAT
// =====================================================

enum class AudioFormat : uint8_t {

    PCM16 = 0,
    PCM24,
    PCM32,
    Float32
};

// =====================================================
// PERFORMANCE MODE
// =====================================================

enum class PerformanceMode : uint8_t {

    LowLatency = 0,
    PowerSaving
};

// =====================================================
// VISUALIZER MODE
// =====================================================

enum class VisualizerMode : uint8_t {

    Waveform = 0,
    Spectrum = 1
};

// =====================================================
// OUTPUT DEVICE TYPE
// =====================================================

enum class OutputDeviceType : uint8_t {

    Speaker = 0,
    WiredHeadset,
    Bluetooth,
    USBDAC
};

// =====================================================
// DSP PARAMETERS
// =====================================================

struct DSPParameters {

    // =============================================
    // EQUALIZER
    // =============================================

    float eqGains[10] = {
        0.0f
    };

    float bassBoostGain =
        0.0f;

    // =============================================
    // OUTPUT
    // =============================================

    float masterGain =
        1.0f;

    float balance =
        0.0f;

    float stereoWidth =
        1.0f;

    // =============================================
    // FLAGS
    // =============================================

    bool dspEnabled =
        true;

    bool limiterEnabled =
        true;

    // =============================================
    // IMMERSIVE AUDIO LAB
    // =============================================

    float solfeggioFreq =
        528.0f;

    float brainwaveFreq =
        0.0f;

    float resonanceIntensity =
        0.5f;
};

// =====================================================
// STEREO FRAME
// =====================================================

struct StereoFrame {

    Sample left  = 0.0f;
    Sample right = 0.0f;
};

// =====================================================
// AUDIO BUFFER VIEW
// =====================================================

struct AudioBufferView {

    Sample* data = nullptr;

    int32_t frames = 0;

    int32_t channels = 2;
};

// =====================================================
// INTERLEAVED BUFFER VIEW
// =====================================================

struct InterleavedBufferView {

    Sample* data = nullptr;

    int32_t samples = 0;
};

// =====================================================
// LATENCY INFO
// =====================================================

struct LatencyInfo {

    float inputMs  = 0.0f;
    float outputMs = 0.0f;
    float totalMs  = 0.0f;
};

// =====================================================
// DEVICE INFO
// =====================================================

struct AudioDeviceInfo {

    OutputDeviceType type =
        OutputDeviceType::Speaker;

    AudioRoute route =
        AudioRoute::Default;

    int32_t sampleRate =
        48000;

    int32_t channelCount =
        2;

    bool exclusive =
        false;
};

// =====================================================
// ENGINE CONFIG
// =====================================================

struct EngineConfig {

    ProcessingMode mode =
        ProcessingMode::DSP;

    AudioFormat format =
        AudioFormat::Float32;

    PerformanceMode performance =
        PerformanceMode::LowLatency;

    int32_t sampleRate =
        48000;

    int32_t channelCount =
        2;

    int32_t framesPerCallback =
        192;

    bool exclusiveMode =
        false;
};

} // namespace pristine 