// =====================================================
// spike/usb-direct/android/UsbDirectManager.kt
// =====================================================
//
// REFERENSI — BELUM TERWIRING ke app. Saat integrasi, salin file ini
// ke android/app/src/main/java/com/pristineaudio/usb/ dan daftarkan
// pemakaiannya (jangan sekadar copy: ikuti langkah integrasi di
// spike README).
//
// Tugas file ini (sisi Kotlin):
//   (a) discovery DAC USB UAC2 via UsbManager.getDeviceList(),
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
//     transfer GET_DESCRIPTOR (sudah dites di harness). Alternatif bila
//     control transfer gagal di satu perangkat: pakai
//     connection.rawDescriptors lalu kirim blob-nya ke native
//     (butuh satu fungsi JNI tambahan — belum dibuat).
//
// Izin USB di repo ini DIHAPUS 2026-10-07 (device_filter.xml +
// USB_DEVICE_ATTACHED + kelas USB* stub) karena stub yang dikompilasi
// lebih berbahaya daripada file yang tidak ada (AGENTS.md). File ini
// membangun ulang dari nol — dinamis, tanpa device_filter (filter
// statis hanya perlu untuk auto-launch saat DAC dicolok; lihat
// device_filter.xml di folder ini).
//
// STATUS VERIFIKASI: Kotlin HANYA dikompilasi CI (tidak ada kotlinc
// di VM Muse). File ini ditulis mengikuti API android.hardware.usb
// yang terdokumentasi; kompilasi nyata menunggu CI.
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
 * Manager sisi Kotlin untuk spike USB Direct.
 *
 * Alur pakai:
 *   val manager = UsbDirectManager(context)
 *   val dacs = manager.findAudioDevices()          // daftar DAC UAC2
 *   manager.requestPermission(dacs[0]) { granted ->
 *       if (granted) manager.open(dacs[0], 96000) { err ->
 *           if (err == null) manager.startTone(1000.0) else Log.e(TAG, err)
 *       }
 *   }
 *
 * Semua panggilan open/start/stop/close bersifat blocking ringan
 * (control transfer + ioctl) — panggil dari thread latar, bukan main.
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

    // --- JNI (usb_direct_jni.cpp) ---
    private external fun nativeOpen(
        fd: Int, sampleRate: Int, channels: Int, subslotSize: Int, bitResolution: Int
    ): String?

    private external fun nativeStart(freqHz: Double, amplitude: Double): Boolean
    private external fun nativeStop()
    private external fun nativeClose()
    private external fun nativeGetStats(): String

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
     * (parse deskriptor, cek clock, claim, set interface, set clock).
     * `onError` dipanggil dengan pesan bila gagal, null bila sukses.
     * Format default: stereo, 32-bit (subslot 4, bitres 32) — cocok
     * untuk CX31993; sesuaikan bila DAC-nya berbeda.
     */
    fun open(
        device: UsbDevice,
        sampleRate: Int,
        channels: Int = 2,
        subslotSize: Int = 4,
        bitResolution: Int = 32,
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
        val err = nativeOpen(fd, sampleRate, channels, subslotSize, bitResolution)
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

    /** Mulai nada test sine (spike). Ganti dengan sumber decoder nanti. */
    fun startTone(freqHz: Double, amplitude: Double = 0.5): Boolean {
        return nativeStart(freqHz, amplitude)
    }

    fun stop() {
        nativeStop()
    }

    /** Statistik streaming terakhir sebagai JSON (lihat IsoStats). */
    fun getStats(): String = nativeGetStats()

    fun close() {
        nativeClose()
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
                    Log.w(TAG, "DAC dilepas saat streaming — menutup sesi")
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
