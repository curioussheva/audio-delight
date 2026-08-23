
# Todolist Pasca-Refactor Native — Bridge Kotlin ↔ JNI ↔ TS

Status: 23 Agustus 2026. Dokumen ini adalah peta kerja setelah audit awal terhadap:
- seluruh `JNIEXPORT` di `android/app/src/main/cpp/jni/*.cpp`
- seluruh `external fun` di `android/app/src/main/java/com/pristineaudio/`
- seluruh `src/specs/*.ts`
- pemakaian `NativeModules` di `src/features/**`

Hasil audit menunjukkan **banyak gap antara native, Kotlin, dan TS** yang kemungkinan besar menjadi penyebab force close atau modul native tidak berfungsi.

---

## TL;DR Prioritas

1. **Perbaiki mismatch library name & external fun di `NativeDSPModule.kt`** (paling sering dipakai).
2. **Buat Kotlin wrapper untuk modul JNI yang belum punya pasangan Kotlin** (NativePristineAudio, NativePlaybackModule, NativeDeviceModule, NativeAudioFeed/OboeAudioProcessor) — atau tentukan mana yang benar-benar dibutuhkan oleh UI.
3. **Wire `initPlaybackModule`** di `JNI_OnLoad` atau init native agar `PlaybackController` tidak null.
4. **Perbarui TS specs** agar sesuai dengan method Kotlin yang benar.
5. **Sesuaikan kode `features/`** dengan API yang sudah beres.

---

## 📊 Ringkasan Gap

| Modul JNI (C++) | Target Java class | Kotlin wrapper | TS spec | Dipakai di JS? |
|---|---|---|---|---|
| `NativeDSPModule.cpp` | `com.pristineaudio.dsp.NativeDSPModule` | ✅ Ada (`dsp/NativeDSPModule.kt`) | ✅ `NativeDSPModule.ts` | ✅ Equalizer/Player |
| `NativeVisualizerModule.cpp` | `com.pristineaudio.visualizer.NativeVisualizerBridge` | ✅ Ada (`visualizer/NativeVisualizerBridge.kt`) | ✅ `NativeVisualizerBridge.ts` | ✅ Visualizer |
| `USBDACModule` | — | ✅ Ada (`usb/USBDACModule.kt`) | ✅ `USBDACModule.ts` | ✅ Hardware |
| `MediaStoreModule` | — | ✅ Ada (`media/MediaStoreModule.kt`) | ✅ `MediaStoreModule.ts` | ✅ Library |
| `NativePristineAudio.cpp` | `com.pristineaudio.audio.NativePristineAudio` | ❌ **Tidak ada** | ✅ `NativePristineAudio.ts` (tapi tidak dipakai langsung) | ❓ |
| `NativePlaybackModule.cpp` | `com.pristineaudio.audio.NativePlaybackModule` | ❌ **Tidak ada** | ❌ Tidak ada | ❌ (pakai TrackPlayer) |
| `NativeDeviceModule.cpp` | `com.pristineaudio.audio.NativeDeviceModule` | ❌ **Tidak ada** | ❌ Tidak ada | ❌ |
| `NativeAudioFeed.cpp` | `com.pristineaudio.audio.OboeAudioProcessor` | ❌ **Tidak ada** | ❌ Tidak ada | ❌ |

---

## 🔴 Fase 1 — Perbaiki `NativeDSPModule.kt` (wajib)

### Masalah terkonfirmasi:

1. **Library name salah**  
   ```kotlin
   System.loadLibrary("pristineaudio_engine")
```

seharusnya:

```kotlin
   System.loadLibrary("pristine-audio")
```

(sesuai add_library(pristine-audio ...) di CMakeLists)

2. bootEngineNative() tidak ada di JNI — external fun menunjuk ke fungsi yang tidak pernah di-compile, sehingga selalu UnsatisfiedLinkError saat init → engineAvailable = false.
3. Banyak JNI functions tidak punya external fun:
   · setNativeDSPEnabled
   · setNativeLimiterEnabled
   · setProcessingMode
   · setNativeSolfeggioFreq
   · setNativeBrainwaveFreq
   · setNativeResonanceIntensity
   · setNativeImmersiveEnabled
