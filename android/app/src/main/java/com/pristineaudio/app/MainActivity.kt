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
        Log.d("PristineApp", "MainActivity onCreate")
        // 🔥 FIX: react-native-screens tidak kompatibel dengan Android
        // fragment state restoration. Kalau process di-kill (OOM/lifecycle)
        // lalu Activity di-restore dengan savedInstanceState lama, ini
        // crash: "IllegalStateException: Screen fragments should never
        // be restored". Solusi resmi: selalu pass null supaya semua
        // fragment dibuat fresh, bukan di-restore.
        // Ref: https://github.com/software-mansion/react-native-screens/issues/17
        super.onCreate(null)
        Log.d("PristineApp", "MainActivity onCreate finished")
    }

    override fun getMainComponentName(): String = "main"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        val delegate = object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled
        ) {}
        return ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, delegate)
    }
}