#include <DefaultComponentsRegistry.h>
#include <DefaultTurboModuleManagerDelegate.h>
#include <FBReactNativeSpec.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>
#include <autolinking.h>
#include <fbjni/fbjni.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

#include "PristineAudioSpec.h"

namespace facebook::react {

std::shared_ptr<TurboModule> appModulesProvider(
    const std::string& moduleName,
    const JavaTurboModule::InitParams& params) {
  auto pristine = PristineAudioSpec_ModuleProvider(moduleName, params);
  if (pristine != nullptr) {
    return pristine;
  }
  auto core = FBReactNativeSpec_ModuleProvider(moduleName, params);
  if (core != nullptr) {
    return core;
  }
  return autolinking_ModuleProvider(moduleName, params);
}

std::shared_ptr<TurboModule> appModulesCxxProvider(
    const std::string& moduleName,
    const std::shared_ptr<CallInvoker>& jsInvoker) {
  return autolinking_cxxModuleProvider(moduleName, jsInvoker);
}

void appModulesRegisterProviders(
    std::shared_ptr<const ComponentDescriptorProviderRegistry> registry) {
  autolinking_registerProviders(registry);
}

} // namespace facebook::react

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider =
        &facebook::react::appModulesCxxProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
        &facebook::react::appModulesProvider;
    facebook::react::DefaultComponentsRegistry::
        registerComponentDescriptorsFromEntryPoint =
            &facebook::react::appModulesRegisterProviders;
  });
}