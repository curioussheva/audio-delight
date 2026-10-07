package com.pristineaudio.audio

import android.annotation.SuppressLint
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Membaca apakah jalur A2DP sedang aktif, dan ke perangkat apa.
 *
 * KENAPA INI ADA
 *
 * A2DP adalah jalur LOSSY. Sampel masuk ke encoder (SBC/aptX/LDAC/...) sebelum
 * dikirim, jadi bit-perfect mustahil - apa pun laju output yang berhasil
 * dibuka. UI perlu bisa menyatakan itu, dan menyatakan bahwa perangkat
 * Bluetooth sedang dipakai.
 *
 * =====================================================
 * BATAS API - INI YANG MEMBENTUK SELURUH KELAS
 * =====================================================
 *
 * Dua percobaan sebelumnya gagal compile karena mengira API berikut publik.
 * Keduanya mengembalikan hasil yang berguna, tapi TIDAK tersedia untuk app
 * biasa. Dicatat di sini supaya tidak dicoba lagi:
 *
 * 1. `BluetoothA2dp.getCodecStatus(device)` - codec yang SEDANG dipakai.
 *    Bukan API publik: tidak ada di daftar public methods dokumentasi resmi
 *    (`@SystemApi`/`@hide`). -> Unresolved reference.
 *
 * 2. `BluetoothA2dp.getSupportedCodecTypes()` - daftar codec yang DIDUKUNG.
 *    Ada di dokumentasi publik, TAPI dianotasi
 *    `Requires android.Manifest.permission#BLUETOOTH_PRIVILEGED`. Itu izin
 *    signature-level - hanya bisa dimiliki app yang ditandatangani vendor /
 *    system app. Memanggilnya dari app biasa akan gagal saat runtime.
 *
 * Jadi dari app biasa, tentang A2DP hanya ini yang benar-benar bisa diketahui:
 *   - ADA perangkat A2DP terhubung atau tidak
 *   - nama perangkat itu
 *
 * Codec (aktif maupun didukung), bitrate, dan kedalaman bit TIDAK bisa dibaca.
 * Semuanya dilaporkan sebagai tidak tersedia - BUKAN dikarang. Menampilkan
 * nama codec yang tidak benar-benar dibaca adalah bug kejujuran yang sama
 * dengan badge bit-perfect palsu.
 *
 * Kalau nanti app jadi system app / punya BLUETOOTH_PRIVILEGED, codec bisa
 * ditambahkan. Sampai itu terjadi, ini batasnya.
 */
object BluetoothA2dpStatus {

    private const val TAG = "BluetoothA2dpStatus"

    /**
     * Status jalur A2DP.
     *
     * @param connected   true kalau ada perangkat A2DP yang terhubung.
     * @param deviceName  nama perangkat ("" kalau tidak ada / tidak terbaca).
     * @param address     alamat perangkat, untuk identifikasi di UI ("" kalau
     *                    tidak terbaca).
     */
    data class Status(
        val connected: Boolean,
        val deviceName: String,
        val address: String,
    ) {
        companion object {
            val DISCONNECTED = Status(
                connected = false,
                deviceName = "",
                address = "",
            )
        }
    }

    /**
     * Baca status A2DP.
     *
     * @param context dipakai untuk BluetoothManager.
     */
    @SuppressLint("MissingPermission")
    fun read(context: Context?): Status {
        if (context == null) return Status.DISCONNECTED

        return try {
            val manager =
                context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = manager?.adapter

            if (adapter == null || !adapter.isEnabled) {
                return Status.DISCONNECTED
            }

            var result: Status = Status.DISCONNECTED

            // getProfileProxy() asinkron; kita menunggu sebentar karena
            // pemanggilnya (JNI getter) sinkron. Batas pendek supaya Bluetooth
            // yang tidak responsif tidak menggantung pemanggilnya.
            val latch = CountDownLatch(1)

            val listener = object : BluetoothProfile.ServiceListener {
                override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                    try {
                        val a2dp = proxy as? BluetoothA2dp

                        val connected: List<BluetoothDevice> = try {
                            a2dp?.connectedDevices ?: emptyList()
                        } catch (e: SecurityException) {
                            // BLUETOOTH_CONNECT belum diberikan.
                            Log.w(TAG, "connectedDevices ditolak: ${e.message}")
                            emptyList()
                        } catch (e: Throwable) {
                            emptyList()
                        }

                        val target = connected.firstOrNull()
                        if (target != null) {
                            val name = try {
                                target.name ?: ""
                            } catch (e: Throwable) {
                                // getName() bisa ditolak izin.
                                ""
                            }

                            val addr = try {
                                target.address ?: ""
                            } catch (e: Throwable) {
                                ""
                            }

                            result = Status(
                                connected = true,
                                deviceName = name,
                                address = addr,
                            )
                        }
                    } finally {
                        try {
                            adapter.closeProfileProxy(BluetoothProfile.A2DP, proxy)
                        } catch (e: Exception) {
                            // Proxy sudah tertutup atau adapter mati - tidak fatal.
                        }
                        latch.countDown()
                    }
                }

                override fun onServiceDisconnected(profile: Int) {
                    latch.countDown()
                }
            }

            val opened = adapter.getProfileProxy(context, listener, BluetoothProfile.A2DP)
            if (!opened) {
                Log.d(TAG, "getProfileProxy(A2DP) gagal dibuka")
                return Status.DISCONNECTED
            }

            latch.await(400, TimeUnit.MILLISECONDS)

            if (result.connected) {
                Log.i(
                    TAG,
                    "A2DP terhubung: \"${result.deviceName}\" (${result.address}) - " +
                        "lossy, bit-perfect tidak mungkin. Codec tidak bisa dibaca " +
                        "(butuh BLUETOOTH_PRIVILEGED).",
                )
            } else {
                Log.d(TAG, "tidak ada perangkat A2DP terhubung")
            }

            result
        } catch (e: SecurityException) {
            Log.w(TAG, "izin BLUETOOTH_CONNECT belum ada: ${e.message}")
            Status.DISCONNECTED
        } catch (e: Throwable) {
            Log.w(TAG, "baca status A2DP gagal: ${e.message}")
            Status.DISCONNECTED
        }
    }
}
