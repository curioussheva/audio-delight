#include <DefaultComponentsRegistry.h>
#include <DefaultTurboModuleManagerDelegate.h>
#include <FBReactNativeSpec.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>
#include <autolinking.h>
#include <fbjni/fbjni.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <android/log.h>

#include "PristineAudioSpec.h"
#include "manager/EngineManager.h"
#include "decoder/ContentUriResolver.h"
#include "core/DeviceRateDetector.h"
#include "devices/AudioDeviceManager.h"
#include "playback/NativeEventEmitter.h"
 
#undef LOG_TAG
#define LOG_TAG "PristineJNI"

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
  auto result = facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider =
        &facebook::react::appModulesCxxProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
        &facebook::react::appModulesProvider;
    facebook::react::DefaultComponentsRegistry::
        registerComponentDescriptorsFromEntryPoint =
            &facebook::react::appModulesRegisterProviders;
  });

  // Simpan JavaVM untuk resolver URI content:// di lapisan dekoder.
  // Tanpa ini, FFmpegDecoder tidak bisa membuka content:// dan pemutaran
  // gagal pada trek pertama yang belum di-resolve sisi Kotlin.
  ::pristine::decoder::ContentUriResolver::init(vm);

  // Detector laju juga butuh JavaVM untuk membaca kapabilitas device/DAC
  // lewat AudioManager. Tanpa ini, laju stream terpaksa dipatok 48000.
  ::pristine::audio::setDeviceRateDetectorVm(vm);

  // AudioDeviceManager juga butuh JavaVM untuk membaca daftar device output
  // nyata (termasuk DAC USB) lewat AudioManager.
  ::pristine::setAudioDeviceManagerVm(vm);

  // Simpan JavaVM untuk emit event native→JS (track ended).
  ::pristine::playback::initJavaVm(vm);

  // ⚠️ JANGAN start engine di sini.
  //
  // 🔥 FIX (2026-10-07): dulu baris ini memanggil EngineManager::get().start()
  // saat library dimuat. Akibatnya stream audio dibuka SEBELUM ada track, dan
  // pada saat itu laju file belum diketahui sehingga stream memakai laju
  // tertinggi perangkat. play() lalu menemukan engine sudah running dan tidak
  // pernah membukanya ulang - jadi pemilihan laju per-file (pickBestRate)
  // tidak pernah berpengaruh, dan file 44.1 kHz di-resample naik ke laju DAC.
  //
  // Bit-perfect butuh stream dibuka di laju track. Engine sekarang dinyalakan
  // oleh transport (nativePlay -> EngineManager::start()) setelah queue terisi
  // dan track dimuat.
  __android_log_print(ANDROID_LOG_INFO, LOG_TAG,
      "JNI_OnLoad — EngineManager siap (start ditunda sampai track dimuat)");

  return result;
}
 