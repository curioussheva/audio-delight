# PristineAudio - Architecture

Dokumen pendamping `../README.md`. Berisi stack, struktur folder, alur audio native, dan keputusan arsitektur.

> **Catatan 2026-10-03.** Dokumen ini dibuat dari verifikasi langsung ke kode pada 2026-10-03: `src/` 182 file TS/TSX (818 KB), `android/app/src/main/cpp/` 193 file C++/header (362 KB, tanpa `oboe/`), `android/` 33 file Kotlin (126 KB). Angka di bawah adalah hasil hitungan, bukan estimasi.

---

## 1. Technology Stack

| Lapisan | Teknologi | Versi terverifikasi |
|---|---|---|
| Framework | React Native | 0.83.10 |
| | Expo | ~55.0.31 |
| | React | 19.2.0 |
| Bahasa | TypeScript | ^5.9.3 |
| | Kotlin | 2.0.21 (`expo-build-properties`) |
| | C++ | C++20 (`CMAKE_CXX_STANDARD 20`) |
| Audio engine | Oboe | 1.9.0 (vendored, `cpp/oboe/`) |
| | OpenSL ES | via Oboe fallback |
| | FFmpeg | libs imported (`avcodec`/`avformat`/`avutil`/`swresample`) |
| Navigasi | expo-router | ~55.0.18, `typedRoutes: false` |
| State | Zustand | ^4.5.5 |
| DB lokal | react-native-quick-sqlite | ^8.2.7 |
| Key-value | AsyncStorage | 2.2.0 |
| Animasi | Reanimated 4.2.1, Moti, Skia 2.4.18 | |
| Lint | oxlint ^1.56.0 + Prettier ^3.8.1 | ESLint ada tapi bukan runner utama |
| Package manager | pnpm | 9.0.0 (dipin di `packageManager`) |

**Build config** (`expo-build-properties`): `compileSdkVersion 36`, `targetSdkVersion 36`, `minSdkVersion 24`, `buildToolsVersion 36.0.0`, `ndkVersion 27.1.12297006`, `newArchEnabled true`, `enableBridgeless true`, `usesCleartextTraffic true`.

Codegen: `codegenConfig.name = "PristineAudioSpec"`, `android.javaPackageName = "com.pristineaudio.app"`.

**Catatan `tsconfig.json`:** `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`, `strictFunctionTypes: false`. Ini **pilihan sadar** untuk codebase yang tumbuh dari JavaScript longgar. Jangan aktifkan tanpa membahasnya - kode ini akan menghasilkan ratusan error.

---

## 2. Struktur Folder (kenyataan 2026-10-03)

```
pristine/
|-- src/
|   |-- app/                    # expo-router routes
|   |   |-- _layout.tsx         #  <- ada duplikat sampah: "_layout.tsx (2)"
|   |   |-- index.tsx | onboarding.tsx | search.tsx
|   |   |-- (drawer)/
|   |   |   |-- about.tsx | playlist.tsx | settings.tsx | song/[id].tsx
|   |   |   +-- (tabs)/         # analyzer | equalizer | library | visualizer
|   |   +-- player/index.tsx
|   |-- features/               # 9 fitur, tiap fitur punya api/components/hooks/store
|   |   |-- audio (1) | equalizer (20) | favorites (6) | hardware (6)
|   |   |-- library (39) | player (24) | playlist (7) | settings (1)
|   |   +-- visualizer (15)
|   |-- shared/
|   |   |-- components/         # + ui/, navigation/
|   |   |-- constants/
|   |   |   |-- theme.ts        # ALL_THEMES registry (296 baris)
|   |   |   +-- themes/         # base | cyber | dark | light | nature | premium | types
|   |   |-- context/            # ThemeContext.tsx (SINGULAR - lihat ADR-2)
|   |   +-- hooks/ lib/ styles/ types/ utils/
|   +-- specs/                  # 8 TurboModule spec
|-- android/                    # DI-COMMIT (259 file)
|   +-- app/src/main/cpp/       # 193 file C++/header, 17 subdirektori
|-- scripts/                    # 58 .py + 3 .sh (termasuk ~58 patch-*.py)
|-- .github/workflows/          # 5 workflow, semuanya workflow_dispatch
+-- .gitlab-ci.yml              # satu-satunya CI ber-trigger otomatis
```

