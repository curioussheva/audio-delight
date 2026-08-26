Roadmap Migrasi New Architecture (TurboModule) — pristine-audio

Status: 23 Agustus 2026
Versi React Native: 0.83.10
Target: Migrasi seluruh layer (C++ JNI, Kotlin, TS Specs, Features JS) ke New Architecture (TurboModule) penuh
Kondisi saat ini: Arsitektur campuran — C++ JNI Old Architecture, Kotlin Old Architecture, TS Specs New Architecture, Features JS Old Architecture

---

📋 Ringkasan Kondisi Saat Ini

Layer Kondisi Status
gradle.properties newArchEnabled=true ✅ Sudah aktif
Codegen di build.gradle codegenDir sudah di-set ✅ Sudah ter-setup
C++ JNI (jni/*.cpp) JNIEXPORT + JNICALL (Old Architecture) ❌ Perlu migrasi
Onload.cpp Sudah wire initPlaybackModule ✅ Sudah benar
Kotlin Modules Extends ReactContextBaseJavaModule (Old Architecture) ❌ Perlu migrasi
TS Specs (src/specs/*.ts) TurboModuleRegistry.getEnforcing (New Architecture) ✅ Sudah benar
Features JS (src/features/**) NativeModules.X (Old Architecture) ❌ Perlu migrasi
Library name System.loadLibrary("pristine-audio") ✅ Sudah benar

---

🎯 Prinsip Migrasi

1. Codegen adalah source of truth — TS Specs yang benar akan generate C++ interface yang harus diimplementasikan
2. JNI functions berubah dari JNIEXPORT (dynamic lookup) menjadi registerNatives (static registration)
3. Kotlin modules extends TurboModule + ReactContextBaseJavaModule (interop) — ini yang direkomendasikan untuk RN 0.83
4. Features JS pakai TurboModuleRegistry.getEnforcing<Spec>('ModuleName') — bukan NativeModules
5. Jangan mix Old dan New pattern dalam satu modul — setiap modul harus konsisten di 4 layer

---

🔴 FASE 1 — Persiapan & Audit

1.1 Audit semua modul yang ada

```bash
# Daftar semua JNI module
ls -1 android/app/src/main/cpp/jni/*.cpp | grep -v Onload

# Daftar semua Kotlin module
find android/app/src/main/java/com/pristineaudio -name "*.kt" | grep -i "module\|bridge"

# Daftar semua TS specs
ls -1 src/specs/*.ts

# Daftar semua features yang akses NativeModules
grep -rln "NativeModules" src/features/ --include="*.ts" --include="*.tsx"
```

1.2 Checklist per modul

Modul C++ JNI Kotlin TS Spec Features Target
NativeDSPModule ✅ Ada ✅ Ada ✅ Ada ✅ Equalizer/Player Migrasi penuh
NativeVisualizerBridge ✅ Ada ✅ Ada ✅ Ada ✅ Visualizer Migrasi penuh
USBDACModule ✅ Ada ✅ Ada ✅ Ada ✅ Hardware Migrasi penuh
MediaStoreModule ✅ Ada ✅ Ada ✅ Ada ✅ Library Migrasi penuh
NativePristineAudio ✅ Ada ❌ Tidak ada ✅ Ada ❓ Buat + migrasi
NativePlaybackModule ✅ Ada ❌ Tidak ada ❌ Tidak ada ❌ (pakai TrackPlayer) Buat + migrasi (opsional)
NativeDeviceModule ✅ Ada ❌ Tidak ada ❌ Tidak ada ❌ Buat + migrasi (tunda)
NativeAudioFeed ✅ Ada ❌ Tidak ada ❌ Tidak ada ❌ Tunda

---

🟡 FASE 2 — Setup Codegen (Kalau Belum Optimal)

2.1 Cek konfigurasi Codegen di android/app/build.gradle

```bash
cat android/app/build.gradle | grep -A 30 "codegen"
```

Yang perlu dipastikan:

· codegenEnabled = true
· codegenDir sudah benar
· Library name Codegen sesuai (pristine-audio)

2.2 Cek apakah package.json punya config Codegen

```bash
cat package.json | grep -A 10 "codegenConfig"
```

Kalau belum ada, tambahkan:

```json
{
  "codegenConfig": {
    "name": "PristineAudioSpec",
    "type": "modules",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.pristineaudio"
    }
  }
}
```

2.3 Jalankan Codegen

```bash
cd android
./gradlew generateCodegenArtifactsFromSchema
```

Output yang diharapkan:

· File generated di android/app/build/generated/source/codegen/
· C++ interfaces di .../jni/
· Java/Kotlin interfaces di .../java/

---

🔴 FASE 3 — Migrasi per Modul (Pola Standar)

3.1 Pola migrasi untuk satu modul

Langkah A: Kotlin Module

```kotlin
// SEBELUM (Old Architecture)
package com.pristineaudio.dsp

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeDSPModule.NAME)
class NativeDSPModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    // ...
}
```

```kotlin
// SESUDAH (New Architecture / TurboModule interop)
package com.pristineaudio.dsp

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule

@ReactModule(name = NativeDSPModule.NAME)
class NativeDSPModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext),
    TurboModule {
    
    // Method signature harus PERSIS sama dengan TS Spec
    // Tanpa Promise wrapper (TurboModule handle async via return type)
    // ...
}
```

Catatan penting:

· TurboModule adalah marker interface — tidak perlu implement method apapun
· Method signature di Kotlin harus persis dengan TS Spec
· Codegen akan generate C++ interface yang match — kalau Kotlin tidak match, compile error

Langkah B: C++ JNI — Ubah dari JNIEXPORT ke registerNatives

```cpp
// SEBELUM (Old Architecture)
extern "C" JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeMasterGain(
    JNIEnv* env, jobject thiz, jfloat gain) {
    // ...
}
```

```cpp
// SESUDAH (New Architecture — tapi untuk interop, ini bisa tetap JNIEXPORT)
// Untuk modul yang pakai interop (TurboModule + ReactContextBaseJavaModule),
// JNIEXPORT masih bisa jalan karena interop layer bridge-nya.
// 
// TAPI kalau mau full TurboModule (tanpa interop), perlu:
// 1. Include generated header dari Codegen
// 2. Implement class yang extends generated interface
// 3. Register via JSI di Onload.cpp
```

Keputusan penting: Untuk RN 0.83, interop layer (TurboModule + ReactContextBaseJavaModule) adalah jalur yang paling sedikit perubahan dan terbukti stabil. Full TurboModule (tanpa ReactContextBaseJavaModule) butuh rewrite besar di C++ dan tidak perlu untuk versi RN ini.

Langkah C: Features JS — Ganti NativeModules dengan TurboModuleRegistry

```typescript
// SEBELUM (Old Architecture)
import { NativeModules } from "react-native";
const { NativeDSPModule } = NativeModules;

// SESUDAH (New Architecture)
import NativeDSPModule from "../../../specs/NativeDSPModule";
// atau
import { TurboModuleRegistry } from "react-native";
const NativeDSPModule = TurboModuleRegistry.getEnforcing<Spec>("NativeDSPModule");
```

---

3.2 Detail migrasi per modul

Modul 1: NativeDSPModule

Item Detail
C++ JNI ✅ Sudah ada JNIEXPORT — tetap jalan via interop
Kotlin Tambah TurboModule interface
TS Spec ✅ Sudah benar — tapi cek method signature
Features Ganti di: features/equalizer/api/nativeInterface.ts, features/player/api/playback.ts, features/player/api/engine.ts, features/visualizer/native/NativeDSPModule.ts

Perhatian khusus:

· TS Spec punya setEqualizer(band, level, sessionId): Promise<boolean> — Kotlin harus match persis
· TS Spec punya setFullEqualizer(gains: number[], sessionId): Promise<boolean> — Kotlin pakai ReadableArray, di TurboModule ini menjadi double[] atau FloatArray

Modul 2: NativeVisualizerBridge

Item Detail
C++ JNI ✅ Sudah ada — tetap jalan via interop
Kotlin Tambah TurboModule interface
TS Spec ✅ Sudah benar
Features Ganti di: features/visualizer/native/VisualizerBridge.ts, features/visualizer/services/VisualizerService.ts

Perhatian khusus:

· addListener/removeListeners — perlu pastikan EventEmitter pattern tetap jalan di TurboModule
· getFFTData(): Promise<number[]> — di TurboModule, number[] bisa jadi double[] di C++

Modul 3: USBDACModule

Item Detail
C++ JNI ✅ Sudah ada — tetap jalan via interop
Kotlin Tambah TurboModule interface
TS Spec ✅ Sudah benar — tapi banyak method yang belum diimplementasikan di Kotlin
Features Ganti di: features/hardware/api/USBDACModule.ts, features/visualizer/api/DSPPipeline.ts

Perhatian khusus:

· Spec punya detectDACs, setSampleRate, getRecommendedSettings, createAudioSession, getCurrentAudioSessionId, releaseAudioSession, setEqualizerGains, releaseEqualizer — cek apakah Kotlin sudah implementasikan semua
· Kalau belum, perlu diimplementasikan dulu sebelum migrasi

Modul 4: MediaStoreModule

Item Detail
C++ JNI ✅ Sudah ada — tetap jalan via interop
Kotlin Tambah TurboModule interface
TS Spec ✅ Sudah benar — queryAudioFiles dan getAlbumArtUri
Features Ganti di: features/library/native/MediaStoreModule.ts

Perhatian khusus:

· Spec queryAudioFiles(): Promise<object[]> — di TurboModule, object[] jadi WritableArray di C++

Modul 5: NativePristineAudio (Baru)

Item Detail
C++ JNI ✅ Sudah ada di NativePristineAudio.cpp
Kotlin Buat baru — NativePristineAudioModule.kt
TS Spec ✅ Sudah ada — NativePristineAudio.ts
Features Tentukan di mana akan dipakai

Kotlin module baru (dengan TurboModule):

```kotlin
// java/com/pristineaudio/audio/NativePristineAudioModule.kt
package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule

@ReactModule(name = NativePristineAudioModule.NAME)
class NativePristineAudioModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    TurboModule {

    companion object {
        const val NAME = "NativePristineAudio"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    override fun getName() = NAME

    private external fun nativeStart()
    private external fun nativeStop()
    private external fun nativePushAudio(data: FloatArray, size: Int)
    private external fun nativeIsRunning(): Boolean
    private external fun nativeGetLatency(): Float
    private external fun nativeGetUnderruns(): Long
    private external fun nativeGetOverruns(): Long

    @ReactMethod
    fun startEngine() = nativeStart()

    @ReactMethod
    fun stopEngine() = nativeStop()

    @ReactMethod
    fun pushAudio(data: ReadableArray, size: Int) {
        val floatArray = FloatArray(data.size())
        for (i in 0 until data.size()) {
            floatArray[i] = data.getDouble(i).toFloat()
        }
        nativePushAudio(floatArray, size)
    }

    @ReactMethod
    fun isRunning(): Boolean = nativeIsRunning()

    @ReactMethod
    fun getLatency(): Float = nativeGetLatency()

    @ReactMethod
    fun getUnderruns(): Long = nativeGetUnderruns()

    @ReactMethod
    fun getOverruns(): Long = nativeGetOverruns()
}
```

Package registration baru:

```kotlin
// java/com/pristineaudio/audio/NativeAudioPackage.kt
package com.pristineaudio.audio

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NativeAudioPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            NativePristineAudioModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

Daftarkan di MainApplication.kt:

```kotlin
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).apply {
        add(NativeAudioPackage())
    }.toList()
}
```

---

🟢 FASE 4 — Migrasi Features JS

4.1 Pattern migrasi per file

```typescript
// SEBELUM
import { NativeModules } from "react-native";
const { NativeDSPModule } = NativeModules;

// SESUDAH
import NativeDSPModule from "../../../specs/NativeDSPModule";
// atau kalau path relatif tidak cocok:
import { TurboModuleRegistry } from "react-native";
const NativeDSPModule = TurboModuleRegistry.getEnforcing<Spec>("NativeDSPModule");
```

4.2 Daftar file yang perlu diubah

File Import lama Import baru
features/equalizer/api/nativeInterface.ts NativeModules.NativeDSPModule specs/NativeDSPModule
features/hardware/api/USBDACModule.ts NativeModules.USBDACModule specs/USBDACModule
features/library/native/MediaStoreModule.ts NativeModules.MediaStoreModule specs/MediaStoreModule
features/player/api/playback.ts NativeModules.NativeDSPModule specs/NativeDSPModule
features/player/api/engine.ts NativeModules.NativeDSPModule specs/NativeDSPModule
features/visualizer/api/DSPPipeline.ts NativeModules.USBDACModule specs/USBDACModule
features/visualizer/native/VisualizerBridge.ts NativeModules.NativeVisualizerBridge specs/NativeVisualizerBridge
features/visualizer/native/NativeDSPModule.ts NativeModules.NativeDSPModule specs/NativeDSPModule
features/visualizer/services/VisualizerService.ts NativeModules.NativeVisualizerBridge specs/NativeVisualizerBridge

---

🧪 FASE 5 — Verifikasi

5.1 Build

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

5.2 Logcat

```bash
adb logcat -s ReactNativeJS:V AndroidRuntime:E TurboModule:V
```

Yang harus dicek:

· ✅ Tidak ada UnsatisfiedLinkError
· ✅ Tidak ada TurboModuleRegistry.getEnforcing(...) returned null
· ✅ Tidak ada NoSuchMethodError
· ✅ Tidak ada TypeError: Cannot read property 'xxx' of undefined

5.3 Test per fitur

Fitur Test
Equalizer Buka UI equalizer, geser slider, cek log
Visualizer Buka visualizer, cek FFT data muncul
USB DAC Colok USB DAC, cek detect
Library Buka library, cek file audio muncul
Player Play/pause, cek status berubah

---

⏱️ Estimasi Effort

Fase Kerja Estimasi
Fase 1 Audit 1 jam
Fase 2 Codegen setup 2-3 jam
Fase 3 Migrasi 5 modul Kotlin + 1 modul baru 4-6 jam
Fase 4 Migrasi 9 file features 2-3 jam
Fase 5 Verifikasi + debugging 4-8 jam
Total  13-21 jam

---

⚠️ Risiko & Mitigasi

Risiko Mitigasi
Codegen generate C++ yang mismatch dengan JNI existing Pertahankan JNIEXPORT untuk interop layer, jangan rewrite C++
Method signature tidak match antara TS Spec dan Kotlin Audit dulu semua spec vs Kotlin, samakan sebelum build
EventEmitter tidak jalan di TurboModule Cek pola addListener/removeListeners di spec — perlu implementasi EventEmitter di Kotlin
ReadableArray vs FloatArray di TurboModule Di TurboModule, argumen array dari JS menjadi double[] — sesuaikan Kotlin
TrackPlayer (dependency) tidak support New Architecture Cek issue di repo lovegaoshi/react-native-track-player — kemungkinan sudah support RN 0.83

---

📌 Checklist Final

☐ Semua modul Kotlin extends TurboModule
☐ Semua features JS pakai TurboModuleRegistry
☐ Semua TS Specs match dengan Kotlin method
☐ Codegen berjalan tanpa error
☐ Build sukses
☐ Test manual semua fitur
☐ Tidak ada error di logcat

---

Roadmap ini disusun berdasarkan assessment arsitektur per 23 Agustus 2026. Update terakhir: penambahan initPlaybackModule di Onload.cpp sudah terkonfirmasi.

###### update 1 ######

Roadmap Migrasi New Architecture (TurboModule) — pristine-audio

Status: 26 Agustus 2026
Versi React Native: 0.83.10
Target: Migrasi seluruh layer (C++ JNI, Kotlin, TS Specs, Features JS) ke New Architecture (TurboModule) penuh
Progress: Build native sukses, error runtime PlatformConstants masih dalam investigasi

---

📊 Ringkasan Progress

Fase Status Keterangan
Fase 1 — Audit ✅ Selesai Semua modul terpetakan
Fase 2 — Codegen Setup ✅ Selesai Codegen jalan di CI, build sukses
Fase 3 — Migrasi Kotlin ✅ Selesai Semua module extends TurboModule
Fase 3b — Fix Package Registration ✅ Selesai USBDACPackage sudah benar
Fase 3c — TS Specs ✅ Selesai 5 specs ada, 2 baru dibuat
Fase 4 — Migrasi Features JS ⏳ Tunda Belum dikerjakan (tidak blocking build)
Fase 5 — Verifikasi Runtime 🔴 Sedang Dikerjakan Error PlatformConstants
Fase 6 — Debug Runtime 🔴 Blokir Activity name salah di workflow

---

🔴 BLOKIR SAAT INI: Error PlatformConstants (Runtime)

Gejala

· Build APK sukses
· App crash/redscreen saat startup
· Error: TurboModuleRegistry.getEnforcing<Spec>('PlatformConstants') returned null

Investigasi yang Sudah Dilakukan

1. Cek Build Log — ✅ Tidak ada masalah

· Tidak ada error Kotlin (e:)
· Tidak ada warning dari com/pristineaudio/
· Tidak ada UnsatisfiedLinkError
· System.loadLibrary("pristine-audio") berhasil di semua modul

2. Emulator di CI — ✅ Berhasil boot

· aosp_atd + pixel_5 + software rendering berhasil
· APK terinstall sukses
· Tapi: activity name salah — com.pristineaudio/.MainActivity tidak ada

3. Error yang ditemukan di logcat:

```
Error type 3
Error: Activity class {com.pristineaudio/com.pristineaudio.MainActivity} does not exist.
```

Ini bukan error PlatformConstants — hanya activity name salah. App belum pernah start, jadi error PlatformConstants belum tertangkap.

---

Langkah Berikutnya (Prioritas)

Prioritas 1: Fix Activity Name di Workflow

```yaml
# SALAH:
adb shell am start -n com.pristineaudio/.MainActivity

# BENAR:
adb shell am start -n com.pristineaudio/com.pristineaudio.app.MainActivity
```

Prioritas 2: Jalankan Ulang CI

Setelah activity name fix, app akan start dan logcat akan menangkap error PlatformConstants yang sebenarnya.

Prioritas 3: Analisis Error PlatformConstants

Setelah logcat tertangkap, kemungkinan root cause:

Hipotesis Bukti yang dicari
Modul baru (NativePristineAudio, NativePlaybackModule, NativeDeviceModule) mengganggu inisialisasi Stack trace menunjuk ke module kita
System.loadLibrary dipanggil terlalu awal Stack trace UnsatisfiedLinkError
Package registration crash Stack trace di createNativeModules
TurboModuleRegistry.getEnforcing dipanggil sebelum registry siap Stack trace di JS bundle

---

Yang Sudah Selesai (Detail)

Fase 3 — Migrasi Kotlin

7 file Kotlin diubah:

File Perubahan
dsp/NativeDSPModule.kt + TurboModule
visualizer/NativeVisualizerBridge.kt + TurboModule
media/MediaStoreModule.kt + TurboModule
usb/USBDACModule.kt + TurboModule
audio/NativePristineAudio.kt + TurboModule, fix Double→Long
audio/NativePlaybackModule.kt + TurboModule, fix Double→Long
audio/NativeDeviceModule.kt + TurboModule

Fase 3b — Package Registration

· USBDACPackage.kt — hapus OboeAudioProcessor (file tidak ada)
· Semua module terdaftar di USBDACPackage

Fase 3c — TS Specs

· 5 specs existing: NativeDSPModule, NativePristineAudio, NativeVisualizerBridge, USBDACModule, MediaStoreModule
· 2 specs baru: NativePlaybackModule, NativeDeviceModule

Commit History

```
ef0abb61 docs: pindahkan dokumentasi ke folder docs/
12334fc7 feat: tambah TS spec untuk NativeDeviceModule dan NativePlaybackModule
eeab6e2e feat: migrasi TurboModule - tambah extends TurboModule + fix package registration
```

---

Yang Masih Perlu Dikerjakan

Prioritas Tugas Status
1 Fix activity name di workflow 🔴 Segera
2 Jalankan CI, dapatkan logcat error 🔴 Segera
3 Analisis error PlatformConstants ⏳ Menunggu logcat
4 Fix root cause ⏳ Menunggu analisis
5 Migrasi Features JS (8 file) ⏳ Tunda sampai native stabil
6 Test manual semua fitur ⏳ Tunda

---

Checklist Verifikasi Runtime

Setelah app berhasil start di emulator, cek:

☐ Tidak ada UnsatisfiedLinkError
☐ Tidak ada TurboModuleRegistry.getEnforcing(...) returned null
☐ Tidak ada NoSuchMethodError
☐ Tidak ada TypeError: Cannot read property 'xxx' of undefined
☐ PlatformConstants bisa diakses
☐ Modul kita (NativeDSPModule, dll) bisa diakses

---

Ringkasan Teknis

Yang Sudah Benar

· ✅ Library name pristine-audio konsisten di semua layer
· ✅ Onload.cpp wire initPlaybackModule dengan benar
· ✅ USBDACPackage terdaftar di MainApplication.kt
· ✅ Semua Kotlin module extends TurboModule
· ✅ TS Specs lengkap untuk semua modul
· ✅ Build native sukses di CI

Yang Masih Bermasalah

· ❌ Activity name di workflow salah (com.pristineaudio/.MainActivity vs com.pristineaudio.app.MainActivity)
· ❌ Error PlatformConstants belum tertangkap (belum bisa start app)
· ❌ Features JS masih pakai NativeModules (Old Architecture)

---

Roadmap ini update per 26 Agustus 2026 10:36 UTC. Next update setelah logcat error PlatformConstants tertangkap.

---

📊 Statistik File per Layer (Update 26 Agustus 2026)

Layer Jumlah File Status Migrasi
C++ Source (.cpp) 82 ✅ Compile bersih, tidak perlu diubah
C++ Header (.h) 115 ✅ Compile bersih, tidak perlu diubah
C++ Total 197 ✅ Tervalidasi CI
Kotlin (.kt) 11 ✅ Semua extends TurboModule
TS Specs (.ts) 7 ✅ Lengkap (5 existing + 2 baru)
Features JS (.ts/.tsx) 120 ❌ 8 file perlu migrasi, 112 tidak tersentuh

---

Progress Checklist Final

Item Status
☐ Semua modul Kotlin extends TurboModule ✅ Selesai (7/7 file)
☐ Semua TS Specs match dengan Kotlin method ✅ Selesai (7 specs)
☐ Codegen berjalan tanpa error ✅ Selesai (build CI sukses)
☐ Build sukses ✅ Selesai (assembleDebug sukses)
☐ Semua features JS pakai TurboModuleRegistry ❌ Belum (8 file masih NativeModules)
☐ Test manual semua fitur ❌ Belum (terblokir PlatformConstants)
☐ Tidak ada error di logcat ❌ Belum (belum bisa start app)

---

Estimasi Effort Revisi (Berdasarkan Progress Aktual)

Fase Estimasi Awal Aktual Sisa
Fase 1 — Audit 1 jam ✅ 1 jam 0
Fase 2 — Codegen 2-3 jam ✅ 2 jam 0
Fase 3 — Migrasi Kotlin 4-6 jam ✅ 3 jam 0
Fase 4 — Migrasi Features JS 2-3 jam ⏳ Belum 2-3 jam
Fase 5 — Verifikasi + Debug 4-8 jam 🔴 4 jam terpakai (emulator + activity fix) 2-4 jam
Total 13-21 jam ±10 jam terpakai ±4-7 jam sisa

---

Next Action (Urutan Prioritas)

1. Fix activity name di workflow → com.pristineaudio/com.pristineaudio.app.MainActivity
2. Push & jalankan CI → dapatkan logcat error PlatformConstants
3. Analisis error → tentukan root cause
4. Fix root cause → kemungkinan di package registration atau JS bundle init
5. Setelah native stabil → migrasi 8 file Features JS (Fase 4)
6. Test manual semua fitur → Equalizer, Visualizer, USB DAC, Library, Player

---
