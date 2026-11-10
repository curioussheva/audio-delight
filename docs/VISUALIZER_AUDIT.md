# Audit Visualizer / Spectrogram

Status: **TIDAK BERFUNGSI** (koreksi 2026-11-10 — lihat "Koreksi status 2026-11-10" di bawah). Dokumen ini menyimpan diagnosis asal
supaya kalau gejalanya muncul lagi, jejaknya ada.

## Koreksi status 2026-11-10

Audit hulu-ke-hilir 2026-11-10 (`AUDIT_2026-11-10.md`, branch
`fix/ffmpeg-disable-doc` @ `c63b4421`) menemukan visualizer live **mati total**
— tiga blocker bertumpuk, masing-masing berdiri sendiri sudah cukup mematikan
jalur ini. Status "DIPERBAIKI" di atas **salah** dan dikoreksi di sini; isi
dokumen ini di bawah tetap berlaku sebagai catatan diagnosis & perbaikan
Oktober 2026, kecuali yang dikoreksi di bawah.

1. **Session ID tidak pernah sampai (blocker).**
   `playerStore.audioSessionId` tidak pernah ditulis siapa pun
   (`playerStore.ts:181` initial `null`, setter `:918` nol pemanggil di `src/`).
   Satu-satunya penulis session ID adalah `useAudioPlayer.ts:35-52` — ke
   **equalizer store**, bukan player store. Akibatnya `visualizer.tsx:30`
   `hasValidSession` selalu false dan `VisualizerService` tidak pernah di-start.
   `engine.enableVisualizer()` (`engine.ts:236`) juga tanpa pemanggil.
2. **JNI 256 sample vs FFT 2048 (blocker).**
   `NativeVisualizerModule.cpp:23` `kVisualizerSize = 256`, sementara
   `FFT_SIZE = 2048` (`NativeVisualizerBridge.kt:59`) dan Kotlin menolak
   `< 2048` (`:140-142`, `VISUALIZER_SHORT_BUFFER`). `getFFTData()` selalu
   reject — bahkan bila blocker 1 diperbaiki. "Perbaikan" di bawah (Kotlin
   memeriksa panjang buffer dan menolak) adalah **diagnosis, bukan perbaikan
   ukuran buffer** — ukuran JNI-nya tetap 256.
3. **Buffer baca tidak pernah ditulis; `read()` selalu nol (blocker).**
   `VisualizerBuffer.h:39` `mWriteBuffer{0}`; `write()` load di `:30`, `read()`
   load di `:85` — **tidak ada `store` di file mana pun**. "Perbaikan" di bawah
   (`read()` mengambil buffer kebalikan, commit 9848ed0d) membuat write selalu
   ke mBufferA dan read selalu dari mBufferB, yang hanya di-`memset` 0 di
   konstruktor. Sebelumnya robek, sesudahnya selalu nol. Kalaupun blocker 1+2
   diperbaiki, data yang dibaca tetap nol.

Yang tampil di layar hari ini bukan spektrum nyata, melainkan animasi sinus
palsu (`SpectrumAnalyzer.tsx:160-172`, tanpa indikator di build release).

