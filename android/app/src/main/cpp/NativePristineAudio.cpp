#include "NativePristineAudio.h"
#include "AudioEngine.h"
#include <jni.h>

namespace facebook::react {

// Kita buat instance global agar state audio tetap terjaga selama aplikasi hidup
static AudioEngine gAudioEngine;

NativePristineAudio::NativePristineAudio(std::shared_ptr<CallInvoker> jsInvoker)
    : NativePristineAudioSpecJSI(jsInvoker) {}

// Implementasi fungsi startEngine
void NativePristineAudio::startEngine(jsi::Runtime &rt) {
    gAudioEngine.start();
}

// Implementasi fungsi stopEngine (Opsional, pastikan ada di .h)
void NativePristineAudio::stopEngine(jsi::Runtime &rt) {
    // gAudioEngine.stop(); 
}

// Implementasi setEqBand
void NativePristineAudio::setEqBand(jsi::Runtime &rt, double band, double gainDb) {
    gAudioEngine.setEqBand(static_cast<int>(band), static_cast<float>(gainDb));
}

// Implementasi setMasterGain
void NativePristineAudio::setMasterGain(jsi::Runtime &rt, double gain) {
    gAudioEngine.setMasterGain(static_cast<float>(gain));
}

// Implementasi Bass Boost
void NativePristineAudio::setBassBoost(jsi::Runtime &rt, double gainDb) {
    gAudioEngine.setBassBoost(static_cast<float>(gainDb));
}

// Implementasi Stereo Wide
void NativePristineAudio::setStereoWide(jsi::Runtime &rt, double width) {
    gAudioEngine.setStereoWide(static_cast<float>(width));
}

} // namespace facebook::react
