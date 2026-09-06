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
        Log.d("PristineApp", "MainApplication init block called")
        System.loadLibrary("pristine-audio")
        Log.d("PristineApp", "Library pristine-audio loaded")
    }

    override val reactHost: ReactHost by lazy {
        Log.d("PristineApp", "Creating ReactHost via lazy")
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(this).packages.apply {
                add(PristineAudioPackage())
            }
        )
    }

    override fun onCreate() {
        super.onCreate()
        Log.d("PristineApp", "MainApplication onCreate called")
        loadReactNative(this)
        Log.d("PristineApp", "loadReactNative completed")
        ApplicationLifecycleDispatcher.onApplicationCreate(this)
        Log.d("PristineApp", "ApplicationLifecycleDispatcher completed")
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }
} 