package com.pristineaudio.audio

import android.annotation.SuppressLint
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothCodecConfig
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Membaca jalur A2DP yang sedang aktif.
 *
 * KENAPA INI ADA
 *
 * A2DP adalah jalur LOSSY. Sampel masuk ke encoder (SBC/aptX/LDAC/...) sebelum
 * dikirim, jadi bit-perfect mustahil - apa pun laju output yang berhasil
 * dibuka. Tanpa membaca statusnya, UI tidak punya cara menjelaskan MENGAPA
 * jalur itu tidak bit-perfect.
 *
 * BATAS API - ini yang membentuk seluruh kelas, dan ditemukan lewat CI gagal
 *
 * `BluetoothA2dp.getCodecStatus()` yang lazim dipakai untuk membaca codec
 * **bukan API publik**: ia tidak ada di daftar public methods `BluetoothA2dp`
 * pada dokumentasi resmi Android (yang publik hanya `getConnectedDevices`,
 * `getConnectionState`, `getSupportedCodecTypes`, `isA2dpPlaying`). Ia
 * `@SystemApi`/`@hide`, jadi tidak bisa dipanggil dari app biasa - percobaan
 * pertama kelas ini gagal compile dengan `Unresolved reference 'getCodecStatus'`.
 *
 * Karena itu kelas ini hanya memakai API yang BENAR-BENAR publik:
 *   - `getConnectedDevices()` + proxy A2DP (API 11+)
 *   - `getSupportedCodecTypes()` (API 35+) untuk daftar codec yang DIDUKUNG
 *   - konstanta codec dari `BluetoothCodecConfig` (API 33+)
 *
 * Yang TIDAK bisa didapat: codec mana yang sedang DIPILIH, bitrate, dan
 * kedalaman bit yang dinegosiasikan. Itu dilaporkan sebagai tidak tersedia -
 * BUKAN dikarang. Menampilkan nama codec yang tidak benar-benar dibaca adalah
 * bug kejujuran yang sama dengan badge bit-perfect palsu.
 *
 * Semua panggilan best-effort: kegagalan mengembalikan `available = false`.
 */
object BluetoothCodecReader {

    private const val TAG = "BluetoothCodec"

    /**
     * Ringkasan jalur A2DP.
     *
     * @param available       true kalau ADA perangkat A2DP terhubung dan
     *                        informasinya berhasil dibaca.
     * @param deviceName      nama perangkat yang terhubung ("" kalau tidak ada).
     * @param supportedCodecs daftar codec yang DIDUKUNG perangkat, mis.
     *                        ["SBC", "AAC", "LDAC"]. Ini BUKAN yang sedang
     *                        dipakai.
     * @param activeCodec     nama codec yang sedang dipakai. SELALU "" - lihat
     *                        catatan batas API di atas; tidak bisa dibaca tanpa
     *                        API @hide.
     * @param lossless        true hanya kalau diyakini lossless. Untuk A2DP
     *                        praktis selalu false.
     */
    data class CodecInfo(
        val available: Boolean,
        val deviceName: String,
        val supportedCodecs: List<String>,
        val activeCodec: String,
        val lossless: Boolean,
    ) {
        companion object {
            val UNAVAILABLE = CodecInfo(
                available = false,
                deviceName = "",
                supportedCodecs = emptyList(),
                activeCodec = "",
                lossless = false,
            )
        }
    }

    /**
     * Nama codec dari konstanta `BluetoothCodecConfig.SOURCE_CODEC_TYPE_*`.
     *
     * Nilai numeriknya tidak dijamin sama antar versi Android (konstanta lama
     * dideprekasi di API 35), jadi yang tidak dikenal dikembalikan apa adanya -
     * bukan dipaksa jadi nama yang salah.
     */
    private fun codecTypeName(type: Int): String = when {
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_SBC -> "SBC"
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_AAC -> "AAC"
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_APTX -> "aptX"
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_APTX_HD -> "aptX HD"
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_LDAC -> "LDAC"
        type == BluetoothCodecConfig.SOURCE_CODEC_TYPE_OPUS -> "Opus"
        else -> "codec#$type"
    }

    /**
     * Daftar nama tipe codec yang DIDUKUNG perangkat.
     *
     * Hanya saat `getSupportedCodecTypes()` tersedia (API 35+). Di bawah itu
     * daftar kosong - bukan ditebak.
     */
    @SuppressLint("MissingPermission")
    private fun readSupportedCodecs(a2dp: BluetoothA2dp): List<String> {
        if (Build.VERSION.SDK_INT < 35) return emptyList()

        return try {
            val types = a2dp.supportedCodecTypes ?: return emptyList()
            types.mapNotNull { type ->
                try {
                    codecTypeName(type.codecType)
                } catch (e: Throwable) {
                    null
                }
            }.distinct()
        } catch (e: SecurityException) {
            Log.w(TAG, "getSupportedCodecTypes ditolak: ${e.message}")
            emptyList()
        } catch (e: Throwable) {
            // NoSuchMethodError / kelas tidak ada di device ini.
            emptyList()
        }
    }

    /**
     * Baca status jalur A2DP.
     *
     * @param context dipakai untuk BluetoothManager.
     */
    @SuppressLint("MissingPermission")
    fun read(context: Context?): CodecInfo {
        if (context == null) return CodecInfo.UNAVAILABLE

        return try {
            val manager =
                context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = manager?.adapter
            if (adapter == null || !adapter.isEnabled) {
                return CodecInfo.UNAVAILABLE
            }

            var result: CodecInfo = CodecInfo.UNAVAILABLE

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

                            val supported =
                                if (a2dp != null) readSupportedCodecs(a2dp)
                                else emptyList()

                            result = CodecInfo(
                                available = true,
                                deviceName = name,
                                supportedCodecs = supported,
                                // Tidak bisa dibaca tanpa API @hide.
                                activeCodec = "",
                                lossless = false,
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
                return CodecInfo.UNAVAILABLE
            }

            latch.await(400, TimeUnit.MILLISECONDS)

            if (result.available) {
                Log.i(
                    TAG,
                    "A2DP: device=\"${result.deviceName}\" " +
                        "codec didukung=${result.supportedCodecs} " +
                        "(codec AKTIF tidak bisa dibaca - API @hide)",
                )
            } else {
                Log.d(TAG, "tidak ada perangkat A2DP terhubung")
            }

            result
        } catch (e: SecurityException) {
            Log.w(TAG, "izin BLUETOOTH_CONNECT belum ada: ${e.message}")
            CodecInfo.UNAVAILABLE
        } catch (e: Throwable) {
            Log.w(TAG, "baca status A2DP gagal: ${e.message}")
            CodecInfo.UNAVAILABLE
        }
    }
}
