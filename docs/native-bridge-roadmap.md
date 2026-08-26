# Roadmap — Bridge Native (Kotlin + TS) untuk `NativeDeviceModule` & `NativePlaybackModule`

Status per 22 Agustus 2026. Lanjutan dari `build-fix-status.md`/`build-fix-changelog.md` (perbaikan C++ sudah selesai & tervalidasi CI). Dokumen ini fokus pada pembangunan bridge yang belum pernah ada, bukan perbaikan bug.

**Prasyarat sudah terpenuhi**: seluruh 82 file `.cpp` compile bersih, `PlaybackController`/`AudioDeviceManager` API sudah benar dan stabil di sisi C++.

---

## 🎯 Kerangka masalah

Ini **bukan** kerja sinkronisasi ("Kotlin ketinggalan dari C++") — JNI signature tidak berubah sepanjang perbaikan kemarin. Ini kerja **membangun baru**: dua modul C++ (`NativeDeviceModule`, `NativePlaybackModule`) kemungkinan besar belum pernah punya jalur ke JS sama sekali, dari sebelum sesi perbaikan pun. Indikasi: folder `java/com/pristineaudio/` hanya berisi `dsp/`, `media/`, `usb/`, `visualizer/` — tidak ada `device/` atau `playback/`.

**Cek dulu sebelum mulai** (konfirmasi indikasi ini benar, bukan asumsi):
```bash
find android/app/src/main/java/com/pristineaudio -iname "*Device*" -o -iname "*Playback*"
grep -rln "NativeDeviceModule\|NativePlaybackModule" android/app/src/main/java src/specs src/features
```

---

## 🔴 FASE A — Wiring C++ yang harus selesai duluan (blocker)

### A1. `initPlaybackModule()` tidak pernah dipanggil

`jni/NativePlaybackModule.cpp` punya `gPlaybackController` (variabel global) yang harus di-set lewat `initPlaybackModule(PlaybackController*)` sebelum `nativePlay()`/`nativePause()`/dst berfungsi. Saat ini tidak dipanggil dari manapun — kalau bridge Kotlin/TS dibangun sebelum ini di-fix, semua call dari JS akan silent no-op (tidak crash, tidak error, tapi juga tidak melakukan apa-apa).

**Todo:**
- [ ] Cari lokasi lifecycle yang tepat untuk memanggilnya — kandidat: `jni/Onload.cpp` (`JNI_OnLoad`), atau init sequence `NativePristineAudio.cpp`/`EngineManager`
- [ ] Perlu akses ke instance `PlaybackController` yang hidup selama app berjalan — kemungkinan besar perlu diambil dari `EngineManager::get()` (singleton, sudah ada) atau `PlaybackManager` (kalau itu yang jadi source of truth untuk playback)
- [ ] Tambahkan pemanggilan `initPlaybackModule(...)` di titik yang tepat
- [ ] Verifikasi: gak ada cara verifikasi via `scripts/check.sh` untuk ini (bukan compile error) — perlu test manual (panggil `nativePlay()` dari Kotlin/JS test harness, cek apakah state berubah)

**Keputusan desain yang perlu diambil**: apakah `PlaybackController` yang dipakai `NativePlaybackModule` itu instance yang sama dengan yang dipegang `EngineManager`, atau instance terpisah dari `PlaybackManager`? Ini menentukan di mana `initPlaybackModule()` seharusnya dipanggil. Perlu dicek arsitektur ownership `PlaybackController` dulu.

```bash
grep -rn "PlaybackController" android/app/src/main/cpp/manager/EngineManager.h android/app/src/main/cpp/playback/PlaybackManager.h
```

### A2. `NativeDeviceModule` — cek apakah ada blocker serupa

`nativeGetDevices()` saat ini masih **stub** (`return env->NewObjectArray(0, deviceClass, nullptr);` — selalu return array kosong). Ini bukan bug, tapi juga berarti membangun bridge Kotlin/TS untuk modul ini sekarang hanya akan menghasilkan UI yang selalu menunjukkan "tidak ada device" — tidak actionable sampai `AudioDeviceManager::getAvailableDevices()` diisi implementasi nyata (saat ini juga kemungkinan besar stub, perlu dicek).