4. external fun yang tidak cocok dengan JNI:
   · setNativeMasterGain → JNI setNativeMasterGain(float) ✅ cocok
   · setNativeStereoWide → JNI setNativeStereoWide(float) ✅
   · setNativeEqualizerBand → JNI setNativeEqualizerBand(int, float) ✅
   · setNativeBassBoost → JNI setNativeBassBoost(float) ✅
   · setNativeBalance → JNI setNativeBalance(float) ✅
   · toggleNativeExclusiveMode → JNI toggleNativeExclusiveMode(bool) ✅
5. Method @ReactMethod yang tidak konsisten:
   · createAudioSession() Kotlin selalu sessionId=0 dan isNew=false; sebaiknya implementasikan dengan AudioManager.generateAudioSessionId() seperti di USBDACModule.
   · setFullEqualizer() Kotlin menggunakan getDouble(i).toFloat() — aman, tapi perhatikan mapping band.
   · setVirtualizer() memetakan strength / 1000.0 — perlu dipastikan dengan UI.

Tindakan:

☐ Ganti System.loadLibrary("pristineaudio_engine") → System.loadLibrary("pristine-audio")
☐ Hapus atau implementasikan bootEngineNative(). Saran: hapus saja, karena engine tidak perlu diboot via fungsi terpisah — engine diakses langsung dari EngineManager di C++.
☐ Tambahkan external fun untuk 7 JNI functions yang hilang.
☐ Tambahkan @ReactMethod untuk method-method baru tersebut (opsional, sesuai kebutuhan UI): setDSPEnabled, setLimiterEnabled, setProcessingMode, setSolfeggioFreq, setBrainwaveFreq, setResonanceIntensity, setImmersiveEnabled.
☐ Perbaiki createAudioSession() agar mengembalikan sessionId valid.

---

🔴 Fase 2 — Buat Kotlin Wrapper untuk Modul JNI yang Hilang

Modul JNI berikut tidak terdaftar di package manapun, sehingga tidak bisa diakses dari JS via NativeModules.

Prioritas (berdasarkan kebutuhan UI):

A. NativePristineAudio (core engine)

· JNI exports: nativeStart, nativeStop, nativePushAudio(float[], int), nativeIsRunning(), nativeGetLatency(), nativeGetUnderruns(), nativeGetOverruns()
· Target: com.pristineaudio.audio.NativePristineAudio
· Kotlin module: buat NativePristineAudioModule.kt dengan @ReactModule(name = "NativePristineAudio")
  · external fun nativeStart()
  · external fun nativeStop()
  · external fun nativePushAudio(data: FloatArray, size: Int)
  · external fun nativeIsRunning(): Boolean
  · external fun nativeGetLatency(): Float
  · external fun nativeGetUnderruns(): Long
  · external fun nativeGetOverruns(): Long
  · @ReactMethod fun startEngine(), stopEngine(), dll.
· Daftarkan di USBDACPackage atau package baru NativeAudioPackage.

B. NativePlaybackModule (jika ingin pakai kontrol playback native sendiri)

· JNI exports: nativePlay, nativePause, nativeStop, nativeSeek(long), nativeGetPosition(), nativeGetStatus()
· Target: com.pristineaudio.audio.NativePlaybackModule
· Kotlin module: buat NativePlaybackModule.kt dengan @ReactModule(name = "NativePlaybackModule")
  · external fun untuk tiap fungsi di atas.
  · PENTING: panggil initPlaybackModule(controller) di JNI_OnLoad atau dari NativePristineAudio init agar gPlaybackController tidak null. Lihat Fase 3.
· Daftarkan di package.

C. NativeDeviceModule

· JNI exports: nativeGetDevices(), nativeSetActiveDevice(String)
· Target: com.pristineaudio.audio.NativeDeviceModule
· Catatan: nativeGetDevices() masih stub kosong (return empty array), tetapi nativeSetActiveDevice berfungsi. Bisa tetap dibuatkan wrapper untuk keperluan future.
· Daftarkan di package.

D. NativeAudioFeed (OboeAudioProcessor)

· JNI exports: feedFloatBuffer, feedPCM16Buffer
· Target: com.pristineaudio.audio.OboeAudioProcessor
· Kotlin module: buat OboeAudioProcessorModule.kt jika ingin streaming audio dari Java.
· Prioritas rendah karena belum dipakai di UI.

---

🔴 Fase 3 — Wire initPlaybackModule

Masalah: NativePlaybackModule.cpp memiliki gPlaybackController yang harus di-set sebelum fungsi play/pause/stop/seek dipanggil. Saat ini initPlaybackModule() tidak dipanggil di manapun.

Tindakan:

