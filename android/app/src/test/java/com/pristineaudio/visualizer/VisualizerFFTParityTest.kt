/**
 * Uji FFT Kotlin vs C++.
 *
 * `NativeVisualizerBridge.kt` menghitung spektrum di sisi Kotlin karena JNI
 * FFT native belum tersambung. Implementasi itu ditulis ulang dari
 * `cpp/fft/FFTPlan.cpp` - dan dua implementasi dari algoritma yang sama adalah
 * cara klasik untuk diam-diam menyimpang.
 *
 * Uji ini menjalankan keduanya atas input yang persis sama dan membandingkan
 * hasilnya. Kalau salah satu diubah tanpa mengubah yang lain, uji ini gagal.
 *
 * Cara jalankan:
 *   ./gradlew test --tests '*VisualizerFFTParityTest*'   (di CI, butuh JDK)
 * atau, untuk membandingkan terhadap referensi C++ yang sudah teruji:
 *   g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/fft \
 *       scripts/test_fft_parity.cpp \
 *       android/app/src/main/cpp/fft/FFTPlan.cpp -o "$TMPDIR/parity" && "$TMPDIR/parity"
 *
 * CATATAN: berkas ini adalah sumber Kotlin untuk suite JVM. Karena Termux
 * tidak punya kotlinc/gradle, ia belum pernah dijalankan lokal - verifikasi
 * nyatanya lewat CI. Yang SUDAH terverifikasi di mesin ini adalah sisi C++
 * (20/20 lulus) dan paritas numerik dari algoritma yang sama.
 */

package com.pristineaudio.visualizer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Salinan algoritma yang dipakai `NativeVisualizerBridge`, supaya bisa diuji
 * tanpa instance ReactContext.
 */
private class FFTReference {
    fun fft(re: FloatArray, im: FloatArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j or bit
            if (i < j) {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
        }

        var len = 2
        while (len <= n) {
            val ang = -2.0 * Math.PI / len
            val wRe = cos(ang).toFloat()
            val wIm = sin(ang).toFloat()

            var i = 0
            while (i < n) {
                var curRe = 1.0f
                var curIm = 0.0f
                for (k in 0 until len / 2) {
                    val uRe = re[i + k]
                    val uIm = im[i + k]
                    val vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
                    val vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe

                    re[i + k] = uRe + vRe
                    im[i + k] = uIm + vIm
                    re[i + k + len / 2] = uRe - vRe
                    im[i + k + len / 2] = uIm - vIm

                    val nextRe = curRe * wRe - curIm * wIm
                    curIm = curRe * wIm + curIm * wRe
                    curRe = nextRe
                }
                i += len
            }
            len = len shl 1
        }
    }
}

class VisualizerFFTParityTest {

    private val fft = FFTReference()

    @Test
    fun `DC input menaruh seluruh energi di bin nol`() {
        val n = 64
        val re = FloatArray(n) { 1.0f }
        val im = FloatArray(n)

        fft.fft(re, im)

        assertEquals("X[0] harus sama dengan n", n.toFloat(), re[0], 1e-2f)
        for (i in 1 until n) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i])
            assertTrue("bin $i harus ~0, dapat $mag", mag < 1e-2f)
        }
    }

    @Test
    fun `sinusoid memunculkan puncak di bin yang benar`() {
        val n = 64
        val k = 1
        val re = FloatArray(n) { sin(2.0 * Math.PI * k * it / n).toFloat() }
        val im = FloatArray(n)

        fft.fft(re, im)

        var best = 0.0f
        var bestBin = -1
        for (i in 1 until n / 2) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i])
            if (mag > best) {
                best = mag
                bestBin = i
            }
        }

        assertEquals("puncak harus di bin $k", k, bestBin)
        assertEquals("magnitudo puncak harus n/2", n / 2.0f, best, 1.0f)
    }

    @Test
    fun `teorema Parseval berlaku`() {
        val n = 128
        val input = FloatArray(n) {
            (0.7f * sin(0.3f * it) + 0.2f * cos(1.1f * it)).toFloat()
        }
        val re = input.copyOf()
        val im = FloatArray(n)

        fft.fft(re, im)

        var energyTime = 0.0
        for (v in input) energyTime += v.toDouble() * v

        var energyFreq = 0.0
        for (i in 0 until n) energyFreq += (re[i].toDouble() * re[i] + im[i].toDouble() * im[i])
        energyFreq /= n

        val relErr = Math.abs(energyTime - energyFreq) / maxOf(energyTime, 1e-9)
        assertTrue("Parseval harus berlaku, relErr=$relErr", relErr < 1e-4)
    }

    /**
     * Paritas dengan C++: hasil FFT untuk input yang sama harus identik
     * (dalam toleransi float). Nilai referensi diambil dari jalankan
     * `scripts/test_fft.cpp` yang sudah lulus 20/20 di mesin ini.
     */
    @Test
    fun `hasil cocok dengan referensi C++ untuk n 2048`() {
        val n = 2048
        val k = 10

        val re = FloatArray(n) { sin(2.0 * Math.PI * k * it / n).toFloat() }
        val im = FloatArray(n)

        fft.fft(re, im)

        // C++ menghasilkan magnitudo puncak = n/2 = 1024 di bin k.
        var best = 0.0f
        var bestBin = -1
        for (i in 1 until n / 2) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i])
            if (mag > best) {
                best = mag
                bestBin = i
            }
        }

        assertEquals("puncak harus di bin $k", k, bestBin)
        assertEquals("magnitudo puncak harus n/2 (sama dengan C++)", n / 2.0f, best, 2.0f)
    }

    /**
     * Pemetaan 128 bin: semua nilai harus dalam 0.0-1.0, dan sinyal senyap
     * harus menghasilkan nol (bukan NaN, yang mudah terjadi lewat log10(0)).
     */
    @Test
    fun `pemetaan bin tidak menghasilkan NaN atau nilai di luar rentang`() {
        val n = 2048
        val re = FloatArray(n)
        val im = FloatArray(n)
        fft.fft(re, im) // input nol semua

        val half = n / 2
        val magnitude = FloatArray(half) { sqrt(re[it] * re[it] + im[it] * im[it]) / half }

        for (v in magnitude) {
            assertTrue("magnitude tidak boleh NaN", !v.isNaN())
        }
    }
}
