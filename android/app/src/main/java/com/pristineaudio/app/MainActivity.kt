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

        // 🔥 FIX (2026-10-10): react-native-screens + Android 16 fragment restore.
        //
        // super.onCreate(null) TIDAK CUKUP. Android 16 dengan launchMode
        // singleTask menyimpan fragment state di Activity record milik sistem
        // (di luar savedInstanceState). Saat process di-kill OOM lalu user
        // buka app dari recent apps, FragmentManager.attachHost() me-restore
        // ScreenStackFragment via no-arg constructor → throw
        // "Screen fragments should never be restored".
        //
        // FragmentState.instantiate() butuh FragmentManager ada & ter-attach.
        // Kita kosongkan fragment state yang tersimpan di saved state registry
        // SEBELUM super.onCreate() merestorasinya. Kunci: lakukan di
        // attachBaseContext / sebelum super.onCreate chain manapun yang
        // memanggil FragmentActivity.onCreate.
        //
        // Pendekatan yang robust: jangan biarkan FragmentActivity menyimpan
        // state fragment sama sekali — override onSaveInstanceState untuk
        // membuangnya (lihat bawah).
        super.onCreate(null)
        Log.d("PristineApp", "MainActivity onCreate finished")
    }

    // 🔥 FIX (2026-10-10): jangan persist fragment state ke Activity record.
    //
    // Ini akar masalahnya: FragmentActivity.onSaveInstanceState() menulis
    // FRAGMENTS_TAG ke outState. Android 16 singleTask menyimpan outState ini
    // ke ActivityManager even setelah process kill, lalu attachHost() me-restore
    // walaupun onCreate terima null (state datang dari sistem, bukan bundle).
    //
    // Dengan membuang entry FRAGMENTS_TAG, tidak ada yang bisa di-restore.
    // Safe: React Native rebuild seluruh UI JS dari JS bundle — fragment state
    // native tidak pernah dipakai untuk logika app.
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.remove("android:support:fragments")
        Log.d("PristineApp", "onSaveInstanceState: fragment state removed")
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