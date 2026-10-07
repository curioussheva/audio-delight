package com.pristineaudio.audio

import android.annotation.SuppressLint
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothCodecConfig
import android.bluetooth.BluetoothCodecStatus
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log

/**
 * Membaca codec A2DP yang SEDANG dipakai.
 *
 * Kenapa ini ada: A2DP adalah jalur LOSSY. Sampel masuk ke encoder
 * (SBC/aptX/LDAC/...) sebelum dikirim, jadi bit-perfect mustahil - apa pun
 * laju output yang berhasil dibuka. Tanpa membaca codec-nya, UI tidak punya
 * cara menjelaskan MENGAPA jalur itu tidak bit-perfect, dan pengguna hanya
 * melihat "tidak bit-perfect" tanpa alasan.
 *
 * Semua panggilan di sini bersifat best-effort: API-nya berubah antar versi
 * Android, dan sebagian perangkat tidak mengizinkan pembacaan codec.
 * Kegagalan mengembalikan `available = false`, BUKAN nilai yang dikarang -
 * UI tidak boleh menampilkan codec yang tidak bisa dibaca.
 */
object BluetoothCodecReader {

    private const val TAG = "BluetoothCodec"

    /**
     * Ringkasan codec A2DP aktif.
     *
     * @param available      true kalau codec benar-benar berhasil dibaca.
     *                       false = tidak ada A2DP aktif, atau pembacaan gagal
     *                       (izin belum diberikan, API terlalu lama, perangkat
     *                       tidak mengizinkan).
     * @param codecName      nama codec, mis. "SBC", "aptX", "LDAC".
     * @param sampleRate     laju yang dinegosiasikan codec (Hz).
     * @param bitsPerSample  kedalaman bit yang dinegosiasikan.
     * @param bitrate        bitrate target (bps). 0 = tidak dilaporkan.
     * @param lossless       true hanya kalau codec benar-benar lossless
     *                       (mis. aptX Lossless / LC3plus di mode tertentu).
     *                       SBC/aptX/LDAC/AAC semuanya LOSSY.
     */
    data class CodecInfo(
        val available: Boolean,
        val codecName: String,
        val sampleRate: Int,
        val bitsPerSample: Int,
        val bitrate: Int,
        val lossless: Boolean,
    ) {
        companion object {
            val UNAVAILABLE = CodecInfo(
                available = false,
                codecName = "",
                sampleRate = 0,
                bitsPerSample = 0,
                bitrate = 0,
                lossless = false,
            )
        }
    }

    /**
     * Nama codec dari ordinal BluetoothCodecConfig.SOURCE_CODEC_TYPE_*.
     *
     * Angka ordinal pernah berubah antar versi Android (mis. LC3 ditambahkan
     * di API 34), jadi ini diperlakukan sebagai tebakan yang aman: nilai yang
     * tidak dikenal dikembalikan apa adanya, bukan dipaksa jadi nama salah.
     */
    private fun codecTypeName(type: Int): String = when (type) {
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_SBC -> "SBC"
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_AAC -> "AAC"
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_APTX -> "aptX"
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_APTX_HD -> "aptX HD"
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_LDAC -> "LDAC"
        BluetoothCodecConfig.SOURCE_CODEC_TYPE_OPUS -> "Opus"
        8 -> "aptX Adaptive"
        9 -> "aptX Lossless"
        10 -> "LC3"
        else -> "codec#$type"
    }

    /**
     * true kalau codec ini, pada konfigurasi ini, benar-benar lossless.
     *
     * Sengaja konservatif: hanya codec yang memang dirancang lossless yang
     * diakui. aptX Adaptive bisa lossless di mode tertentu tapi tidak selalu,
     * jadi tidak dihitung.
     */
    private fun isLossless(type: Int): Boolean = when (type) {
        9 -> true // aptX Lossless
        else -> false
    }

    private fun sampleRateOf(config: BluetoothCodecConfig): Int = when (config.sampleRate) {
        BluetoothCodecConfig.SAMPLE_RATE_44100 -> 44100
        BluetoothCodecConfig.SAMPLE_RATE_48000 -> 48000
        BluetoothCodecConfig.SAMPLE_RATE_88200 -> 88200
        BluetoothCodecConfig.SAMPLE_RATE_96000 -> 96000
        8 /* SAMPLE_RATE_176400 */ -> 176400
        9 /* SAMPLE_RATE_192000 */ -> 192000
        else -> 0
    }

