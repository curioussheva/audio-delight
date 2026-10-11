# Audit Visualizer / Spectrogram

Status: **DIPERBAIKI** (lihat "Perbaikan"). Dokumen ini menyimpan diagnosis asal
supaya kalau gejalanya muncul lagi, jejaknya ada.

## Gejala yang dilaporkan

> "bagian visualizer/spectogram view, baru analizer"

Yang tampil: analyzer (bar bergerak). Yang tidak muncul: spektrum nyata.

## Rantai data (yang benar)

```
AudioCallback (C++, audio thread)
  -> VisualizerBuffer.write()          mono mixdown, ring buffer 2048
  -> AudioEngine::getVisualizerData()  (UI thread)
  -> JNI Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getVisualizerData
  -> NativeVisualizerBridge.kt: FFT 2048 -> 128 bin log-scaled
  -> VisualizerService.ts (polling 50ms) -> SharedValue
  -> SpectogramView / SpectrumAnalyzer
```

## Tiga cacat yang ditemukan

### 1. Package Kotlin tidak cocok dengan simbol JNI (FATAL)

File Kotlin ada di direktori `java/com/pristineaudio/visualizer/` tapi berisi:

```kotlin
package com.pristineaudio        // <- bukan com.pristineaudio.visualizer
```

Sementara JNI-nya:

```cpp
Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getVisualizerData
//     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ mengharapkan .visualizer
```

Nama tidak cocok -> simbol tidak pernah ditemukan -> `UnsatisfiedLinkError`
setiap kali `getFFTData()` dipanggil.

`UnsatisfiedLinkError` adalah subclass `Error`, bukan `Exception`. Handler
`catch (e: Exception)` **tidak** menangkapnya.

Perbaikan: `package` diubah menjadi `com.pristineaudio.visualizer`, dan import
di `PristineAudioPackage.kt` disesuaikan.

**Koreksi atas audit pertama:** audit awal menyatakan "tidak ada simbol JNI
sama sekali". Itu salah - `cpp/jni/NativeVisualizerModule.cpp` ada dan lengkap.
Yang salah cuma nama paketnya. Pencarian pertama gagal karena mencari pola
`Java_com_pristineaudio_` sementara yang ada `Java_com_pristineaudio_visualizer_`.

### 2. `VisualizerBuffer` tidak pernah di-flip (data robek)

```cpp
void VisualizerBuffer::write(...) {
    const int writeBuffer = mWriteBuffer.load(...);   // selalu 0
    float* dst = writeBuffer == 0 ? mBufferA : mBufferB;
    ...
}

void VisualizerBuffer::read(...) const {
    const int readBuffer = mWriteBuffer.load(...);    // SELALU 0 - nilai yang sama
    const float* src = readBuffer == 0 ? mBufferA : mBufferB;
    ...
}
```

`mWriteBuffer` diinisialisasi 0 dan **tidak ada kode yang pernah mengubahnya**
(diverifikasi: `grep mWriteBuffer` hanya menemukan tiga tempat di file yang
sama - deklarasi, dan dua `load()`). Jadi audio thread menulis ke `mBufferA`
sementara UI thread membaca dari `mBufferA` pada saat yang sama.

Perbaikan: `read()` mengambil kebalikannya (`writeBuffer == 0 ? 1 : 0`),
sehingga pembaca selalu memakai buffer yang tidak sedang ditulis.

### 3. `FFTPlan::forward()` adalah stub (transformasi identitas)

```cpp
void FFTPlan::forward(const float* realInput, Complex* complexOutput) {
    // stub
    for (int i = 0; i < mSize; ++i) {
        complexOutput[i] = Complex(realInput[i], 0.0f);
    }
}
```

Tidak ada FFT. `mCfg` selalu `nullptr` dengan komentar `// kiss_fft_cfg` yang
tidak pernah dialokasikan. Magnitude keluaran = `|x[n]|`, bukan spektrum.

Perbaikan: implementasi radix-2 decimation-in-time yang nyata, dengan tabel
twiddle dan bit-reversal dihitung sekali di konstruktor (tidak ada alokasi di
`forward()`). `inverse()` juga diimplementasikan (konjugasi-forward-konjugasi-scale).

## Hal lain yang ditemukan sekaligus

### `android.media.audiofx.Visualizer` dibuat lalu dibuang

`startVisualizer()` membuat objek tersebut dengan `captureSize` dan
`enabled = true`, tapi `getFFTData()` **tidak pernah membacanya**. Objek itu
menahan sumber daya audiofx yang bisa bentrok dengan sesi Oboe low-latency.
Dihapus; data sekarang murni dari engine sendiri.