**Layout fitur** konsisten: `<fitur>/{api, components, hooks, store}` (bukan semua punya keempatnya). `library` paling lengkap: `api | components | hooks | native | services | store | types | utils`.

**8 TurboModule spec** di `src/specs/`: `MediaStoreModule` | `NativeDSPModule` | `NativeDeviceModule` | `NativePlaybackModule` | `NativePlaybackService` | `NativePristineAudio` | `NativeVisualizerBridge` | `USBDACModule`.

---

## 3. Alur Audio Native

17 subdirektori di `cpp/`. Yang membentuk alur utama:

```
decoder/  (16 file)   AudioDecoder | DecoderFactory | DecoderWorker | FFmpegDecoder | PCMDecoder | StreamResampler
    |
playback/ (20 file)   DecodedAudioQueue | PCMQueue | PrebufferManager | PlaybackController | PlaybackClock | FadeEngine
    |
modes/    (6 file)    BitPerfectPipeline | DSPPipeline | ImmersivePipeline   <- tiga mode, tiga kelas
    |
dsp/      (56 file)   DSPChain | BiquadFilter | EQProcessor | Limiter | OutputStage
    |                 + subdir: convolution | dynamics | filters | graph | headphone | immersive | spatial | tone
core/     (21 file)   AudioEngine | AudioStreamController | AudioCallback | AudioBufferController
    |                 + RingBuffer | AudioMetrics | AudioModeManager
usb/       (8 file)   USBDeviceManager | USBStreamSession | USBClockSync | USBDACCapabilities
jni/      (12 file)   JSIInstaller | NativeAudioFeed | OnLoad + jembatan per-modul
```

`manager/` hanya 2 file (`EngineManager`) - satu titik masuk. `fft/` (11 file) dipakai visualizer. `resampler/` (8) dan `realtime/` (4) melayani jalur decode/render.

**Tiga mode pemrosesan** (`cpp/modes/`) - pilihan ini menentukan apakah DSP dijalankan sama sekali:

| Mode | Kelas | Perilaku |
|---|---|---|
| `BitPerfect` | `BitPerfectPipeline` | DSP dilewati - **default** |
| `DSP` | `DSPPipeline` | DSP chain aktif |
| `Immersive` | `ImmersivePipeline` | DSP + spatial/headphone |

**PENTING - kelas-kelas di atas TIDAK tersambung ke jalur audio.** Diverifikasi 2026-10-05: `BitPerfectPipeline` hanya didefinisikan (nol pemakai), dan `AudioPipeline::processBitPerfect()` body-nya kosong. `AudioCallback::onAudioReady()` `return` sebelum `mPipeline.process()` sempat dipanggil, karena jalur yang benar-benar berbunyi adalah:

```
AudioCallback::onAudioReady
  -> PlaybackController::render()      <- return di sini
       -> PCMQueue::read()
```

Jadi bit-perfect saat ini tercapai **secara tidak langsung**: DSP tidak pernah disentuh karena `render()` tidak memanggil pipeline sama sekali. Itu kebetulan yang menguntungkan, **bukan desain**. Menyambungkan pipeline ke jalur render adalah pekerjaan terpisah yang belum dikerjakan.

---

## 3b. Jalur Bit-Perfect (dibangun 2026-10-05)

Tiga syarat bit-perfect ke DAC, semuanya harus terpenuhi:

| Syarat | Status | Bukti |
|---|---|---|
| API audio punya jalur langsung (exclusive) | AAudio utama, OpenSLES fallback | `AudioStreamController::open()` |
| Laju stream mengikuti DAC/file, bukan konstanta | autodetect lewat `AudioManager.getDevices()` | `core/DeviceRateDetector` |
| Decoder tidak resample ke laju lain | `DecodeConfig.targetSampleRate` dari laju stream aktual | `PlaybackController::startDecoder()` |

**Kenapa OpenSLES tidak cukup untuk bit-perfect:** tidak punya mode exclusive, jadi sampel selalu lewat mixer sistem. Terverifikasi di logcat 2026-10-05 (`AudioStreamOpenSLES::open()` yang dipakai). Kalau AAudio gagal dan fallback terpakai, log mencatat PERINGATAN eksplisit.

**Rantai laju:**

