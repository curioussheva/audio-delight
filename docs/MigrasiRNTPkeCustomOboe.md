Berikut adalah dokumen perencanaan migrasi untuk menggantikan react-native-track-player dengan implementasi kustom berbasis Oboe.

---

Roadmap Migrasi: RNTP → Custom Oboe Playback Service

Status: 31 Agustus 2026
Versi React Native: 0.83.10 (New Architecture)
Target: Menggantikan react-native-track-player (fork lovegaoshi) dengan implementasi native sendiri berbasis Oboe, tanpa lisensi komersial, dan sepenuhnya kompatibel dengan TurboModule/Fabric.

---

🎯 Tujuan

1. Menghilangkan ketergantungan pada RNTP (berbayar / tidak support New Architecture).
2. Mempertahankan Oboe sebagai mesin audio utama.
3. Menyediakan fitur setara RNTP: queue management, background playback, notifikasi media, kontrol lock screen/headset, audio focus.
4. Menyediakan API TurboModule untuk digunakan dari React Native/TypeScript.

---

📋 Lingkup Fitur yang Harus Didukung

Fitur Prioritas Keterangan
Play / Pause / Stop / Seek Tinggi Sudah ada di NativePlaybackModule
Queue Management (next/prev/shuffle/repeat) Tinggi Perlu dibangun
Foreground Service Tinggi Agar playback tetap jalan di background
Media Notification Tinggi Tombol kontrol di notifikasi
Lock Screen Controls Tinggi Via MediaSessionCompat
Headset/Bluetooth Controls Tinggi Via MediaSessionCompat.Callback
Audio Focus Handling Tinggi Diam saat panggilan masuk
Noisy Receiver Tinggi Pause saat headphone dicabut
Background Task Integration Sedang Untuk scan library sambil playback
Playlist/Room DB Integration Sedang Terhubung dengan store yang ada

---

🧱 Komponen yang Sudah Ada (Bisa Dipakai Ulang)

Komponen Lokasi Status
Oboe Engine cpp/core/AudioEngine.cpp ✅ Berfungsi
Playback Controller cpp/playback/PlaybackController.cpp ✅ Berfungsi
Playback Manager cpp/playback/PlaybackManager.cpp ✅ Berfungsi
Track Queue cpp/playback/TrackQueue.cpp ✅ Ada, belum ter-expose ke JS
Audio Focus Manager cpp/session/AudioFocusManager.cpp ✅ Ada, belum ter-expose
Transport Controls cpp/session/TransportControls.cpp ✅ Ada, belum ter-expose
JNI Bridge cpp/jni/NativePlaybackModule.cpp ✅ Ada, perlu diperluas
Kotlin Module audio/NativePlaybackModule.kt ✅ Ada, perlu diperluas
TS Spec src/specs/NativePlaybackModule.ts ✅ Ada, perlu diperluas

---

🔨 Rencana Implementasi

Tahap 1 — Audit dan Perluasan Native Playback

☐ Tambah JNI functions di NativePlaybackModule.cpp untuk:
  · nativeNext()
  · nativePrevious()
  · nativeSetShuffle(bool)
  · nativeSetRepeatMode(int)
  · nativeGetQueue()
  · nativeSetQueue(string[])
  · nativeGetCurrentTrack()
  · nativeSetAudioFocus(bool)
☐ Hubungkan ke TrackQueue dan PlaybackController.
☐ Perluas Kotlin module (NativePlaybackModule.kt) dengan method yang sesuai.
☐ Update TS spec (NativePlaybackModule.ts).

Tahap 2 — Foreground Service + MediaSession

☐ Buat PlaybackService.kt sebagai MediaSessionService.
☐ Integrasikan dengan MediaSessionCompat.
☐ Implementasikan callback untuk play/pause/next/prev/seek.
☐ Daftarkan service di AndroidManifest.xml.
☐ Buat notifikasi media dengan NotificationCompat.MediaStyle.

Tahap 3 — Audio Focus & Noisy Receiver

☐ Hubungkan AudioFocusManager ke PlaybackService.
☐ Implementasikan NoisyReceiverHandler untuk pause saat headset dicabut.

Tahap 4 — TurboModule API

☐ Perluas spec NativePlaybackModule.ts dengan method queue & service control.
☐ Implementasikan di Kotlin.
☐ Buat TS service (features/player/api/playback.ts) yang memanggil modul ini.

Tahap 5 — Migrasi UI & Store

☐ Ganti semua import RNTP di features/player/ dengan modul custom.
☐ Sesuaikan store (playerStore.ts) untuk memakai API baru.
☐ Hapus dependensi RNTP dari package.json.

Tahap 6 — Testing

☐ Unit test untuk queue & state management.
☐ Integration test dengan Oboe engine.
☐ Manual test di emulator/device untuk semua fitur.

---

⏱️ Estimasi Effort

Tahap Estimasi
Tahap 1 — Native Playback Expansion 2–3 hari
Tahap 2 — Service + MediaSession 2–3 hari
Tahap 3 — Audio Focus & Noisy 1 hari
Tahap 4 — TurboModule API 1–2 hari
Tahap 5 — Migrasi UI & Store 2–3 hari
Tahap 6 — Testing 3–4 hari
Total 2–3 minggu

---

⚠️ Risiko & Mitigasi

Risiko Mitigasi
MediaSessionCompat tidak stabil di New Architecture Gunakan androidx.media yang sudah support
Background service dimatikan oleh OS Gunakan startForeground() dengan notifikasi
Audio focus tidak berfungsi di beberapa perangkat Uji di berbagai device
Queue state tidak sinkron dengan UI Gunakan single source of truth di store
Kompleksitas migrasi UI Lakukan bertahap, fitur per fitur

---

📚 Referensi

· Android MediaSession Guide
· Oboe Documentation
· React Native TurboModule Guide

---

Dokumen ini akan menjadi panduan utama dalam menggantikan RNTP dengan solusi custom. Silakan beri masukan jika ada bagian yang perlu disesuaikan.

---

---

## ✅ Checkpoint 31 Agustus 2026 (Sore)

**Status:** Build native sukses dengan FFmpeg terintegrasi. Siap verifikasi runtime.

### Pencapaian

- ✅ `libappmodules.so` terproduksi untuk `arm64-v8a` dan `x86_64`.
- ✅ FFmpeg prebuilt berhasil di-build via `scripts/build-ffmpeg-android.sh` dan di-cache di workflow.
- ✅ `FFmpegDecoder.cpp` berhasil dikompilasi tanpa error.
- ✅ Seluruh error C++/CMake/autolinking yang sebelumnya muncul sudah teratasi.
- ✅ Workflow `Autolinking Debug V2` sudah efisien dengan cache FFmpeg.
- ✅ Workflow `Build PristineAudio APK (Debug)` sudah ditambahkan langkah FFmpeg + cache.

### Langkah Berikutnya

1. Jalankan workflow `Build PristineAudio APK (Debug)` untuk verifikasi runtime.
2. Cek logcat: error `PlatformConstants` dan `TurboModule` diharapkan hilang.
3. Cek error RNTP `UnsatisfiedLinkError`; jika masih muncul, lanjut ke migrasi RNTP → Custom Oboe Playback Service (Tahap 2).
4. Uji fitur player dasar: play/pause/seek, queue, notifikasi media.

### Dokumen Terkait

- `docs/migrasi-rntp-custom-oboe-implementation.md` — roadmap penggantian RNTP.
- `docs/ui-js-post-native-refactor-todolist.md` — peta integrasi UI/JS.

---

**Roadmap ini update per 31 Agustus 2026 sore.**