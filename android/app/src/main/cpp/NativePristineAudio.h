#pragma once

#include <PristineAudioSpec.h> // Hasil generate Codegen

namespace facebook::react {

class NativePristineAudio : public NativePristineAudioSpecJSI {
public:
  NativePristineAudio(std::shared_ptr<CallInvoker> jsInvoker);

  void startEngine(jsi::Runtime &rt) override;
  void stopEngine(jsi::Runtime &rt) override;
  void setEqBand(jsi::Runtime &rt, double band, double gainDb) override;
  void setMasterGain(jsi::Runtime &rt, double gain) override;
  void setBassBoost(jsi::Runtime &rt, double gainDb) override;
  void setStereoWide(jsi::Runtime &rt, double width) override;
};

} // namespace facebook::react