**Yang tetap benar dari dokumen ini:** perbaikan nama package JNI (#1),
FFT radix-2 nyata di `FFTPlan` (#3/4), dan hasil uji matematika FFT di bawah
(20/20, paritas 3/3).

**Yang salah di dokumen ini (selain status):**
- "VisualizerService melaporkan kegagalan pertama lewat `onError`" — salah:
  field `onError` (`VisualizerService.ts:73`) **tidak punya setter**, jadi
  `this.onError?.(error)` (`:349`) tidak pernah fire.
- "FFT ada di dua tempat" — sekarang **tiga** tempat (ditambah C++
  `SpectrumAnalyzer`/`FFTProcessor`/`SpectrumVisualizer` di `fft/`, nyata tapi
  nol pemanggil di luar `fft/`).
- Klaim Jest 187/187 di bawah adalah suite repo, bukan jalur ini — nol test
  visualizer di `src/__tests__`.

**Perbaikan 2026-11-10** (lihat `AUDIT_2026-11-10.md` § "Perbaikan
2026-11-10"): ketiga blocker diperbaiki di kode — session ID ditulis ke
player store saat startup (`initStore` + getter `getSessionId()` baru) dan
dijembatani dari `syncAudioSession`; `kVisualizerSize` JNI 256 → 2048; `read()`
kembali membaca buffer yang sama dengan `write()` (koreksi: rekomendasi
"flip per `write()`" dari audit semula salah — flip per panggilan menyebar
chunk selang-seling ke dua buffer); test baru
`scripts/test_visualizer_buffer.cpp` **6/6 lolos** (sebelum perbaikan 1/6).
`tsc --noEmit` 0 error, Jest 187/187 lolos. **Status dokumen ini tetap
TIDAK BERFUNGSI sampai Fase 1 device verification membuktikan rantai hidup
di device** — perbaikan kode belum sama dengan perbaikan terverifikasi.

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
`scripts/test_fft_parity.cpp`, yang menjalankan **kedua algoritma** atas input
identik dan membandingkan spektrumnya. **Kalau salah satu diubah, jalankan uji
paritas.**

```bash
g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/fft \
    scripts/test_fft_parity.cpp \
    android/app/src/main/cpp/fft/FFTPlan.cpp -o "$TMPDIR/parity" && "$TMPDIR/parity"
```

Hasil terakhir: selisih maksimum `1.99e-06` (skala 0..1).

Kalau nanti FFT dipindah sepenuhnya ke native, yang perlu dihapus: `fftInPlace`,
`computeSpectrum`, `mapToLogBins`, `logIndex` di Kotlin.

### Kotlin tidak bisa dikompilasi di Termux

Tidak ada `kotlinc`, tidak ada gradle. Setiap kesalahan tipe Kotlin baru
terlihat setelah build CI berjalan ~6 menit - dan build gagal berarti satu
siklus terbuang. Ini terjadi dua kali pada perubahan ini:

1. `maxOf(linear: Float, 1e-9: Double)` - `maxOf` tidak punya overload untuk
   tipe campuran.
2. `sqrt(re[i] * re[i] + ...)` - `kotlin.math.sqrt` hanya punya overload
   Double untuk argumen skalar.

Kotlin **tidak** mempromosikan tipe numerik secara implisit seperti C++.
Operasi antara `Float` dan `Double` adalah error kompilasi, bukan konversi
otomatis - jadi setiap `.toDouble()`/`.toFloat()` harus eksplisit.

Sebelum commit yang menyentuh `.kt`, periksa manual pola-pola ini:

```bash
grep -nE "sqrt\(|ln\(|log\(|log10\(|pow\(|maxOf|minOf|coerce" \
  android/app/src/main/java/**/*.kt
```

Percobaan membuat pemeriksa statis (`scripts/check_kotlin.py`) **gagal** -
ia melewatkan kedua kasus nyata di atas sekaligus melaporkan false positive
pada `sqrt` yang sebenarnya benar, lalu dihapus. Alat yang tidak bisa dipercaya
lebih berbahaya daripada tidak ada, karena memberi rasa aman palsu.

### Test Kotlin tidak dijalankan CI

`android/app/build.gradle` tidak punya `testImplementation` untuk junit, dan
tidak ada workflow yang menjalankan `gradlew test`. Karena itu uji paritas
sengaja ditulis di C++ (`scripts/test_fft_parity.cpp`) yang bisa dijalankan
lokal, bukan sebagai `src/test/**.kt` yang akan menggagalkan kompilasi karena
`org.junit` tidak ditemukan.

### `PRISTINE_HAVE_LIBLOG`

`FFTPlan.cpp` butuh `<android/log.h>`, tapi lingkungan pengembangan (Termux)
**juga** mendefinisikan `__ANDROID__` dan `__ANDROID_API__` (ini memang Android)
tanpa menyediakan liblog. Dua percobaan `#ifdef` gagal:

- `#ifdef __ANDROID__` -> header ketemu, `__android_log_print` gagal linking
- `#ifdef ANDROID_NDK` -> `ANDROID_NDK` ada sebagai environment variable

Solusinya flag eksplisit `PRISTINE_HAVE_LIBLOG`, didefinisikan di `CMakeLists.txt`
(hanya ada saat dibangun lewat NDK). Di luar itu `LOGD` menjadi no-op, sehingga
berkas C++ yang sama bisa dikompilasi di Termux untuk pengujian.
