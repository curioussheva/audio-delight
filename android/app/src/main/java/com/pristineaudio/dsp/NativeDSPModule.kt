package com.pristineaudio.dsp

import android.content.Context
import android.media.AudioManager
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeDSPModule.NAME)
class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var engineAvailable = false

    companion object {
        const val NAME = "NativeDSPModule"
        private const val TAG = "NativeDSPModule"

        // 🔥 FIX (2026-10-10): batas atas bass boost dalam dB.
        //
        // Slider "INTENSITY" di UI berjalan 0..1000 (persen). Nilai itu
        // dipetakan ke 0..kMaxBassBoostDb sebelum masuk engine C++. Dipilih 12
        // dB supaya sejajar dengan rentang band EQ di UI (-12..+12 dB);
        // nilai lebih besar akan mendorong limiter bekerja terus-menerus.
        private const val kMaxBassBoostDb = 12.0f
    }

    init {
        engineAvailable = try {
            System.loadLibrary("pristine-audio")
            Log.d(TAG, "pristine-audio loaded")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Native library tidak tersedia: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Engine boot gagal: ${e.message}")
            false
        }
    }

    override fun getName() = NAME

    // ===================== JNI EXTERNAL FUNCTIONS =====================

    private external fun setNativeMasterGain(gain: Float)
    private external fun setNativeStereoWide(width: Float)
    private external fun setNativeEqualizerBand(band: Int, gain: Float)
    private external fun setNativeBassBoost(gain: Float)
    private external fun setNativeBalance(balance: Float)
    private external fun toggleNativeExclusiveMode(enabled: Boolean)

    // 🔥 Status stream aktual — lihat isExclusiveModeActive() di bawah.
    private external fun nativeIsExclusiveModeActive(): Boolean
    private external fun nativeGetActualSampleRate(): Int

    // Additional JNI functions (were missing before)
    private external fun setNativeDSPEnabled(enabled: Boolean)
    private external fun setNativeLimiterEnabled(enabled: Boolean)
    private external fun setNativeSolfeggioFreq(freq: Float)
    private external fun setNativeBrainwaveFreq(freq: Float)
    private external fun setNativeResonanceIntensity(intensity: Float)
    private external fun setNativeImmersiveEnabled(enabled: Boolean)

    // Ã°ÂÂÂ¥ Mode pemrosesan (BitPerfect=0, DSP=1, Immersive=2).
    //
    // JNI-nya sudah ada sejak lama (NativeDSPModule.cpp) tapi TIDAK PERNAH
    // di-expose ke Kotlin, sehingga mode ketiga mustahil dipilih dari JS.
    // Itu satu-satunya sebab enum ProcessingMode::Immersive tidak pernah
    // tercapai. Lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.
    private external fun setNativeProcessingMode(mode: Int)

    // Sakelar pemrosesan DSP di jalur produksi.
    //
    // Sebelum 2026-10-07 AudioPipeline tidak pernah dipanggil saat memutar
    // lagu, jadi mode DSP tidak berefek. Menyalakannya mengubah suara yang
    // keluar, jadi dipisah supaya bisa dibandingkan dan dibalik tanpa revert.
    private external fun setNativeDSPProcessingEnabled(enabled: Boolean)

    // ===================== KOREKSI HEADPHONE (Fase D) =====================
    //
    // Teks preset AutoEQ/Squiglink dikirim utuh ke native. Parsing terjadi di
    // sana, di thread pemanggil (bukan audio thread) — lihat
    // AudioEngine::loadHeadphonePreset().
    //
    // nativeLoadHeadphonePreset mengembalikan false kalau preset cacat.
    // Pemanggil WAJIB memeriksa: preset ditolak, bukan diterapkan sebagian.
    private external fun nativeLoadHeadphonePreset(presetText: String): Boolean
    private external fun nativeClearHeadphonePreset()
    private external fun setNativeHeadphoneCorrectionEnabled(enabled: Boolean)
    private external fun nativeIsHeadphoneCorrectionEnabled(): Boolean
    private external fun nativeIsDSPProcessingEnabled(): Boolean

    // ===================== REACT METHODS =====================

    @ReactMethod
    fun setEqualizer(band: Int, level: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            setNativeEqualizerBand(band, level)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            for (i in 0 until minOf(gains.size(), 10)) {
                setNativeEqualizerBand(i, gains.getDouble(i).toFloat())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBassBoost(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            // 🔥 FIX (2026-10-10): konversi satuan.
            //
            // `strength` datang dari `HorizontalSlider` JS dengan rentang
            // 0..1000 (ditampilkan sebagai persen: value/10). Sebelumnya nilai
            // itu diteruskan APA ADANYA ke `setNativeBassBoost(gainDb)`, yang
            // membacanya sebagai dB — jadi slider di 50% berarti low-shelf
            // +500 dB di 100 Hz.
            //
            // Bug ini laten selama `AudioEngine::setBassBoost()` masih bodi
            // kosong. Begitu jalur itu disambungkan (commit f39ce5445), nilai
            // mentah 0..1000 akan langsung terdengar sebagai distorsi keras.
            //
            // Dipetakan ke 0..+12 dB supaya konsisten dengan rentang band EQ
            // di UI (-12..+12 dB). Normalisasi di sini, bukan di JS, supaya
            // API native tetap ber-dB — sama seperti `setVirtualizer` yang
            // membagi 1000 sebelum memanggil `setNativeStereoWide`.
            val gainDb = strength / 1000.0f * kMaxBassBoostDb
            setNativeBassBoost(gainDb)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setVirtualizer(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            // �� FIX (2026-10-10): slider ini bernama "WIDTH" di UI, jadi harus
            // benar-benar MELEBARKAN.
            //
            // `StereoWidener` (dsp/StereoWidener.h) memakai skala:
            //     0.0 = mono   1.0 = stereo asli   2.0 = ultra wide
            // dan meng-clamp ke [0,2].
            //
            // Sebelumnya: `strength / 1000.0f` -> 0.0..1.0. Jadi slider hanya
            // bisa dari MONO sampai stereo asli, dan tidak pernah melebihi
            // aslinya. Namanya widener, perilakunya narrower.
            //
            // Sekarang: 0 -> 1.0 (tidak ada perubahan), 1000 -> 2.0 (ultra
            // wide). Rentang 0..1000 ini konvensi `android.media.audiofx.
            // Virtualizer.setStrength()`, tempat slider ini berasal - di sana
            // 0 berarti "tidak ada efek", bukan "mono".
            //
            // Sengaja BUKAN 0.0..2.0: kalau begitu, nilai default 0 (dan posisi
            // 50%) akan melebur stereo jadi mono hanya karena user menyalakan
            // EQ. Melebar tidak boleh menghilangkan stereo.
            val width = 1.0f + strength / 1000.0f
            setNativeStereoWide(width)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setReverbPreset(preset: Int, sessionId: Int, promise: Promise) {
        // Reverb tidak didukung oleh engine C++ saat ini
        promise.resolve(false)
    }

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        // Tidak ada alokasi efek khusus; bisa dianggap sukses
        promise.resolve(true)
    }

    @ReactMethod
    fun createAudioSession(promise: Promise) {
        try {
            val sessionId = generateAudioSessionId()
            val result = Arguments.createMap()
            result.putInt("sessionId", sessionId)
            result.putBoolean("isNew", true)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setMasterGain(gain: Float) {
        if (engineAvailable) setNativeMasterGain(gain)
    }

    @ReactMethod
    fun setBalance(balance: Float) {
        if (engineAvailable) setNativeBalance(balance)
    }

    @ReactMethod
    fun setExclusiveMode(enabled: Boolean) {
        if (engineAvailable) toggleNativeExclusiveMode(enabled)
    }

    /**
     * Pilih mode pemrosesan: 0 = BitPerfect, 1 = DSP, 2 = Immersive.
     *
     * Live: mode dibaca dari Atomic di AudioState setiap buffer, jadi
     * perubahan berlaku pada frame berikutnya tanpa restart stream. Kalau
     * sakelar DSP produksi mati (lihat setDSPProcessingEnabled), pilihan ini
     * tersimpan tapi belum berpengaruh ke PCM.
     */
    @ReactMethod
    fun setProcessingMode(mode: Int) {
        if (engineAvailable) setNativeProcessingMode(mode)
    }

    // ===================== KOREKSI HEADPHONE (Fase D) =====================

    /**
     * Muat preset koreksi headphone dari teks (format AutoEQ/Squiglink).
     *
     * Parsing terjadi di native, di thread pemanggil — BUKAN di audio thread.
     * Resolve `true` kalau preset terpasang, `false` kalau ditolak.
     *
     * Preset cacat DITOLAK, tidak diterapkan sebagian: kalau ada baris filter
     * yang gagal dibaca, tidak ada satu pun filter yang dipasang. Pemanggil
     * harus memeriksa hasilnya dan memberi tahu user.
     */
    @ReactMethod
    fun loadHeadphonePreset(presetText: String, promise: Promise) {
        if (!engineAvailable) {
            promise.reject("DSP_UNAVAILABLE", "Engine tidak tersedia")
            return
        }

        try {
            val ok = nativeLoadHeadphonePreset(presetText)
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearHeadphonePreset(promise: Promise) {
        if (!engineAvailable) {
            promise.reject("DSP_UNAVAILABLE", "Engine tidak tersedia")
            return
        }

        try {
            nativeClearHeadphonePreset()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setHeadphoneCorrectionEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeHeadphoneCorrectionEnabled(enabled)
    }

    @ReactMethod
    fun isHeadphoneCorrectionEnabled(promise: Promise) {
        if (!engineAvailable) {
            promise.resolve(false)
            return
        }

        try {
            promise.resolve(nativeIsHeadphoneCorrectionEnabled())
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    /**
     * Nyalakan/matikan pemrosesan DSP (AudioPipeline) di jalur produksi.
     *
     * Sebelum 2026-10-07 pipeline tidak pernah dipanggil saat memutar lagu,
     * jadi mode DSP/Immersive tidak berefek dan bit-perfect hanya benar
     * secara kebetulan. Menyalakannya mengubah suara yang keluar - karena itu
     * terpisah dan bisa dibalik tanpa build ulang.
     */
    @ReactMethod
    fun setDSPProcessingEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeDSPProcessingEnabled(enabled)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isDSPProcessingEnabled(): Boolean =
        if (engineAvailable) nativeIsDSPProcessingEnabled() else false

    // 🔥 Status stream AKTUAL — bukan yang diminta.
    // AAudio bisa menolak exclusive; UI butuh tahu untuk jujur ke user
    // bahwa bit-perfect tidak tercapai. Lihat docs/WORKFLOW.md.
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isExclusiveModeActive(): Boolean =
        if (engineAvailable) nativeIsExclusiveModeActive() else false

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getActualSampleRate(): Int =
        if (engineAvailable) nativeGetActualSampleRate() else 0

    // ===================== ADDITIONAL REACT METHODS =====================

    @ReactMethod
    fun setDSPEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeDSPEnabled(enabled)
    }

    @ReactMethod
    fun setLimiterEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeLimiterEnabled(enabled)
    }

    @ReactMethod
    fun setSolfeggioFreq(freq: Float) {
        if (engineAvailable) setNativeSolfeggioFreq(freq)
    }

    @ReactMethod
    fun setBrainwaveFreq(freq: Float) {
        if (engineAvailable) setNativeBrainwaveFreq(freq)
    }

    @ReactMethod
    fun setResonanceIntensity(intensity: Float) {
        if (engineAvailable) setNativeResonanceIntensity(intensity)
    }

    @ReactMethod
    fun setImmersiveEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeImmersiveEnabled(enabled)
    }

    // ===================== PRIVATE HELPER =====================

    private fun generateAudioSessionId(): Int {
        val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return audioManager.generateAudioSessionId()
    }
}