package com.pristineaudio.audio

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo as AndroidAudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeDeviceModule.NAME)
class NativeDeviceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativeDeviceModule"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    private external fun nativeGetDevices(): Array<Any>
    private external fun nativeSetActiveDevice(deviceId: String): Boolean
    private external fun nativeOnDeviceAdded(deviceId: String)
    private external fun nativeOnDeviceRemoved(deviceId: String)
    private external fun nativeGetActiveDeviceStatus(): IntArray

    /**
     * Perangkat yang SEDANG mengeluarkan suara (hasil stream, bukan yang
     * diminta). null kalau stream memilih sendiri atau belum dibuka.
     */
    private external fun nativeGetCurrentOutputDevice(): AudioDeviceInfo?

    override fun getName() = NAME

    // ============================================================
    // AUDIO DEVICE CALLBACK
    // ============================================================
    //
    // Tanpa ini, DAC yang dicolok SAAT APP BERJALAN tidak terdeteksi: laju
    // stream tetap memakai device lama sampai app dibuka ulang. Itu bikin
    // bit-perfect gagal secara diam-diam ketika user mencolok DAC di tengah
    // pemutaran.
    //
    // Callback didaftarkan sekali saat module dibuat, dan dilepas saat
    // destroy. Handler dipakai karena AudioDeviceCallback butuh Looper.
    private val audioManager: AudioManager? by lazy {
        reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }

    private var deviceCallback: AudioDeviceCallback? = null

    private fun registerDeviceCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (deviceCallback != null) return

        val am = audioManager ?: return
        val cb = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AndroidAudioDeviceInfo>) {
                for (d in addedDevices) {
                    android.util.Log.i("NativeDeviceModule",
                        "device ditambah: id=${d.id} type=${d.type} name=${d.productName}")
                    try {
                        nativeOnDeviceAdded(d.id.toString())
                    } catch (e: Throwable) {
                        android.util.Log.e("NativeDeviceModule", "nativeOnDeviceAdded gagal", e)
                    }
                }
                emitDeviceListChanged()
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AndroidAudioDeviceInfo>) {
                for (d in removedDevices) {
                    android.util.Log.i("NativeDeviceModule",
                        "device dicabut: id=${d.id} type=${d.type} name=${d.productName}")
                    try {
                        nativeOnDeviceRemoved(d.id.toString())
                    } catch (e: Throwable) {
                        android.util.Log.e("NativeDeviceModule", "nativeOnDeviceRemoved gagal", e)
                    }
                }
                emitDeviceListChanged()
            }
        }

        am.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper()))
        deviceCallback = cb
        android.util.Log.i("NativeDeviceModule", "AudioDeviceCallback terdaftar")
    }

    private fun unregisterDeviceCallback() {
        val am = audioManager
        val cb = deviceCallback
        if (am != null && cb != null) {
            try {
                am.unregisterAudioDeviceCallback(cb)
                android.util.Log.i("NativeDeviceModule", "AudioDeviceCallback dilepas")
            } catch (e: Exception) {
                android.util.Log.w("NativeDeviceModule", "unregister gagal: ${e.message}")
            }
        }
        deviceCallback = null
    }

    /**
     * Beri tahu JS kalau daftar device berubah. Pemakai di sisi JS bisa
     * mendengarkan lewat NativeEventEmitter nama "PristineDeviceChange".
     * Kalau tidak ada listener, ini hanya no-op.
     *
     * Memakai reactApplicationContext.emitDeviceEvent() alih-alih
     * getJSModule(RCTDeviceEventEmitter::class.java) karena yang kedua adalah
     * kelas generik dan Kotlin tidak bisa menyimpulkan argumen tipenya
     * ("Cannot infer type for this parameter"). emitDeviceEvent sudah
     * menangani hal yang sama tanpa masalah tipe.
     */
    private fun emitDeviceListChanged() {
        try {
            reactApplicationContext.emitDeviceEvent("PristineDeviceChange", null)
        } catch (e: Exception) {
            android.util.Log.w("NativeDeviceModule", "emit gagal: ${e.message}")
        }
    }

    override fun initialize() {
        super.initialize()
        registerDeviceCallback()
    }

    override fun invalidate() {
        unregisterDeviceCallback()
        super.invalidate()
    }

    // ============================================================
    // REACT METHODS
    // ============================================================

    @ReactMethod
    fun getDevices(promise: Promise) {
        // Sebelumnya fungsi ini hanya `promise.resolve(Arguments.createArray())`
        // tanpa memanggil JNI sama sekali, sehingga daftar device SELALU kosong
        // walau native-nya sudah benar. Sekarang JNI benar-benar dipanggil.
        try {
            val devices = nativeGetDevices()
            val array = Arguments.createArray()

            for (item in devices) {
                val map = Arguments.createMap()
                // nativeGetDevices mengembalikan AudioDeviceInfo (Kotlin data
                // class) yang dibuat di sisi native lewat JNI.
                val info = item as? AudioDeviceInfo
                if (info != null) {
                    map.putString("id", info.id)
                    map.putString("name", info.name)
                    map.putString("type", info.type)
                    map.putInt("sampleRate", info.sampleRate)
                    map.putBoolean("exclusive", info.exclusive)
                    map.putBoolean("isUsb", info.isUsb)
                } else {
                    map.putString("id", item.toString())
                    map.putString("name", item.toString())
                    map.putString("type", "unknown")
                    map.putInt("sampleRate", 48000)
                    map.putBoolean("exclusive", false)
                    map.putBoolean("isUsb", false)
                }
                array.pushMap(map)
            }

            android.util.Log.i("NativeDeviceModule",
                "getDevices: ${devices.size} device dikembalikan ke JS")
            promise.resolve(array)
        } catch (e: Throwable) {
            promise.reject("DEVICE_LIST_FAILED", e)
        }
    }

    @ReactMethod
    fun setActiveDevice(deviceId: String, promise: Promise) {
        try {
            // Native sekaligus meneruskan pilihan ke engine (menutup & membuka
            // ulang stream di perangkat ini) dan mengembalikan true hanya kalau
            // id-nya benar-benar ada di daftar device.
            val ok = nativeSetActiveDevice(deviceId)
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("DEVICE_ERROR", e.message)
        }
    }

    /**
     * Status perangkat yang BENAR-BENAR dipakai stream.
     *
     * Mengembalikan { requested, actual, honored, pathLossy, rateHonored }:
     *   - requested:   id yang diminta (0 = tidak ada preferensi)
     *   - actual:      id yang benar-benar dipakai stream (0 = dipilih sistem)
     *   - honored:     true kalau permintaan device dihormati
     *   - pathLossy:   true kalau jalur ini memang TIDAK BISA bit-perfect
     *                  (speaker internal, jack, Bluetooth, OpenSLES) - jadi
     *                  exclusive yang ditolak bukan kegagalan, melainkan batas
     *   - rateHonored: true kalau laju stream sama dengan laju file
     *
     * Dipakai UI untuk jujur: jangan tampilkan "DAC aktif" kalau stream
     * ternyata masih keluar di perangkat lain, dan jangan tampilkan
     * "bit-perfect" kalau sampelnya di-resample.
     * Sebelumnya tidak ada cara membedakan "sedang memakai DAC" dari
     * "mengira memakai DAC".
     */
    @ReactMethod
    fun getActiveDeviceStatus(promise: Promise) {
        try {
            val status = nativeGetActiveDeviceStatus()
            val map = Arguments.createMap()
            map.putInt("requested", status.getOrElse(0) { 0 })
            map.putInt("actual", status.getOrElse(1) { 0 })
            map.putBoolean("honored", status.getOrElse(2) { 1 } == 1)
            map.putBoolean("pathLossy", status.getOrElse(3) { 0 } == 1)
            map.putBoolean("rateHonored", status.getOrElse(4) { 0 } == 1)
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("DEVICE_STATUS_FAILED", e)
        }
    }

    /**
     * Perangkat yang SEDANG mengeluarkan suara.
     *
     * Beda penting dari getDevices(): itu daftar yang TERSEDIA, ini satu
     * perangkat yang benar-benar dipakai. Kalau pilihan DAC tidak dihormati,
     * di sini yang muncul speaker internal - dan UI tidak bisa menyebut nama
     * DAC yang salah.
     *
     * resolve(null) kalau stream memilih sendiri atau belum dibuka.
     */
    @ReactMethod
    fun getCurrentOutputDevice(promise: Promise) {
        try {
            val device = nativeGetCurrentOutputDevice()
            if (device == null) {
                promise.resolve(null)
                return
            }
            val map = Arguments.createMap()
            map.putString("id", device.id)
            map.putString("name", device.name)
            map.putString("type", device.type)
            map.putInt("sampleRate", device.sampleRate)
            map.putBoolean("exclusive", device.exclusive)
            map.putBoolean("isUsb", device.isUsb)
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("CURRENT_DEVICE_FAILED", e)
        }
    }

    @ReactMethod
    fun refreshDevices(promise: Promise) {
        try {
            val devices = nativeGetDevices()
            promise.resolve(devices.size)
        } catch (e: Throwable) {
            promise.reject("DEVICE_LIST_FAILED", e)
        }
    }

    /**
     * Codec A2DP yang sedang dipakai (SBC/aptX/LDAC/...).
     *
     * A2DP SELALU lossy kecuali codec yang memang lossless (aptX Lossless).
     * Sampel masuk ke encoder sebelum dikirim, jadi bit-perfect mustahil
     * lewat Bluetooth - apa pun laju output yang berhasil dibuka.
     *
     * `available: false` berarti codec tidak bisa dibaca (tidak ada A2DP
     * aktif, API < 33, atau izin BLUETOOTH_CONNECT belum diberikan). UI tidak
     * boleh mengarang nama codec dalam keadaan itu.
     */
    @ReactMethod
    fun getBluetoothCodec(promise: Promise) {
        try {
            val info = BluetoothCodecReader.read(reactApplicationContext)
            val map = Arguments.createMap()
            map.putBoolean("available", info.available)
            map.putString("codec", info.codecName)
            map.putInt("sampleRate", info.sampleRate)
            map.putInt("bitsPerSample", info.bitsPerSample)
            map.putInt("bitrate", info.bitrate)
            map.putBoolean("lossless", info.lossless)
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("BLUETOOTH_CODEC_FAILED", e)
        }
    }
}
