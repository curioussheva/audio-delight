// =====================================================
// usb/UsbDirectManager.kt
// =====================================================
//
// Manager sisi Kotlin untuk USB Direct (backend output kedua, UAC2).
// Diadaptasi dari spike/usb-direct/android/UsbDirectManager.kt —
// bedanya: sumber PCM BUKAN lagi sine test (startTone dihapus);
// start() memindahkan output engine ke USB (render decoder yang sama
// lewat AudioCallback::renderFrames), dan stop()/close() mengembalikan
// output ke Oboe (EngineManager::usbDirectStop -> reopen).
//
// Tugas file ini (sisi Kotlin):
//   (a) discovery DAC USB audio via UsbManager.getDeviceList(),
//   (b) minta izin lewat UsbManager.requestPermission(),
//   (c) buka UsbDeviceConnection, serahkan fd ke native
//       (UsbDeviceConnection.getFileDescriptor()).
//
// Yang TIDAK dilakukan file ini (sengaja):
//   - TIDAK memanggil connection.claimInterface() — claim dilakukan
//     native via USBDEVFS_DISCONNECT_CLAIM + CLAIMINTERFACE (lihat
//     usb_direct_stream.cpp). Claim ganda (Java + native) pada
//     interface yang sama akan bentrok.
//   - TIDAK membaca deskriptor di Kotlin — native baca lewat control
//     transfer GET_DESCRIPTOR. Verifikasi UAC2 (bcdADC == 0x0200)
//     terjadi di parser native: DAC UAC1 (mis. CM108 0d8c:000c) DITOLAK
//     di open() dengan pesan — Kotlin hanya mencoba perangkat berikut
//     bila yang pertama ditolak (lihat tryOpenDevices di NativeDSPModule).
//   - TIDAK butuh device_filter.xml / USB_DEVICE_ATTACHED di manifest:
//     discovery + izin di sini dinamis. Filter statis hanya perlu untuk
//     auto-launch saat DAC dicolok — tidak dipakai ronde ini.
//     (Izin USB dihapus 2026-10-07 bersama stub USB* — file ini
//     membangun ulang dari nol, dinamis.)
//
// Izin USB di repo ini DIHAPUS 2026-10-07 (device_filter.xml +
// USB_DEVICE_ATTACHED + kelas USB* stub) karena stub yang dikompilasi
// lebih berbahaya daripada file yang tidak ada (AGENTS.md).
//
// STATUS VERIFIKASI: Kotlin HANYA dikompilasi CI (tidak ada kotlinc di
// VM Muse). File ini ditulis mengikuti API android.hardware.usb yang
// terdokumentasi; kompilasi nyata menunggu CI. Perilaku default TANPA
// DAC UAC2 tidak berubah: tidak ada yang memanggil file ini kecuali
// setUsbDirectEnabled(true) dari JS.
//
// SPDX-License-Identifier: MIT

package com.pristineaudio.usb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log

/**
 * Manager sisi Kotlin untuk USB Direct.
 *
 * Alur pakai (lihat NativeDSPModule.setUsbDirectEnabled):
 *   val manager = UsbDirectManager(context)
 *   val dacs = manager.findAudioDevices()          // daftar DAC audio USB
 *   manager.requestPermission(dacs[0]) { granted ->
 *       if (granted) manager.open(dacs[0], 48000) { err ->
 *           if (err == null) manager.start() else Log.e(TAG, err)
 *       }
 *   }
 *
 * open() bersifat blocking ringan (control transfer + ioctl) — panggil
 * dari thread latar, bukan main. start()/stop()/close() juga blocking
 * (stop menggabung worker USB).
 */
class UsbDirectManager(private val context: Context) {

    companion object {
        private const val TAG = "UsbDirect"
        private const val ACTION_USB_PERMISSION = "com.pristineaudio.usb.USB_PERMISSION"
        private const val ACTION_USB_DETACHED = "com.pristineaudio.usb.USB_DETACHED"
    }

    private val usbManager: UsbManager =
        context.getSystemService(Context.USB_SERVICE) as UsbManager

    private var connection: UsbDeviceConnection? = null
    private var currentDevice: UsbDevice? = null
    private var permissionReceiver: BroadcastReceiver? = null
    private var detachReceiver: BroadcastReceiver? = null
    private var pendingPermissionCallback: ((Boolean) -> Unit)? = null

