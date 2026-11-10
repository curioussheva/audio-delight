package com.pristineaudio.app

import android.app.Application
import android.content.res.Configuration
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import com.pristineaudio.PristineAudioPackage

class MainApplication : Application(), ReactApplication {

    init {
        Log.d("PristineApp", "MainApplication init")
        // 🔥 LAZY LOAD (2026-11-10): System.loadLibrary TIDAK lagi di sini.
        // Dulu baris ini memuat ~40MB .so di main thread saat cold start.
        // Sekarang load terjadi di NativeLibrary.ensureLoaded(), saat
        // pertama kali ada panggilan native (JS thread).
    }

    override val reactHost: ReactHost by lazy {
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(this).packages.apply {
                add(PristineAudioPackage())
            }
        )
    }

    override fun onCreate() {
        super.onCreate()
        Log.d("PristineApp", "onCreate")
        loadReactNative(this)
        ApplicationLifecycleDispatcher.onApplicationCreate(this)
        Log.d("PristineApp", "onCreate done")
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }
} 