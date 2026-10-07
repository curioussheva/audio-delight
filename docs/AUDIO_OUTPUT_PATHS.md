# Audit Jalur Output Audio

**Tanggal:** 2026-10-07
**Scope:** setiap jalur keluaran audio dari PCM engine ke perangkat keras — speaker internal, jack, USB DAC, HDMI, Bluetooth/A2DP, cast, dan jalur lain.
**Kaitan:** [`RATE_CHAIN_AUDIT.md`](./RATE_CHAIN_AUDIT.md) (laju), [`NATIVE_MODULES_CONSISTENCY.md`](./NATIVE_MODULES_CONSISTENCY.md) (konsistensi modul).

---

## Jawaban singkat

**Hanya ada SATU jalur output nyata:** satu stream Oboe (AAudio, fallback OpenSLES) ke perangkat yang dipilih sistem.

Yang menentukan perangkat adalah **Android**, bukan app. App **membaca** daftar perangkat dengan benar, tetapi **tidak pernah memilih** salah satunya — `setDeviceId()` tidak pernah dipanggil. Jadi pilihan device di UI tidak mengubah keluaran audio.

Per-jalur:

| Jalur | Terdeteksi | Bisa dipilih app | Jalur keluaran nyata | Bit-perfect mungkin? |
|---|---|---|---|---|
| Speaker internal | ✅ | ❌ | Oboe → mixer sistem | ❌ tidak mungkin |
| Jack headphone | ✅ | ❌ | Oboe → mixer sistem | ❌ tidak mungkin |
| USB DAC (UAC) | ✅ | ❌ (**belum**) | Oboe → mixer sistem | ⚠️ mungkin, belum tersambung |
| HDMI / eARC | ✅ | ❌ | Oboe → mixer sistem | ⚠️ mungkin, belum tersambung |
| Bluetooth A2DP | ✅ | ❌ | Oboe → mixer → encoder → BT | ❌ tidak mungkin (lossy selalu) |
| Bluetooth SCO | ⚠️ digabung jadi "bluetooth" | ❌ | Oboe → mixer → BT telepon | ❌ tidak mungkin |
| Chromecast / DLNA / AirPlay | ❌ tidak ada | ❌ | — | ❌ belum ada fitur |
| USB host langsung (FD sendiri) | ❌ tidak dipakai | ❌ | — | ⚠️ skeleton ada, tidak tersambung |

---

## 1. Satu-satunya jalur keluaran: Oboe

Hanya ada dua `AudioStreamBuilder` di seluruh kode, keduanya di
`core/AudioStreamController.cpp` (baris 56 = percobaan AAudio, 91 = fallback
OpenSLES). Tidak ada `AudioTrack` sendiri, tidak ada ExoPlayer, tidak ada
`react-native-track-player` (package.json hanya punya `expo-media-library`).

```
PlaybackController::render()
  └─ AudioCallback::onAudioReady()
       └─ AudioStreamController  ← satu stream, satu perangkat
            ├─ percobaan 1: AAudio  (setAudioApi(AAudio))
            └─ percobaan 2: OpenSLES (fallback device lama)
                 └─ mOpenSLESFallback = true
```

Pemilihan API sudah benar dan jujur: AAudio dulu (satu-satunya yang punya mode
Exclusive), dan kalau gagal turun ke OpenSLES dengan log eksplisit
"TANPA jalur exclusive - bit-perfect ke DAC tidak tersedia" (`AudioStreamController.cpp:103-107`).

Efek samping penting: karena `setAudioApi()` dipanggil di dalam `open()` dan
`buildStream()` tidak menyentuhnya, `buildStream()` aman dipakai untuk kedua
percobaan. Itu konsisten.

---

## 2. Deteksi perangkat: BENAR dan LENGKAP

`AudioDeviceManager::refreshDevices()` (`devices/AudioDeviceManager.cpp:116`)
membaca `AudioManager.getDevices(GET_DEVICES_OUTPUTS)` lewat JNI dan memetakan
semua tipe Android:

