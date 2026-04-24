package com.pristineaudio.app

import android.app.Application
import android.content.res.Configuration

// CRITICAL: Pastikan import ini mengarah ke package ID yang benar!
import com.pristineaudio.app.BuildConfig 

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import com.pristineaudio.USBDACPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Add custom native modules
              add(USBDACPackage())
            }

        override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        
        // Memastikan flag New Arch diambil dari build.gradle via BuildConfig
        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    // 1. Inisialisasi SoLoader dengan Merged So Mapping (Performa New Arch)
    SoLoader.init(this, OpenSourceMergedSoMapping)

    // 2. Konfigurasi Entry Point New Architecture
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
        DefaultNewArchitectureEntryPoint.releaseLevel = try {
          ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
        } catch (e: IllegalArgumentException) {
          ReleaseLevel.STABLE
        }
        // Opsional: Beberapa versi membutuhkan pemanggilan .load() secara eksplisit
        // DefaultNewArchitectureEntryPoint.load() 
    }

    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
