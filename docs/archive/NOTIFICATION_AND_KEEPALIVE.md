# Notifikasi Player & Ketahanan Proses

Dua masalah yang diperbaiki bersamaan:

1. **Notifikasi player tidak keluar** - service-nya tidak pernah di-start
2. **App mudah dimatikan sistem** - tidak ada foreground service yang menahan

Perbaikan **belum terverifikasi di device**; butuh build ulang APK.

## Akar masalah: service tidak pernah hidup

`performInitialization()` di `src/app/_layout.tsx` didefinisikan, tapi
**hanya dipanggil dari tombol Retry** (`appState === "error"`). Tidak ada
`useEffect` yang memicunya saat boot. Karena `startService()` ada di dalam
fungsi itu, `PlaybackService` tidak pernah dijalankan.

`hasInitialized` dideklarasikan dan di-reset, tapi **tidak pernah dipakai**
untuk memicu apa pun. Itu jejaknya: penulis kode berniat memakai penjaga
inisialisasi, tapi pemanggilannya terlewat.

### Bukti dari logcat device

Rekaman 2026-10-04 12:18 (166.628 baris):

| Yang dicari | Hasil |
|---|---|
| `PlaybackService` milik aplikasi | **0 baris** |
| `startForeground` milik aplikasi | **0 baris** |
| `[BOOT] 1. Initializing Audio Engine & Stores...` | **tidak muncul** |
| `[BOOT] 1. Index mount started` (`index.tsx`) | muncul |
| `AudioEngine Custom Oboe Engine Ready` | **tidak muncul** |

Baris `[BOOT] 1` yang muncul berasal dari `index.tsx`, bukan dari
`_layout.tsx`. Itu yang menyingkap bahwa blok inisialisasi di
`_layout.tsx` tidak pernah jalan.

Sebagai pembanding, service aplikasi lain muncul di log yang sama
(`org.kustom.widget`, `com.xiaomi.mipicks`) - jadi logcat-nya memang
menangkap aktivitas service, hanya saja milik PristineAudio tidak ada.

## Yang diperbaiki

### 1. Boot trigger (`src/app/_layout.tsx`)

```ts
useEffect(() => {
  if (hasInitialized.current) return;
  hasInitialized.current = true;
  performInitialization();
}, [performInitialization]);
```

`hasInitialized` sekarang benar-benar berfungsi sebagai penjaga supaya tidak
berjalan dua kali (React StrictMode / remount).

Izin `POST_NOTIFICATIONS` juga diminta di sini, bukan hanya di onboarding.
User yang sudah melewati onboarding (`has_onboarded = true`) tidak akan
pernah diminta lagi - dan **tanpa izin itu notifikasi tidak tampil walau
`startForeground()` berhasil**. Ini penyebab kedua yang berdiri sendiri.

### 2. Wake lock (`PlaybackService.kt`)

Foreground service menaikkan prioritas proses tapi **tidak menahan CPU**.
Tanpa wake lock, audio bisa putus saat layar mati atau device masuk doze.

`PARTIAL_WAKE_LOCK` dipakai, bukan `SCREEN_DIM`/`SCREEN_BRIGHT` - layar tetap
 bisa mati seperti biasa, jadi baterai tidak terkuras oleh layar.

Lock dilepas saat playback benar-benar berhenti, **bukan** saat pause.
Pause biasanya berlanjut, dan mengambil/melepas lock berulang itu boros.

### 3.`startForeground` saat restart

Setelah proses dimatikan sistem dan service di-restart dengan `START_STICKY`,
`startForeground()` **wajib** dipanggil lagi dalam hitungan detik. Tanpa itu
sistem melempar `ForegroundServiceDidNotStartInTimeException` dan mematikan
service - lalu notifikasi hilang dan proses tetap rentan.

### 4. Service type eksplisit (API 34+)

Android 14+ mewajibkan type saat `startForeground()`:

```kotlin
service.startForeground(
    NOTIFICATION_ID, notification,
    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
)
```

Tanpa itu: `MissingForegroundServiceTypeException`, service langsung mati.