```
AudioEngine::start(requestedSampleRate)
  -> AudioStreamController::open(rate)         buka stream di laju itu
  -> actualSampleRate()                        laju yang benar-benar didapat
  -> PlaybackController::setStreamSampleRate()
  -> DecodeConfig.targetSampleRate
  -> FFmpegDecoder::setupResampler()
```

Kalau file 96 kHz dan DAC mendukung, `input_rate == output_rate` ÃÂ¢ÃÂÃÂ resampler **tidak aktif** ÃÂ¢ÃÂÃÂ sampel lewat tanpa konversi.

**Pemilihan laju** (`DeviceRateDetector::pickBestRate`), berurutan:

1. laju file kalau didukung ÃÂ¢ÃÂÃÂ **tanpa konversi**
2. kelipatan bulat terkecil ÃÂ¢ÃÂÃÂ upsample integer, tanpa rate conversion fraksional
3. laju tertinggi yang ÃÂ¢ÃÂÃÂ¤ laju file ÃÂ¢ÃÂÃÂ turun sesedikit mungkin
4. semua lebih tinggi ÃÂ¢ÃÂÃÂ yang terendah

Mengembalikan laju file saat device **tidak** mendukungnya sengaja dihindari: stream akan gagal dibuka.

**Perangkat audio** (`AudioDeviceManager`) membaca daftar nyata dari Android termasuk DAC USB. Dibangun ulang 2026-10-05 ÃÂ¢ÃÂÃÂ sebelumnya seluruh kelas adalah stub yang mengembalikan `{}` dan `true` tanpa efek.

`AudioDeviceCallback` terdaftar lewat `NativeDeviceModule`, jadi DAC yang dicolok **saat app berjalan** terdeteksi dan laju ter-refresh. Tanpa itu, bit-perfect gagal diam-diam ketika user mencolok DAC di tengah pemutaran.

**Batas kemampuan Android:** tidak ada API publik untuk "paksa output ke device ini". Yang tersedia: `AudioTrack.setPreferredDevice()` (preferensi, bisa diabaikan sistem) dan `Oboe setDeviceId()` (diterapkan saat stream dibuka). `AudioDeviceManager::setActiveDevice()` mencatat pilihan dan memvalidasinya — mengembalikan `false` kalau id tidak ada, bukan `true` buta.

**Koreksi 2026-10-06 ("96kHz masih cacat")** — tiga hal yang ternyata **menghianati** ketiga syarat di atas meski tabelnya bertanda terpenuhi:

1. **`kGain 0.89f` (-1 dB) diterapkan di `FFmpegDecoder::onDecode()`** ke setiap sample, *sebelum* PCM masuk queue. `BitPerfectPipeline` memang sengaja kosong ("no gain"), tapi decoder sudah memotong 1 dB lebih dulu — jadi "bit-perfect" ternyata tidak pernah benar-benar utuh. Dihapus; headroom adalah urusan `DSPChain` (punya `LimiterNode` sendiri).
2. **Stream hanya dibuka sekali, tidak pernah di-restart per trek.** `EngineManager::start()` memanggil `AudioEngine::start(exclusiveMode)` tanpa parameter laju → `requestedSampleRate <= 0` → deteksi mandiri → rate tertinggi yang didukung. Tapi logcat 2026-10-06 menunjukkan device speaker internal hanya melaporkan `[44100, 48000]`, jadi untuk file FLAC 96 kHz, `swr_convert` diaktifkan paksa 96000→48000. Downsample tidak terhindarkan di hardware ini; yang bisa dijamin adalah PCM utuh *sampai* ke DAC, bukan tidak ada konversi.
3. **Throughput decoder perlu diskalakan dengan rasio downsample.** `chunkSize_` dulu hardcoded 4096; FLAC 96 kHz hanya menghasilkan ~2238 output frame per `decode()`, sehingga saat queue penuh throughput turun di bawah 48 kHz realtime → underrun → glitch. Sekarang `chunkFrames` = 16384 dan `AudioDecoder::config()` dipindah ke `public` supaya `DecoderWorker` benar-benar membacanya.

**Implikasinya untuk tabel di atas**: baris "Decoder tidak resample ke laju lain" hanya benar kalau DAC mendukung laju file. Kalau tidak, yang benar adalah "downsample sekali, di filter kualitas tinggi (`filter_size=128, cutoff=0.97` — terverifikasi SNR 76.5 dB, terbaik dari 5 konfigurasi yang diuji)".

