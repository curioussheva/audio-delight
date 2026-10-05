package com.pristineaudio.audio

/**
 * Deskripsi satu perangkat output audio.
 *
 * Konstruktor ini dipanggil dari native (NativeDeviceModule.cpp) lewat JNI.
 * Signature-nya HARUS cocok persis dengan yang dipakai GetMethodID di sana:
 *
 *   (Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;IZ)V
 *
 * Kalau salah satu tipe diubah di sini, native tidak akan menemukan
 * konstruktornya dan daftar device kembali kosong TANPA error yang jelas.
 */
data class AudioDeviceInfo(
    /** ID perangkat dari Android (AudioDeviceInfo.getId()). */
    val id: String,

    /** Nama yang ditampilkan, mis. "USB Audio DAC". */
    val name: String,

    /** "usb", "speaker", "headset", "bluetooth", "hdmi", "earpiece", "unknown". */
    val type: String,

    /**
     * Laju maksimum yang didukung perangkat ini.
     *
     * Bukan konstanta: HP biasanya 48000, DAC bisa 384000. Dipakai UI untuk
     * menunjukkan laju mana yang tersedia.
     */
    val sampleRate: Int,

    /**
     * true kalau perangkat bisa punya jalur langsung ke perangkat keras
     * (lewati mixer sistem). Hanya USB dan HDMI.
     *
     * Speaker dan headphone built-in SELALU lewat mixer, jadi nilainya false -
     * penting supaya UI tidak menawarkan "bit-perfect" untuk perangkat yang
     * secara teknis tidak bisa.
     */
    val exclusive: Boolean,
) {
    /** true kalau perangkat ini DAC USB eksternal. */
    val isUsb: Boolean get() = type == "usb"

    /** Label ringkas untuk UI. */
    fun displayLabel(): String =
        buildString {
            append(name)
            append(" (")
            append(if (sampleRate >= 1000) "${sampleRate / 1000} kHz" else "$sampleRate Hz")
            if (exclusive) append(", langsung") else append(", lewat mixer")
            append(")")
        }
}
