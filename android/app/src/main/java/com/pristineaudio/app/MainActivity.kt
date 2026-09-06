package com.pristineaudio.app

import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d("PristineApp", "MainActivity onCreate called")
        super.onCreate(savedInstanceState)
        Log.d("PristineApp", "MainActivity onCreate finished")
    }

    override fun getMainComponentName(): String {
        Log.d("PristineApp", "getMainComponentName called, returning 'main'")
        return "main"
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        Log.d("PristineApp", "createReactActivityDelegate called")
        val delegate = object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled
        ) {
            override fun loadApp(appKey: String?) {
                Log.d("PristineApp", "🔴 loadApp called with appKey: $appKey")
                super.loadApp(appKey)
                Log.d("PristineApp", "🔴 loadApp finished")
            }
        }
        return ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, delegate)
    }
}