| Kode Android | Arti | `DeviceType` |
|---|---|---|
| 1 | BUILTIN_EARPIECE | `BUILTIN_EARPIECE` |
| 2 | BUILTIN_SPEAKER | `BUILTIN_SPEAKER` |
| 3, 4 | WIRED_HEADSET / WIRED_HEADPHONES | `WIRED_HEADSET` |
| 5, 6 | BLUETOOTH_SCO / BLUETOOTH_A2DP | `BLUETOOTH` |
| 7, 8, 9 | HDMI / ARC / eARC | `HDMI` |
| 11, 12, 22 | USB_DEVICE / ACCESSORY / HEADSET | `USB_AUDIO` |
| 13 | DOCK | `UNKNOWN` |

Per device diambil juga `getSampleRates()` (semua laju yang didukung, sudah
disortir + dedup) dan `getProductName()`. Dan penentuan "bisa jalur langsung"
sudah **jujur**:

```cpp
// AudioDeviceManager.cpp:244
d.supportsExclusive = (d.type == DeviceType::USB_AUDIO || d.type == DeviceType::HDMI);
```

Speaker dan headphone built-in tidak pernah ditandai bisa bit-perfect — benar,
mereka selalu lewat AudioFlinger.

Hot-plug juga **jalan nyata**: `NativeDeviceModule.kt` mendaftarkan
`AudioDeviceCallback` saat `initialize()`, meneruskan ke
`nativeOnDeviceAdded/Removed`, yang memicu `refreshDevices()` + callback. Jadi
DAC yang dicolok saat app berjalan terdeteksi.

**Kesimpulan §2: infrastruktur deteksi sudah selesai dan benar.**

---

## 3. DI MANA RANTAI PUTUS: device tidak pernah dipilih

### 3.1 `setDeviceId()` tidak pernah dipanggil — dan komentarnya berbohong

`devices/AudioDeviceManager.h:27-33` menyatakan:

```
//   - AudioTrack.setPreferredDevice() -> PREFERENSI, sistem bisa mengabaikan
//   - Oboe AudioStreamBuilder.setDeviceId() -> lebih kuat, diterapkan saat
//     stream dibuka. Ini yang dipakai AudioStreamController.
```

**Baris terakhir itu tidak benar.** Audit:

```bash
$ grep -rn "setDeviceId" android/app/src/main/cpp --include=*.cpp --include=*.h | grep -v oboe
# (NIHIL — hanya di komentar header)

$ grep -n "deviceId\|DeviceId" android/app/src/main/cpp/core/AudioStreamController.{h,cpp}
# (NIHIL — kelas itu tidak punya field device id sama sekali)

$ grep -rn "activeDeviceIdNumeric" android/app/src/main --include=*.cpp --include=*.h --include=*.kt
AudioDeviceManager.h:57:    int32_t activeDeviceIdNumeric() const;   // deklarasi
AudioDeviceManager.cpp:348: int32_t AudioDeviceManager::activeDeviceIdNumeric() const {  // definisi
# 0 PEMANGGIL
```

`AudioStreamBuilder::setDeviceId(int32_t)` memang tersedia
(`oboe/include/oboe/AudioStreamBuilder.h:346`) — jadi sambungannya mungkin,
tapi belum ada.

**Akibat:** user memilih DAC di UI → `setActiveDevice()` mencatat id →
`activeDeviceIdNumeric()` mengembalikan id → **tidak ada yang memakainya** →
stream tetap dibuka di perangkat default sistem. Audio keluar dari speaker
walau DAC terpasang dan terpilih.

### 3.2 `NativeDeviceModule` tidak dikonsumsi JS

```
$ grep -rn "NativeDeviceModule" src/ --include=*.ts --include=*.tsx
src/specs/NativeDeviceModule.ts:9:  export default TurboModuleRegistry.getEnforcing...
# 0 import
```

Modul ini justru yang paling lengkap: memetakan semua tipe perangkat, membawa
`sampleRates` dan flag `exclusive` untuk tiap perangkat. Tapi tidak ada hook
yang memakainya. Jadi daftar perangkat nyata tidak pernah sampai ke UI.

### 3.3 UI memakai modul yang berbeda dan lebih sempit

UI (`settings.tsx`, `analyzer.tsx`) memakai `useUSBDAC` →
`features/hardware/api/USBDACModule` → `specs/USBDACModule` →
`usb/USBDACModule.kt`. Modul itu **hanya menampilkan perangkat USB**:

