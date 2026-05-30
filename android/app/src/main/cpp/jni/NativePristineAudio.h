#pragma once

#include <memory>

#include <jsi/jsi.h>
#include <react/bridging/Bridging.h>
#include <react/nativemodule/core/ReactCommon/TurboModule.h>

#include <PristineAudioSpec.h>

namespace facebook::react {

// =====================================================
// TURBOMODULE
// =====================================================

class NativePristineAudio final
    : public NativePristineAudioSpecJSI {

public:

    explicit NativePristineAudio(
        std::shared_ptr<CallInvoker> jsInvoker
    );

    ~NativePristineAudio() override = default;

    // =================================================
    // ENGINE
    // =================================================

    void startEngine(
        jsi::Runtime& rt
    ) override;

    void stopEngine(
        jsi::Runtime& rt
    ) override;

    bool isRunning(
        jsi::Runtime& rt
    ) override;

    // =================================================
    // DSP
    // =================================================

    void setEqBand(
        jsi::Runtime& rt,
        double band,
        double gainDb
    ) override;

    void setBassBoost(
        jsi::Runtime& rt,
        double gainDb
    ) override;

    void setMasterGain(
        jsi::Runtime& rt,
        double gain
    ) override;

    void setStereoWide(
        jsi::Runtime& rt,
        double width
    ) override;

    void setBalance(
        jsi::Runtime& rt,
        double balance
    ) override;

    void setDSPEnabled(
        jsi::Runtime& rt,
        bool enabled
    ) override;

    void setLimiterEnabled(
        jsi::Runtime& rt,
        bool enabled
    ) override;

    // =================================================
    // MODE
    // =================================================

    void setProcessingMode(
        jsi::Runtime& rt,
        double mode
    ) override;

    void setExclusiveMode(
        jsi::Runtime& rt,
        bool enabled
    ) override;

    // =================================================
    // METRICS
    // =================================================

    double getLatency(
        jsi::Runtime& rt
    ) override;

    double getUnderruns(
        jsi::Runtime& rt
    ) override;

    double getOverruns(
        jsi::Runtime& rt
    ) override;
};

} // namespace facebook::react 