---

## 4. Keputusan Arsitektur (ADR)

Diekstrak dari kode dan riwayat commit. Nomor diberikan saat dokumen ini dibuat.

### ADR-1 - `android/` di-commit, bukan di-generate ulang tiap build

**Berbeda dari persona.** Di sini `android/` ter-track git (259 file). Konsekuensi: kustomisasi native bertahan, tapi konflik merge saat prebuild adalah risiko nyata. **Belum diverifikasi** apakah ini disengaja atau konsekuensi historis.

### ADR-2 - `src/shared/context/` (singular), bukan `contexts/`

`ThemeContext.tsx` berada di `src/shared/context/`, tapi **header file-nya berbunyi `// src/shared/contexts/ThemeContext.tsx`** (plural). Header itu **salah** - path sebenarnya singular. Import di `ThemePicker.tsx` dan `ThemeContext.tsx` keduanya menunjuk `@/shared/constants/theme`, jadi tidak ada error. Jangan percaya komentar header tanpa memeriksa path.

### ADR-3 - 20 tema, tapi hanya 4 didefinisi inline

`ALL_THEMES` (`src/shared/constants/theme.ts`) berisi 20 entri: **4 inline** (`deep-navy`, `obsidian`, `light-elegant`, `light-silver`) dan **16 diimpor** dari `themes/{light,dark,nature,premium,cyber}.ts`. `ThemeId` juga 20, dan **kedua himpunan cocok persis** - tidak ada tema yatim. `themes/index.ts` **kosong** (hanya komentar) - barrel file yang tidak dipakai siapa pun.

### ADR-4 - Tema default `emerald-noir`, tapi `getThemeById` jatuh-balik ke `midnight-blue`

```ts
export const DEFAULT_THEME = ALL_THEMES["emerald-noir"];   // default = emerald-noir
export const getThemeById = (id) => ALL_THEMES[id] || ALL_THEMES["midnight-blue"];  // fallback = midnight-blue
```

Jatuh-balik yang tidak konsisten: id yang tidak dikenal menghasilkan `midnight-blue`, bukan default. `ThemeContext` menambahkan lapis ketiga - `setTheme` memaksa ke `emerald-noir` untuk id yang tidak valid. **Tiga perilaku berbeda untuk satu kasus.**

### ADR-5 - `SPACING` dan `BASE_SHADOWS` didefinisi di `theme.ts`, bukan `themes/base.ts`

`themes/base.ts` (1371 byte) hanya mengekspor `BASE_TYPOGRAPHY`. `SPACING` dan `BASE_SHADOWS` ada di `theme.ts`. Setiap tema di file terpisah mewarisi keduanya dengan referensi yang sama (`spacing: SPACING`), jadi spacing identik di 20 tema - **tidak ada tema yang bisa menggeser skala spacingnya sendiri.**

### ADR-6 - Perubahan native C++ lewat `scripts/patch-*.py`, bukan edit langsung

~58 skrip Python idempotent yang mencari string `old` di file native dan menggantinya, dengan backup `.bak_<timestamp>`. Alasan yang terbaca dari kode: perubahan native terdokumentasi sebagai diff yang bisa di-review, bukan sebagai edit tak terlacak di file 3000 baris. **Konsekuensi: jangan commit `*.bak_*`.**

### ADR-7 - Oboe di-vendor, bukan dependensi

Oboe 1.9.0 diunduh ke `cpp/oboe/` (363 file) lewat `pnpm download-oboe` / `eas-hooks/` / `.gitlab-ci.yml`. Tidak di-commit. **Build yang melewatkan langkah unduh akan gagal di CMake**, dan pesan errornya tidak menyebut Oboe secara langsung.

### ADR-8 - 5 workflow GitHub, semuanya manual

`.github/workflows/` berisi `build.yml`, `build-dev.yml`, `build-preview.yml`, `runtime-test.yml`, `autolinking-debug.yml` - **semuanya hanya `workflow_dispatch`**. Tidak ada build otomatis saat push. Satu-satunya CI otomatis adalah `.gitlab-ci.yml` (branch `pristine-audio`). **Belum diverifikasi** apakah ini disengaja (menghemat kuota runner) atau belum disetel.

### ADR-9 - Tiga jalur build paralel (EAS, GitHub Actions, GitLab CI) tanpa sumber tunggal