### 5. Notification yang lebih tahan

- `setForegroundServiceBehavior(IMMEDIATE)` (API 31+) - tanpa ini di sebagian
  ROM notifikasi tidak muncul atau hilang saat service restart
- `setVisibility(PUBLIC)` - tampil di lock screen
- `setContentIntent` yang benar - tap membuka app
- `setOngoing(true)` - tidak bisa di-swipe (kalau bisa, user kehilangan
  kontrol dan sistem menganggap sesi selesai)
- `MediaSession.isActive = true` - tanpa ini `MediaStyle` tidak terikat ke sesi

## Langkah verifikasi

### 1. Build dan pasang

```bash
cd ~/pristine
pnpm eas build --profile development --platform android
```

Atau CI: workflow **Build Dev APK** (`build-dev.yml`) - satu-satunya yang
terbukti sukses berulang.

### 2. Cek izin notifikasi

Setelah membuka app, harus muncul dialog izin notifikasi. Kalau tidak muncul
karena pernah ditolak:

**Pengaturan** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ **Aplikasi** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ **PristineAudio** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ **Notifikasi** ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ aktifkan

### 3. Putar lagu, lalu tekan Home

Notifikasi harus muncul di shade, dan tetap ada saat app di background.

### 4. Uji ketahanan

| Uji | Yang diharapkan |
|---|---|
| Tekan Home, tunggu 30 detik | audio jalan terus, notifikasi ada |
| Matikan layar, tunggu 2 menit | audio jalan terus |
| Swipe app dari recents | audio jalan terus (log: `onTaskRemoved - service tetap jalan`) |
| Buka app lain yang berat | audio jalan terus |

### 5. Verifikasi dari log

```bash
cd ~/pristine
./scripts/analyze-log.sh <file> grep "PlaybackService|MediaSessionManager|WakeLock|AudioEngine"
```

Yang harus terlihat:

```
I PristineJNI          JNI_OnLoad - initializing EngineManager
  ... kemungkinan [BOOT] Engine & Store initialization success.
I ReactNativeJS        [BOOT] Izin POST_NOTIFICATIONS sudah ada
D PlaybackService      WakeLock acquired
D MediaSessionManager  startForeground OK
```

Kalau izin baru diminta: `[BOOT] Izin POST_NOTIFICATIONS: granted`.

## Kalau masih gagal

| Yang muncul | Artinya |
|---|---|
| `[BOOT] Initializing Audio Engine` tidak muncul | boot trigger tidak jalan - cek `_layout.tsx` |
| `Izin POST_NOTIFICATIONS: denied` | user menolak; minta lewat Pengaturan |
| `ForegroundServiceStartNotAllowedException` | `startForegroundService` dipanggil saat app di background; pindahkan panggilan ke saat app foreground |
| `MissingForegroundServiceTypeException` | type tidak sampai - cek manifest `foregroundServiceType="mediaPlayback"` |
| `startForeground OK` ada tapi notifikasi tetap tidak tampil | cek izin notifikasi & saluran `pristine_playback` tidak dimatikan user |
| `WakeLock gagal diambil` | cek izin `WAKE_LOCK` di manifest |

## Catatan: batas yang tidak bisa dilewati

Di Android modern, **tidak ada** aplikasi yang bisa menjamin tidak dimatikan
sistem. Yang bisa dilakukan sudah dilakukan di sini (foreground service +
wake lock + `START_STICKY` + `onTaskRemoved`).

Sisa penentu ada di sisi pengguna/OEM:

- **Battery optimization per-app.** Di Xiaomi/MIUI: Pengaturan ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Aplikasi ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
  PristineAudio ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Hemat baterai ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ **Tanpa batasan**. Ini yang paling
  berpengaruh di device POCO.
- **Autostart.** MIUI punya daftar autostart terpisah yang harus diizinkan.
- **Kunci app di recents** (MIUI) supaya tidak di-swipe bersih.

Aplikasi bisa mendeteksi ini dan meminta user melakukannya, tapi tidak bisa
mengubahnya sendiri. Kalau nanti mau, itu bisa jadi item terpisah.