    // --- JNI (jni/NativeUsbDirect.cpp) ---
    private external fun nativeUsbOpen(fd: Int, sampleRate: Int): String?
    private external fun nativeUsbStart(): Boolean
    private external fun nativeUsbStop()
    private external fun nativeUsbIsActive(): Boolean
    private external fun nativeUsbGetStats(): String

    /** DAC audio yang tercolok: class audio, atau punya interface audio. */
    fun findAudioDevices(allowedVidPid: Set<Pair<Int, Int>>? = null): List<UsbDevice> {
        return usbManager.deviceList.values.filter { device ->
            if (allowedVidPid != null &&
                Pair(device.vendorId, device.productId) !in allowedVidPid
            ) {
                return@filter false
            }
            if (device.deviceClass == UsbConstants.USB_CLASS_AUDIO) return@filter true
            for (i in 0 until device.interfaceCount) {
                if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_AUDIO) {
                    return@filter true
                }
            }
            false
        }
    }

    /** Minta izin USB untuk satu perangkat. Callback di thread main. */
    fun requestPermission(device: UsbDevice, onResult: (Boolean) -> Unit) {
        if (usbManager.hasPermission(device)) {
            onResult(true)
            return
        }
        pendingPermissionCallback = onResult
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API 31+: PendingIntent untuk requestPermission harus MUTABLE.
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val intent = PendingIntent.getBroadcast(
            context, 0, Intent(ACTION_USB_PERMISSION), flags
        )
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                val granted =
                    intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                val dev: UsbDevice? =
                    intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                if (dev?.deviceId == device.deviceId) {
                    context.unregisterReceiver(this)
                    permissionReceiver = null
                    pendingPermissionCallback?.invoke(granted)
                    pendingPermissionCallback = null
                }
            }
        }
        permissionReceiver = receiver
        context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION))
        usbManager.requestPermission(device, intent)
    }

    /**
     * Buka perangkat: UsbDeviceConnection -> fd -> native open
     * (parse deskriptor, gate UAC2 bcdADC, cek clock, claim, set
     * interface, set clock). `onError` dipanggil dengan pesan bila
     * gagal, null bila sukses. Format tetap stereo 32-bit (cocok untuk
     * CX31993); DAC yang formatnya berbeda ditolak native dengan pesan.
     */
    fun open(
        device: UsbDevice,
        sampleRate: Int,
        onError: (String?) -> Unit
    ) {
        val conn = usbManager.openDevice(device)
        if (conn == null) {
            onError("openDevice gagal (izin ditolak atau perangkat lepas?)")
            return
        }
        val fd = conn.fileDescriptor
        if (fd < 0) {
            conn.close()
            onError("fileDescriptor tidak valid")
            return
        }
        val err = nativeUsbOpen(fd, sampleRate)
        if (err != null) {
            conn.close()
            onError(err)
            return
        }
        connection = conn
        currentDevice = device
        registerDetachReceiver()
        onError(null)
    }

    /**
     * Pindah output engine ke USB (tutup Oboe dulu, lalu streaming
     * render decoder). false bila belum open / start gagal — saat itu
     * EngineManager sudah membuka ulang Oboe bila tadi berjalan.
     */
    fun start(): Boolean {
        return nativeUsbStart()
    }

    /** Kembali ke Oboe (tutup USB). Idempotent. */
    fun stop() {
        nativeUsbStop()
    }

    fun isActive(): Boolean = nativeUsbIsActive()

    /** Statistik streaming terakhir sebagai JSON (lihat IsoStats). */
    fun getStats(): String = nativeUsbGetStats()

    fun close() {
        nativeUsbStop()
        unregisterDetachReceiver()
        connection?.close()
        connection = null
        currentDevice = null
    }

    private fun registerDetachReceiver() {
        if (detachReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val dev: UsbDevice? =
                    intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                if (dev?.deviceId == currentDevice?.deviceId) {
                    // DAC dilepas saat streaming: tutup USB — EngineManager
                    // membuka ulang Oboe bila tadi berjalan (fallback ke
                    // speaker otomatis, tanpa perlu tekan apa pun).
                    Log.w(TAG, "DAC dilepas saat streaming — kembali ke Oboe")
                    close()
                }
            }
        }
        detachReceiver = receiver
        context.registerReceiver(receiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED))
    }

    private fun unregisterDetachReceiver() {
        detachReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Sudah di-unregister.
            }
            detachReceiver = null
        }
    }
}