`eas.json` mendefinisikan profile `development`/`preview`/`production`; GitHub Actions mendefinisikan langkahnya sendiri; GitLab CI mendefinisikan langkah ketiga. Ketiganya mengonfigurasi NDK, ABI, dan flag Gradle secara terpisah. **Ini sumber drift:** `.gitlab-ci.yml` memakai `--max-workers=2` dan ABI tunggal `arm64-v8a`; workflow GitHub tidak. Perubahan pada satu jalur tidak otomatis berlaku di dua lainnya.

### ADR-11 - AAudio utama, OpenSLES hanya fallback

**Konteks.** Kode memaksa `oboe::AudioApi::OpenSLES` dengan komentar `TEST ONLY` (kemungkinan besar karena AAudio bermasalah di device uji saat itu).

**Masalah.** OpenSLES tidak punya mode exclusive, jadi sampel selalu lewat mixer Android dan bit-perfect ke DAC tidak mungkin tercapai. Terverifikasi di logcat 2026-10-05.

**Keputusan.** Coba AAudio dulu; jatuh ke OpenSLES hanya kalau AAudio gagal (device lama atau driver bermasalah). Setiap fallback dicatat sebagai PERINGATAN eksplisit bahwa bit-perfect tidak tersedia.

**Konsekuensi.** Device lama tetap bisa memutar audio (fallback jalan), tapi tidak bisa bit-perfect - dan itu dilaporkan dengan jujur, bukan didiamkan.

### ADR-12 - Laju stream dideteksi, bukan konstanta

**Konteks.** Tiga tempat memaku 48000 sekaligus: `buildStream`, `DecodeConfig.targetSampleRate`, dan konstruksi decoder. Akibatnya SEMUA file dikonversi ke 48 kHz termasuk 96/192 kHz.

**Keputusan.** Laju dibaca dari kapabilitas device/DAC aktif lewat `AudioManager.getDevices()`. Pemilihan per-file berurutan: laju file kalau didukung (tanpa konversi), kelipatan bulat terkecil, tertinggi yang <= laju file, lalu terendah.

**Konsekuensi.** Kalau DAC mendukung laju file, resampler tidak aktif sama sekali. Kalau tidak, ada konversi - tapi tetap di laju tertinggi yang didukung, bukan langsung turun ke 48 kHz. Batasnya: `AudioManager` hanya melaporkan laju **maksimum** per device, bukan laju mana yang sedang aktif, jadi pilihan bisa ditolak sistem saat stream dibuka. Karena itu `actualSampleRate()` dibaca kembali setelah stream terbuka dan dipakai sebagai target decoder.

### ADR-13 - Device routing: catat & validasi, jangan paksa

**Konteks.** `AudioDeviceManager` adalah stub: `getAvailableDevices()` mengembalikan `{}`, `setActiveDevice()` mengembalikan `true` tanpa efek.

**Masalah.** Mengembalikan `true` buta lebih buruk daripada gagal: pemanggil mengira device sudah diganti padahal tidak, dan tidak ada cara mendeteksi kegagalannya.

**Keputusan.** Manager membaca daftar device nyata dan memvalidasi pilihan terhadap daftar itu - `false` kalau id tidak ada. Penerapan sebenarnya ke stream dilakukan lewat `Oboe setDeviceId()` saat stream dibuka, karena Android tidak punya API publik untuk "paksa output sekarang".

**Konsekuensi.** Pemanggil mendapat jawaban jujur soal validitas pilihan, tapi masih tidak bisa menjamin sistem menghormatinya. `supportsExclusive` disimpan per device supaya UI tidak menawarkan bit-perfect untuk speaker/headphone built-in yang secara teknis selalu lewat mixer.

### ADR-10 - `ThemeId` dideklarasikan manual, bukan diturunkan dari `ALL_THEMES`

`ThemeId` adalah union 20 string literal yang ditulis tangan di `themes/types.ts`. Tidak ada mekanisme yang menjaminnya tetap sinkron dengan `ALL_THEMES`. Saat ini keduanya cocok (20 = 20, diverifikasi 2026-10-03), tapi menambah tema ke satu sisi tanpa sisi lain **tidak akan menghasilkan error sampai runtime** - `getThemeById` akan diam-diam mengembalikan `midnight-blue`.