☐ Cek manager/EngineManager.h apakah punya getter PlaybackController* playbackController() atau playback().
☐ Panggil initPlaybackModule(EngineManager::get().playbackController()) di:
  · JNI_OnLoad (paling awal setelah library dimuat), atau
  · di init NativePristineAudio_nativeStart (sebelum engine start).
☐ Pastikan EngineManager sudah menginisialisasi PlaybackController.

---

🟡 Fase 4 — Sinkronkan TS Specs dengan Kotlin

Setelah Fase 1–3 selesai, perbarui src/specs/*.ts agar cocok dengan method Kotlin yang sebenarnya.

NativeDSPModule.ts

· Cocokkan dengan @ReactMethod yang ada di NativeDSPModule.kt (setelah perbaikan).
· Hapus method yang tidak ada: releaseAllFX (jika tidak ada), createAudioSession signature harus sesuai.
· Tambahkan method baru: setDSPEnabled, setLimiterEnabled, setProcessingMode, setSolfeggioFreq, setBrainwaveFreq, setResonanceIntensity, setImmersiveEnabled.

NativePristineAudio.ts

· Update nama method: startEngine → start, stopEngine → stop, dll. Sesuaikan dengan wrapper baru.
· Jika wrapper menggunakan @ReactMethod fun startEngine(), spec harus startEngine(): void.

NativeVisualizerBridge.ts

· Kotlin wrapper hanya punya startVisualizer(audioSessionId, promise), stopVisualizer(), getFFTData(promise), addListener, removeListeners.
· Spec saat ini sudah cocok, tapi pastikan getFFTData mengembalikan Promise<number[]> dan Kotlin resolve array. Sudah benar.

USBDACModule.ts

· Kotlin USBDACModule.kt punya banyak method; spec hanya detectDACs, setExclusiveMode, addListener, removeListeners. Perlu ditambah method lain (setSampleRate, getRecommendedSettings, createAudioSession, getCurrentAudioSessionId, releaseAudioSession, setEqualizerGains, releaseEqualizer, isExclusiveModeActive).

MediaStoreModule.ts

· Kotlin punya queryAudioFiles dan getAlbumArtUri. Spec saat ini scanMediaStore dan getAlbumArt. Tidak cocok. Perbarui.

---

🟢 Fase 5 — Sesuaikan Features JS

Setelah specs benar, periksa pemakaian di src/features/**:

☐ features/equalizer/api/nativeInterface.ts — ganti panggilan NativeDSPModule dengan method yang valid.
☐ features/player/api/playback.ts — perbaiki NativeDSPModule dan getActiveAudioSessionId (method tidak ada). Ganti dengan getCurrentAudioSessionId jika tersedia.
☐ features/player/api/engine.ts — ganti panggilan NativeDSPModule yang tidak valid.
☐ features/hardware/api/USBDACModule.ts — sesuaikan dengan spec baru.
☐ features/library/native/MediaStoreModule.ts — sesuaikan dengan method Kotlin.
☐ features/visualizer/** — pastikan NativeVisualizerBridge sesuai.

---

🧪 Fase 6 — Verifikasi

☐ Jalankan gradlew assembleDebug dan pastikan build sukses.
☐ Jalankan adb logcat saat membuka app; pastikan tidak ada UnsatisfiedLinkError, NoSuchMethodError, atau TurboModuleRegistry error.
☐ Test manual tiap fitur: Equalizer, Visualizer, USB DAC, Library, Player.

---

Catatan Penting

· Jangan mengubah API JNI tanpa memperbarui Kotlin wrapper. Sebaliknya, jangan menambahkan external fun tanpa JNI counterpart.
· Nama package Java di JNI (com/pristineaudio/...) harus sama persis dengan package Kotlin.
· Saat menambah modul Kotlin baru, daftarkan di USBDACPackage atau package baru, dan pastikan MainApplication memuat package tersebut.
· Untuk force close saat startup, cek dulu adb logcat untuk mendapatkan stack trace pasti sebelum melakukan perbaikan luas.

---

Ringkasan Status

· Sudah Benar: NativeVisualizerBridge, MediaStoreModule (partially), USBDACModule (partially).
· Perlu Perbaikan: NativeDSPModule (library name, external fun mismatch).
· Belum Ada: NativePristineAudio, NativePlaybackModule, NativeDeviceModule, NativeAudioFeed Kotlin wrapper.
· Belum Di-wire: initPlaybackModule.