    private fun bitsOf(config: BluetoothCodecConfig): Int = when (config.bitsPerSample) {
        BluetoothCodecConfig.BITS_PER_SAMPLE_16 -> 16
        BluetoothCodecConfig.BITS_PER_SAMPLE_24 -> 24
        BluetoothCodecConfig.BITS_PER_SAMPLE_32 -> 32
        else -> 0
    }

    /**
     * Baca codec A2DP aktif.
     *
     * @param context dipakai untuk BluetoothManager; boleh ReactApplicationContext.
     */
    @SuppressLint("MissingPermission")
    fun read(context: Context?): CodecInfo {
        if (context == null) return CodecInfo.UNAVAILABLE

        // getCodecStatus() butuh API 33. Di bawah itu tidak ada cara resmi
        // membaca codec, jadi kita jujur: tidak tersedia.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Log.d(TAG, "API < 33 - codec A2DP tidak bisa dibaca")
            return CodecInfo.UNAVAILABLE
        }

        return try {
            val manager =
                context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = manager?.adapter
            if (adapter == null || !adapter.isEnabled) {
                return CodecInfo.UNAVAILABLE
            }

            var result: CodecInfo = CodecInfo.UNAVAILABLE
            val latch = java.util.concurrent.CountDownLatch(1)

            // getProfileProxy() asinkron: kita menunggu sebentar di sini karena
            // pemanggilnya (JNI getter) memang sinkron. Batas waktunya pendek
            // supaya tidak memblokir audio thread kalau Bluetooth tidak siap.
            val listener = object : BluetoothProfile.ServiceListener {
                override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                    try {
                        val a2dp = proxy as? BluetoothA2dp
                        val device: BluetoothDevice? =
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                adapter.getMostRecentlyConnectedDevices()
                                    .firstOrNull { d ->
                                        try {
                                            adapter.getProfileConnectionState(
                                                BluetoothProfile.A2DP
                                            ) == BluetoothProfile.STATE_CONNECTED
                                        } catch (e: Exception) {
                                            false
                                        }
                                    }
                            } else {
                                null
                            }

                        val target = device ?: run {
                            // Tidak ketemu device spesifik: coba device A2DP
                            // pertama yang terhubung lewat proxy.
                            try {
                                a2dp.connectedDevices.firstOrNull()
                            } catch (e: Exception) {
                                null
                            }
                        }

                        val status: BluetoothCodecStatus? = try {
                            if (target != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                a2dp.getCodecStatus(target)
                            } else {
                                null
                            }
                        } catch (e: SecurityException) {
                            Log.w(TAG, "getCodecStatus ditolak: ${e.message}")
                            null
                        } catch (e: Exception) {
                            null
                        }

                        val config: BluetoothCodecConfig? = status?.codecConfig
                        if (config != null) {
                            val type = config.codecType
                            result = CodecInfo(
                                available = true,
                                codecName = codecTypeName(type),
                                sampleRate = sampleRateOf(config),
                                bitsPerSample = bitsOf(config),
                                bitrate = config.codecSpecific1.takeIf { it > 0 } ?: 0,
                                lossless = isLossless(type),
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

            val opened = adapter.getProfileProxy(
                context, listener, BluetoothProfile.A2DP
            )

            if (!opened) {
                Log.d(TAG, "getProfileProxy(A2DP) gagal dibuka")
                return CodecInfo.UNAVAILABLE
            }

            // Tunggu paling lama 400 ms. Callback berjalan di thread lain, dan
            // kalau Bluetooth tidak responsif kita lebih baik melaporkan
            // "tidak tersedia" daripada menggantung pemanggilnya.
            latch.await(400, java.util.concurrent.TimeUnit.MILLISECONDS)

            if (result.available) {
                Log.i(
                    TAG,
                    "codec A2DP aktif: ${result.codecName} " +
                        "${result.sampleRate} Hz / ${result.bitsPerSample} bit" +
                        if (result.lossless) " (lossless)" else " (LOSSY)",
                )
            }

            result
        } catch (e: SecurityException) {
            // BLUETOOTH_CONNECT belum diberikan.
            Log.w(TAG, "izin BLUETOOTH_CONNECT belum ada: ${e.message}")
            CodecInfo.UNAVAILABLE
        } catch (e: Exception) {
            Log.w(TAG, "baca codec gagal: ${e.message}")
            CodecInfo.UNAVAILABLE
        }
    }
}