### Kegagalan disamarkan sebagai array kosong

```kotlin
if (!nativeAvailable) {
    promise.resolve(Arguments.createArray())   // array kosong
    return
}
try { ... } catch (e: Exception) {
    promise.resolve(Arguments.createArray())   // array kosong lagi
}
```

Dua jalur kegagalan menghasilkan nilai balik yang sama dengan "tidak ada
suara". Sekarang keduanya `promise.reject()` dengan kode spesifik
(`VISUALIZER_UNAVAILABLE`, `VISUALIZER_SHORT_BUFFER`, `VISUALIZER_ERROR`), dan
`VisualizerService` melaporkan kegagalan pertama lewat `onError` - sekali saja,
karena polling berjalan 20x per detik.

### Buffer 256 sample vs kebutuhan FFT 2048

JNI mengembalikan `kVisualizerSize = 256` sample mentah, sementara `FFT_SIZE`
adalah 2048. Perbaikan: Kotlin memeriksa panjang buffer dan menolak dengan
`VISUALIZER_SHORT_BUFFER` kalau kurang, daripada membaca keluar batas.

## Perbaikan yang dilakukan

| # | Berkas | Perubahan |
|---|---|---|
| 1 | `NativeVisualizerBridge.kt` | `package` -> `com.pristineaudio.visualizer` |
| 2 | `PristineAudioPackage.kt` | import disesuaikan |
| 3 | `visualizer/VisualizerBuffer.cpp` | `read()` memakai buffer kebalikan |
| 4 | `fft/FFTPlan.{h,cpp}` | FFT radix-2 nyata, tabel precomputed |
| 5 | `NativeVisualizerBridge.kt` | FFT 2048 -> 128 bin log-scaled, reject jujur |
| 6 | `VisualizerService.ts` | laporkan kegagalan pertama, hitung kegagalan berturut |
| 7 | `CMakeLists.txt` | definisi `PRISTINE_HAVE_LIBLOG` |

## Verifikasi

| Uji | Hasil |
|---|---|
| `scripts/test_fft.cpp` (DC, sinusoid, Parseval, round-trip, ukuran) | **20/20 lulus** |
| `scripts/test_fft_parity.cpp` (Kotlin vs C++) | **3/3 lulus**, selisih maks `1.99e-06` |
| `tsc --noEmit` | 0 error |
| Jest | 187/187 |

Parseval error `8.18e-08` dan round-trip error `4.17e-07` membuktikan FFT-nya
mentransformasi dengan benar, bukan menyalin.

## Catatan untuk ke depan

### FFT ada di dua tempat

Implementasi FFT sekarang ada di **dua** tempat: `cpp/fft/FFTPlan.cpp` dan
`NativeVisualizerBridge.kt` (`fftInPlace`). Ini sengaja - JNI untuk FFT native
belum ada (`NativeVisualizerModule.cpp` hanya mengembalikan sample mentah), jadi
Kotlin menghitung sendiri supaya visualizer berfungsi tanpa jalur JNI baru.

Risikonya jelas: dua salinan algoritma bisa menyimpang. Karena itu ada
`scripts/test_fft_parity.cpp` + `VisualizerFFTParityTest.kt` yang membandingkan
keduanya atas input identik. **Kalau salah satu diubah, jalankan uji paritas.**

Kalau nanti FFT dipindah sepenuhnya ke native, yang perlu dihapus: `fftInPlace`,
`computeSpectrum`, `mapToLogBins`, `logIndex` di Kotlin.

### `PRISTINE_HAVE_LIBLOG`

`FFTPlan.cpp` butuh `<android/log.h>`, tapi lingkungan pengembangan (Termux)
**juga** mendefinisikan `__ANDROID__` dan `__ANDROID_API__` (ini memang Android)
tanpa menyediakan liblog. Dua percobaan `#ifdef` gagal:

- `#ifdef __ANDROID__` -> header ketemu, `__android_log_print` gagal linking
- `#ifdef ANDROID_NDK` -> `ANDROID_NDK` ada sebagai environment variable

Solusinya flag eksplisit `PRISTINE_HAVE_LIBLOG`, didefinisikan di `CMakeLists.txt`
(hanya ada saat dibangun lewat NDK). Di luar itu `LOGD` menjadi no-op, sehingga
berkas C++ yang sama bisa dikompilasi di Termux untuk pengujian.
