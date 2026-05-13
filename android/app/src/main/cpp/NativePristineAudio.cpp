#include "NativePristineAudio.h"
#include "AudioEngine.h"
#include <jni.h>
#include <memory>
#include <mutex>
#include "EngineManager.h"

namespace facebook::react {

// ==========================================
// GLOBAL ENGINE (SAFE VERSION)
// ==========================================

static std::unique_ptr<AudioEngine> gEngine = nullptr;
static std::mutex gEngineMutex;

// Helper: ensure engine exists
static AudioEngine* getEngine() {
    std::lock_guard<std::mutex> lock(gEngineMutex);
    if (!gEngine) {
        gEngine = std::make_unique<AudioEngine>();
    }
    return gEngine.get();
}

// ==========================================
// CONSTRUCTOR
// ==========================================

NativePristineAudio::NativePristineAudio(std::shared_ptr<CallInvoker> jsInvoker)
    : NativePristineAudioSpecJSI(jsInvoker) {}


// ==========================================
// ENGINE CONTROL
// ==========================================

void NativePristineAudio::startEngine(jsi::Runtime &rt) {
    getEngine()->start();
}

void NativePristineAudio::stopEngine(jsi::Runtime &rt) {
    if (gEngine) {
        gEngine->stop();
    }
}

// Optional: destroy (kalau mau clean reload)
void NativePristineAudio::destroyEngine(jsi::Runtime &rt) {
    std::lock_guard<std::mutex> lock(gEngineMutex);
    if (gEngine) {
        gEngine->stop();
        gEngine.reset();
    }
}


// ==========================================
// DSP CONTROL
// ==========================================

void NativePristineAudio::setEqBand(jsi::Runtime &rt, double band, double gainDb) {
    getEngine()->setEqBand((int)band, (float)gainDb);
}

void NativePristineAudio::setMasterGain(jsi::Runtime &rt, double gain) {
    getEngine()->setMasterGain((float)gain);
}

void NativePristineAudio::setBassBoost(jsi::Runtime &rt, double gainDb) {
    getEngine()->setBassBoost((float)gainDb);
}

void NativePristineAudio::setStereoWide(jsi::Runtime &rt, double width) {
    getEngine()->setStereoWide((float)width);
}


// ==========================================
// MODE CONTROL (🔥 CORE FEATURE)
// ==========================================

void NativePristineAudio::setProcessingMode(jsi::Runtime &rt, int mode) {
    // 0 = BIT PERFECT (bypass DSP)
    // 1 = DSP ENABLED
    getEngine()->setProcessingMode(mode);
}


// ==========================================
// VISUALIZER (🔥 UX FEATURE)
// ==========================================

jsi::Array NativePristineAudio::getVisualizerData(jsi::Runtime &rt) {
    auto data = getEngine()->getVisualizerData();

    jsi::Array result(rt, data.size());
    for (size_t i = 0; i < data.size(); i++) {
        result.setValueAtIndex(rt, i, data[i]);
    }

    return result;
}

} // namespace facebook::react 