```kotlin
// usb/USBDACModule.kt:78
devices.forEach { device ->
    if (isUsbDevice(device)) {          // ← filter: hanya USB
        dacList.pushMap(createDacMap(device))
    }
}
```

Jadi **speaker internal, jack, Bluetooth, dan HDMI tidak pernah muncul di UI.**
Nama "USBDAC" tidak cocok dengan apa yang sebenarnya dibutuhkan layar settings.

### 3.4 `USBDACModule` juga menstub routing

Sudah dilaporkan di `RATE_CHAIN_AUDIT.md` §2.4, dan berlaku di sini juga:

```kotlin
// usb/USBDACModule.kt:134
@ReactMethod
fun setSampleRate(rate: Int, promise: Promise) {
    // Implementasi pergantian clock rate hardware DAC   ← komentar, bukan kode
    promise.resolve(result)     // selalu sukses
}
```

Sama untuk `setExclusiveMode` (baris ~120, dengan komentar "Implementasi Bypass
OS Mixer di sini"): hanya menyetel flag lokal `isExclusiveActive`. Modul ini
**nol `external fun` dan nol `System.loadLibrary`** — tidak ada JNI apa pun.

### 3.5 `AudioRouteManager` stub total

```cpp
// devices/AudioRouteManager.cpp
bool AudioRouteManager::setRoute(const std::string& deviceId) {
    LOGD("setRoute(%s) - stub", deviceId.c_str());
    return true;                                    // ← tidak melakukan apa pun
}
AudioDeviceDescriptor AudioRouteManager::getCurrentRoute() const {
    return AudioDeviceDescriptor{};                 // ← selalu kosong
}
void AudioRouteManager::registerRouteChangeCallback(...) { /* stub */ }
```

**0 referensi** dari mana pun. Ini kelas mati yang namanya menjanjikan routing.

### 3.6 Empat kelas USB C++ mati

| File | API yang seharusnya | Referensi |
|---|---|---|
| `usb/USBDeviceManager.{h,cpp}` | `init`, `requestDevicePermission`, `openUSBStream`, `closeUSBStream`, `setOnDataReady`, `setOnError` | **0** |
| `usb/USBStreamSession.{h,cpp}` | `start(sampleRate, framesPerBurst)` | **0** |
| `usb/USBDACCapabilities.{h,cpp}` | — | **0** |
| `usb/USBClockSync.{h,cpp}` | sinkronisasi clock | **0** |

Ini penting: kelas-kelas ini adalah **jalur USB host langsung** — app membuka
DAC lewat `UsbManager` + `UsbDeviceConnection` dan mengirim PCM sendiri dengan
`usb_request`. Itu jalur terpendek yang ada dan **benar-benar bit-perfect**
(melewati AudioFlinger sepenuhnya, tanpa mixer, tanpa resample).

Skeleton-nya ada, tapi tidak tersambung. Yang lebih menyesatkan:
`AndroidManifest.xml` sudah mendaftarkan app sebagai handler USB attach —

```xml
<intent-filter>
    <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"/>
</intent-filter>
<meta-data android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
           android:resource="@xml/device_filter"/>
```

dan `device_filter.xml` mencocokkan kelas audio USB (0x01, subkelas 1/2/3),
UAC2 (0xEF/0x02/0x01), dan vendor-specific (0xFF/0xFF/0xFF). Jadi app **meminta
dibukakan saat DAC dicolok**, menampilkan dialog izin USB ke user — lalu tidak
memakai `UsbDeviceConnection` sama sekali. Izin yang diminta tidak dipakai.

---

## 4. Bluetooth / A2DP

### 4.1 Yang ada

- `DeviceType::BLUETOOTH` ada (`devices/DeviceTypes.h:13`) dan dipetakan dari
  tipe Android 5 (SCO) dan 6 (A2DP) — `AudioDeviceManager.cpp:83-84`.
- `AudioDeviceInfo.kt` mendokumentasikan string `"bluetooth"`.
- `src/shared/types/dac.ts` punya `connectionType: "usb" | "bluetooth" | "hdmi" | "builtin"`
  dan `AudioOutputType` termasuk `"bluetooth"`.

### 4.2 Yang TIDAK ada

**Nol penanganan codec.** Tidak ada SBC, AAC, aptX, aptX HD, LDAC, atau
`BluetoothCodecConfig` di mana pun:

```bash
$ grep -rniE "a2dp|bluetooth|sbc|aptx|ldac|BluetoothCodec" android/app/src/main src/ \
    --include=*.cpp --include=*.h --include=*.kt --include=*.ts --include=*.tsx \
    | grep -v oboe | grep -viE "ffmpeg|avcodec"
# hanya: komentar AudioDeviceInfo.kt, DeviceTypes.h, mapDeviceType di
# AudioDeviceManager.cpp, dan komentar MediaSessionManager.kt soal lock screen
```

Tidak ada `package.json` yang membawa modul Bluetooth. Tidak ada
`BLUETOOTH_CONNECT` di `AndroidManifest.xml`.

### 4.3 Konsekuensi bit-perfect (penting)

**A2DP selalu lossy.** Codec adalah tahap encode wajib: PCM → encoder
(SBC/AAC/aptX/LDAC) → bitstream → DAC di headphone. Bit-perfect secara definisi
**tidak mungkin tercapai** lewat A2DP dari app biasa — kecuali app menjadi
sumber A2DP sendiri (menggantikan stack), yang bukan kasus di sini.

Ada **satu jebakan yang perlu diwaspadai**: `DeviceRateDetector::pickBestRate()`
memilih laju berdasarkan `AudioDeviceInfo.getSampleRates()`. Untuk perangkat
Bluetooth, Android melaporkan laju yang **sudah dinegosiasikan A2DP** (umumnya
44100 atau 48000). Jadi kalau file 44.1 kHz dan A2DP menegosiasikan 44.1 kHz:

```
pickBestRate(44100) → 44100 (didukung persis)
isBitPerfectFor(44100) → true
```

…padahal A2DP meng-encode ulang ke SBC/AAC. **Badge "bit-perfect" akan menyala
padahal tidak bit-perfect.** Ini bug kejujuran UI, bukan bug audio — tapi
bertentangan langsung dengan prinsip yang sudah dipegang app
(`useBitPerfectStatus` ada justru untuk tidak berbohong).

Pencegahan yang tepat: `isBitPerfectFor()` harus mengembalikan false untuk
perangkat bertipe BLUETOOTH, karena request "exclusive" pun akan ditolak AAudio
di jalur itu.

---

## 5. Jalur lain

### 5.1 Chromecast — tidak ada sama sekali

```bash
$ grep -rniE "chromecast|mediarouter|cclibrary|dlna|airplay" \
    --include=*.ts --include=*.tsx --include=*.kt --include=*.cpp --include=*.h \
    --include=*.json --include=*.xml --include=*.gradle . | grep -v node_modules
# (NIHIL)
```

Tidak ada MediaRouter, tidak ada Cast SDK, tidak ada DLNA, tidak ada AirPlay.
Bukan fitur yang rusak — **fitur yang belum ada.** Catatan: casting selalu
melibatkan re-encode + transport jaringan, jadi juga bukan jalur bit-perfect.

### 5.2 HDMI / eARC

Terdeteksi dan ditandai `supportsExclusive = true` (`AudioDeviceManager.cpp:244`).
Tapi karena `setDeviceId()` tidak pernah dipanggil (§3.1), klaim jalur langsung
itu **belum terbukti** — sama seperti USB. Tidak ada penanganan khusus untuk
eARC (mis. `AudioDeviceInfo` capability mask untuk jalur langsung).

### 5.3 Speaker internal & jack headphone

Terdeteksi, dan `supportsExclusive = false` — **benar**. Keduanya selalu lewat
AudioFlinger: konversi laju oleh sistem, gain tambahan, dan biasanya efek
vendor. Bit-perfect tidak mungkin, dan app sudah menyatakan itu dengan benar.

### 5.4 OpenSLES

Fallback yang ada dan jujur. Kalau AAudio gagal (Android < 8 atau driver
bermasalah), stream dibuka lewat OpenSLES, `mOpenSLESFallback = true`, dan
`AudioEngine` mencatatnya di log. OpenSLES **tidak punya** mode exclusive, jadi
`isExclusive()` mengembalikan false dan badge bit-perfect tidak menyala. Benar.

---

## 6. Ringkasan masalah, urut dampak

Status per **2026-10-07** (setelah sambungan di ÃÂ§9).

| # | Masalah | Dampak | Bukti | Status |
|---|---|---|---|---|
| 1 | `setDeviceId()` tidak pernah dipanggil | **Pilihan device di UI tidak berpengaruh** Ã¢ÂÂ audio selalu ke device default sistem | `activeDeviceIdNumeric()` 0 pemanggil | Ã¢ÂÂ SELESAI |
| 2 | Komentar header mengklaim `setDeviceId()` "yang dipakai" | Menyesatkan pembaca berikutnya | `AudioDeviceManager.h:30` | Ã¢ÂÂ SELESAI |
| 3 | `NativeDeviceModule` tidak dikonsumsi JS | Daftar perangkat nyata tidak sampai ke UI | 0 import | Ã¢ÂÂ SELESAI |
| 4 | UI pakai `USBDACModule` yang filter USB saja | Speaker/jack/BT/HDMI tidak muncul di UI | `USBDACModule.kt:78` `isUsbDevice()` | Ã¢ÂÂ SELESAI |
| 5 | `USBDACModule.setSampleRate`/`setExclusiveMode` stub | Slider laju & tombol exclusive tidak berefek | nol JNI di file itu | Ã¢ÂÂ¡Ã¯Â¸Â tak lagi dipakai UI |
| 6 | `isBitPerfectFor()` tidak mengecualikan Bluetooth | **Badge bit-perfect menyala di A2DP** (lossy) | `DeviceRateDetector.cpp:292` | Ã¢ÂÂ SELESAI |
| 7 | 4 kelas USB C++ mati + izin USB diminta tanpa dipakai | Jalur bit-perfect terpendek tidak tersambung | 0 referensi; manifest punya intent-filter | Ã¢ÂÂª terbuka |
| 8 | `AudioRouteManager` stub total | Nama menjanjikan routing, tidak ada isi | `AudioRouteManager.cpp` semua stub | Ã¢ÂÂª masih stub |
| 9 | Chromecast/DLNA/AirPlay tidak ada | Fitur belum ada (bukan bug) | grep NIHIL | Ã¢ÂÂª fitur |

---

## 7. Urutan perbaikan Ã¢ÂÂ sudah dikerjakan

**Untuk membuat pemilihan device benar-benar bekerja (jalur AAudio/Oboe):**

1. Ã¢ÂÂ Id numerik device diteruskan sampai `buildStream()` lewat
   `builder.setDeviceId(deviceId)`. `open()` menerima `deviceId`, dan
   `restart()` meneruskannya ulang (kalau tidak, restart diam-diam kembali ke
   perangkat default sistem).
2. Ã¢ÂÂ Stream dibuka ulang saat device dipilih Ã¢ÂÂ `EngineManager::setRequestedDeviceId()`
   menutup dan membuka ulang stream, dengan laju dihitung dari kapabilitas
   perangkat **baru**.
3. Ã¢ÂÂ Komentar `AudioDeviceManager.h` diperbaiki supaya tidak lagi mengklaim
   sesuatu yang tidak ada.

**Untuk UI yang jujur:**

4. Ã¢ÂÂ UI memakai `NativeDeviceModule` (semua tipe perangkat) lewat
   `useAudioOutput`, bukan `USBDACModule` yang menyaring USB.
5. Ã¢ÂÂ Jalur/perangkat yang tidak sanggup bit-perfect tidak lagi bisa
   mengklaim bit-perfect Ã¢ÂÂ lihat `isPathInherentlyLossy()` di ÃÂ§9.
6. Ã¢ÂÂ Klaim bit-perfect diikat ke laju aktual vs laju **file**
   (`isRateHonored()`), bukan ke flag permintaan. Ini menutup celah badge
   bit-perfect menyala di A2DP.

**Untuk jalur bit-perfect terpendek (opsional, paling besar):**

7. Ã¢ÂÂª Belum diputuskan: `USBDeviceManager`/`USBStreamSession` disambungkan
   (USB host API langsung ke DAC) atau dihapus bersama izin USB di manifest.
   Membiarkan izin USB diminta tanpa dipakai adalah utang yang menyesatkan.

---

## 8. Yang belum bisa diuji di sini

Tidak ada SDK/NDK di Termux, jadi tidak ada APK yang bisa dijalankan di
perangkat. Yang **sudah** terverifikasi di mesin ini:

- `bash scripts/check.sh` untuk semua file C++ yang diubah Ã¢ÂÂ lulus.
- `tsc --noEmit` Ã¢ÂÂ exit 0.
- `pnpm lint:check` Ã¢ÂÂ 0 error (warning `settings.tsx` 7 Ã¢ÂÂ 5).
- `pnpm test` (jest) Ã¢ÂÂ logika murni TS.

Yang **harus** dilihat di logcat saat menguji APK dari CI:

```
EngineManager  start: laju file=96000 -> laju stream=96000 (bit-perfect=ya, perangkat=23)
EngineManager  start: perangkat diminta=23 (0 = pilih sistem)
AudioStreamController  OPEN RESULT: ACTUAL rate=96000, framesPerBurst=..., api=AAudio
EngineManager  start: hasil -> laju diminta=96000 dipakai=96000 (sama=ya),
               exclusive=ya, jalur-mustahil-bit-perfect=tidak, bit-perfect=YA
```

Kalau `exclusive=tidak` sementara `jalur-mustahil-bit-perfect=tidak`, itu
kegagalan NYATA (AAudio menolak) Ã¢ÂÂ bukan batas jalur. Kalau
`jalur-mustahil-bit-perfect=ya`, itu speaker/jack/Bluetooth dan memang tidak
mungkin; UI tidak boleh menampilkannya sebagai kesalahan.

---

## 9. Apa yang disambungkan (2026-10-07)

### 9.1 Native: perangkat benar-benar dipakai saat stream dibuka

- `AudioStreamController::buildStream()` Ã¢ÂÂ `builder.setDeviceId(deviceId)` saat
  `deviceId > 0`. Komentar lama di `AudioDeviceManager.h` yang mengklaim ini
  sudah dipakai sudah dikoreksi.
- `AudioStreamController` menyimpan `mRequestedDeviceId` + `mActualDeviceId`,
  dan `restart()` membuka ulang di perangkat yang SAMA.
- Verifikasi setelah stream terbuka: `getDeviceId()` dibandingkan dengan yang
  diminta, dan ketidaksesuaian dicatat sebagai `DEVICE MISMATCH` di logcat.
  `isDeviceHonored()` menjawabnya untuk UI.

### 9.2 Native: laju dihitung dari perangkat yang DIPILIH

Sebelumnya laju diambil dari `DeviceRateDetector`, yang membaca perangkat
output **aktif menurut Android** Ã¢ÂÂ dan itu belum tentu perangkat yang kita
minta (AudioFlinger memindahkan rute setelah stream dibuka).

- `EngineManager::supportedRatesFor(deviceId)` membaca laju dari deskriptor
  perangkat yang dipilih di `AudioDeviceManager`.
- `EngineManager::pickBestRateFor(fileRate, deviceRates)` memilih laju
  terhadap daftar laju perangkat ITU (laju persis Ã¢ÂÂ kelipatan bulat Ã¢ÂÂ laju
  tertinggi yang tidak melebihi laju file Ã¢ÂÂ laju terendah perangkat).
- `EngineManager::start()` sekarang menentukan perangkat **lebih dulu**,
  me-refresh daftar perangkat, baru menghitung laju. Urutan ini penting: kalau
  laju dihitung dari perangkat lama, DAC 384 kHz yang baru dicolok tetap
  dibuka di 48 kHz.
- Tiga jalur restart (`setRequestedDeviceId`, `onDeviceRemoved`,
  `setExclusiveMode`) semuanya memakai perangkat + laju yang sama-sama baru.

### 9.3 Kejujuran: "mustahil" dibedakan dari "ditolak"

Ini yang mencegah dua kesalahan yang berlawanan Ã¢ÂÂ mengklaim bit-perfect di
jalur yang mustahil, dan melaporkan batas jalur sebagai kegagalan.

- `AudioStreamController::isPathInherentlyLossy()` Ã¢ÂÂ true kalau (a) stream
  jatuh ke OpenSLES (tidak punya mode exclusive sama sekali), atau (b)
  perangkatnya sendiri tidak punya jalur langsung (`supportsExclusive` false:
  speaker internal, jack, Bluetooth). Perangkat dicari di
  `AudioDeviceManager` lewat id stream yang SEDANG berjalan.
- `EngineManager::isRateHonored()` Ã¢ÂÂ membandingkan laju stream **aktual**
  dengan laju **file**. Bukan hasil `pickBestRate()`: kalau perangkat menolak
  laju yang diminta, stream terbuka di laju lain dan perbandingan ini
  menangkapnya. Menghitung dari yang diminta akan selalu mengaku bit-perfect.
- `EngineManager::currentOutputDevice()` Ã¢ÂÂ memakai `actualDeviceId()`, bukan
  yang diminta. Kalau pilihan DAC tidak dihormati, yang dikembalikan speaker
  internal, dan UI tidak bisa menyebut nama DAC yang salah.
- Satu baris log ringkas di akhir `start()`:
  `bit-perfect=YA` hanya kalau laju dipertahankan **dan** exclusive diterima.

### 9.4 Lintas lapisan: JS Ã¢ÂÂ Kotlin Ã¢ÂÂ JNI

| Lapisan | Tambahan |
|---|---|
| C++ | `isPathInherentlyLossy()`, `isRateHonored()`, `currentOutputDevice()`, `supportedRatesFor()`, `pickBestRateFor()` |
| JNI (`NativeDeviceModule.cpp`) | `nativeGetActiveDeviceStatus()` Ã¢ÂÂ 5 int (tambah `pathLossy`, `rateHonored`); `nativeGetCurrentOutputDevice()` Ã¢ÂÂ satu objek perangkat |
| Kotlin (`NativeDeviceModule.kt`) | `getActiveDeviceStatus()` mengembalikan 5 field; `getCurrentOutputDevice()` baru |
| TS spec (`NativeDeviceModule.ts`) | tipe `AudioDeviceDescriptor`, `ActiveDeviceStatus`, `getCurrentOutputDevice` |
| API (`features/hardware/api/audioOutput.ts`) | `AudioOutputService` + `pathKindOf()` + `canBeBitPerfect()` |
| Hook (`features/hardware/hooks/useAudioOutput.ts`) | daftar perangkat, perangkat aktif, pilih, status, poll 3 detik |
| UI (`app/(drawer)/settings.tsx`) | section "Audio Output" menggantikan "USB DAC"; menampilkan perangkat AKTIF, peringatan saat pilihan tidak dihormati, dan sakelar bit-perfect yang mati di jalur yang mustahil |

`useUSBDAC` tidak lagi dipakai di layar settings. Modulnya masih ada dan masih
dipakai layar `analyzer.tsx`, tapi `setSampleRate`/`setExclusiveMode`-nya tetap
stub tanpa JNI Ã¢ÂÂ kalau nanti mau dibersihkan, itu tempatnya.

---

## 10. Yang masih terbuka

1. **Bluetooth tidak punya penanganan codec sama sekali.** Tidak ada
   `BluetoothCodecConfig`, tidak ada `BLUETOOTH_CONNECT`, dan tidak ada cara
   menampilkan codec yang sedang dipakai (SBC/aptX/LDAC). A2DP **selalu
   lossy**, jadi bit-perfect mustahil Ã¢ÂÂ itu sudah ditangani di UI, tapi
   "codec apa yang aktif" belum bisa ditampilkan. Butuh JNI baru ke
   `BluetoothA2dp.getCodecStatus()` (API 33+) dan izin `BLUETOOTH_CONNECT`
   di manifest.
2. **`AudioRouteManager` masih stub total.** Empat kelas USB C++ juga masih
   0 referensi, dan izin USB di manifest masih diminta tanpa dipakai.
3. **eARC tidak ditangani khusus.** HDMI ditandai sebagai jalur langsung,
   jadi ia akan muncul sebagai kandidat bit-perfect; belum diuji apakah
   `setDeviceId()` pada HDMI benar-benar menghasilkan jalur langsung.
4. **Belum ada bukti dari perangkat.** Semua di atas terverifikasi di level
   kode + compile, bukan di audio yang keluar speaker/DAC.

**Status dokumen:** diverifikasi lewat pembacaan kode + audit pemanggil, 2026-10-07.
Setiap klaim "tidak ada pemanggil" berasal dari grep yang definisinya dikecualikan.
Yang belum bisa diuji di sini: perilaku nyata di device (butuh APK dari CI;
SDK/NDK tidak ada di Termux).