```bash
grep -n "getAvailableDevices\|getActiveDevice" -A 5 android/app/src/main/cpp/devices/AudioDeviceManager.cpp
```

**Keputusan**: kalau `AudioDeviceManager` juga masih stub total, urutan kerja yang benar: isi implementasi `AudioDeviceManager` dulu (device enumeration nyata via Android AudioManager/USB APIs) → baru bangun bridge Kotlin/TS. Membangun bridge duluan untuk stub kosong tidak salah, tapi tidak akan bisa ditest sampai stub-nya diisi.

---

## 🟡 FASE B — Bangun Bridge (setelah Fase A jelas statusnya)

Urutan per modul, 3 lapis (pola sama dengan `NativeDSPModule`/`NativeVisualizerBridge` yang sudah ada — pakai itu sebagai referensi struktur):

### B1. `NativeDeviceModule`

- [ ] Baca `java/com/pristineaudio/dsp/NativeDSPModule.kt` sebagai referensi pola (struktur `Module`/`ReactContextBaseJavaModule`, cara load native lib, cara deklarasi `external fun`)
- [ ] Buat `java/com/pristineaudio/device/NativeDeviceModule.kt` — deklarasi `external fun nativeGetDevices()`, `external fun nativeSetActiveDevice(deviceId: String)`, wrapper method yang dipanggil dari JS
- [ ] Buat package registration (`DevicePackage.kt`, mirip `USBDACPackage.kt`) kalau pola project pakai package terpisah per modul
- [ ] Daftarkan package baru ke `MainApplication.kt` (`add(DevicePackage())`)
- [ ] Buat `src/specs/NativeDeviceModule.ts` — TurboModule spec
- [ ] Sambungkan ke `features/hardware/api/USBDACModule.ts` (cek dulu apakah file ini sudah dimaksudkan untuk device generik atau USB-DAC spesifik — mungkin perlu modul terpisah, bukan digabung)

### B2. `NativePlaybackModule`

**Tunggu Fase A1 selesai dulu** sebelum mulai — kalau tidak, hasil kerja Fase B2 tidak bisa ditest sama sekali.

- [ ] Baca `java/com/pristineaudio/visualizer/NativeVisualizerBridge.kt` sebagai referensi pola tambahan (kemungkinan lebih dekat ke kebutuhan playback yang butuh event/callback, dibanding `NativeDSPModule.kt` yang mungkin lebih request-response)
- [ ] Buat `java/com/pristineaudio/playback/NativePlaybackModule.kt` — deklarasi `external fun` untuk `nativePlay/nativePause/nativeStop/nativeSeek/nativeGetPosition/nativeGetStatus`
- [ ] Buat package registration, daftarkan ke `MainApplication.kt`
- [ ] Buat `src/specs/NativePlaybackModule.ts`
- [ ] Sambungkan ke `features/player/api/playback.ts`
- [ ] Tentukan strategi update posisi/status: polling dari JS (`setInterval` + `nativeGetPosition()`) atau event-based (native push event ke JS tiap callback audio)? Ini keputusan desain yang mempengaruhi bentuk API — cek dulu apakah ada mekanisme event emitter lain di project (`NativeVisualizerBridge` kemungkinan sudah punya pola ini untuk data spectrum/waveform yang real-time, bisa dicontoh)

---

## 🟢 FASE C — Setelah Bridge Jalan

- [ ] Testing manual: `features/player/` (play/pause/seek/status), `features/hardware/` (device list & selection)
- [ ] Cek ulang Langkah 0 dari `ui-js-post-native-refactor-todolist.md` untuk modul-modul lain (`NativeAudioFeed`, kapabilitas `dsp/immersive/*`, dll) — apply pola yang sama kalau ditemukan bridge lain yang belum ada

---

## Referensi

- `build-fix-status.md` / `build-fix-changelog.md` — status & histori perbaikan C++ (prasyarat fase ini)
- `ui-js-post-native-refactor-todolist.md` — peta risiko awal & inventarisasi permukaan JNI (Langkah 0 di situ masih relevan untuk modul selain 2 yang jadi fokus roadmap ini)
