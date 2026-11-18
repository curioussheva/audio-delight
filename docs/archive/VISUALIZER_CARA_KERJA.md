# Visualizer PristineAudio — Cara Kerja & Cara App Dibangun

**Tanggal:** 2026-11-10. **Branch:** `fix/ffmpeg-disable-doc` @ `c63b4421`.
**Status visualizer saat ini: TIDAK BERFUNGSI** — 3 blocker (lihat §7 dan
`AUDIT_2026-11-10.md` § Jalur 3). Dokumen ini menjelaskan cara kerjanya
**sebagaimana dirancang** dan bagaimana app dibangun di sekelilingnya, supaya
perbaikan nanti menyentuh tempat yang benar, bukan gejala.

---

## 1. Bagaimana app dibangun — lima lapis

PristineAudio adalah pemutar musik Android: React Native + Expo di atas,
engine audio C++ (Oboe + FFmpeg) di bawah. Setiap lapis hanya berbicara dengan
lapis di sebelahnya.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. JS/TS — React Native 0.83.10, React 19.2.0, Expo ~55.0.31   │
│    src/app/ (Expo Router) · src/features/ · src/shared/         │
│    src/specs/ (kontrak TurboModule) · store Zustand              │
├─────────────────────────────────────────────────────────────────┤
│ 2. Jembatan JS → native                                         │
│    TurboModuleRegistry.getEnforcing<Spec>('NamaModul')           │
│    PristineAudioPackage.kt mendaftarkan modul ke React Native    │
├─────────────────────────────────────────────────────────────────┤
│ 3. Kotlin — 16 file, adaptor tipis                              │
│    NativePlaybackModule · NativePlaybackService · NativeDSPModule│
│    NativeVisualizerBridge · NativeDeviceModule · MediaStoreModule│
│    PlaybackService (foreground) · MediaSessionManager ·          │
│    PlaybackNativeBridge (event emitter)                          │
├─────────────────────────────────────────────────────────────────┤
│ 4. JNI — fungsi C bernama Java_com_pristineaudio_...             │
│    android/app/src/main/cpp/jni/                                 │
├─────────────────────────────────────────────────────────────────┤
│ 5. C++ — engine `pristine-audio` (.so), 178 file                 │
│    manager/EngineManager · core/AudioEngine, AudioCallback,      │
│    AudioPipeline · playback/PlaybackController, FFmpegDecoder    │
│    dsp/ (DSPChain, EQ, immersive) · decoder/ · resampler/        │
│    devices/ · fft/ · visualizer/ · realtime/ · utils/            │
│    Oboe vendored (diambil lewat script `download-oboe`)          │
└─────────────────────────────────────────────────────────────────┘
```

**Angka yang terverifikasi 2026-11-10:** 206 file TS/TSX di `src/`, 16 file
Kotlin di `android/app/src/main/java/`, 178 file C++ (`.cpp` + `.h`) di
`android/app/src/main/cpp/`. Build: EAS (`build:dev` / `build:preview` /
`build:prod`) atau Gradle lokal; CI GitHub Actions (`build-dev.yml`,
`build-preview.yml`); FFmpeg dibangun `scripts/build-ffmpeg-android.sh`.
`app.json`: PristineAudio v1.0.37, package `com.pristineaudio.app`.
CMakeLists memakai `file(GLOB_RECURSE ...)` — semua `.cpp` ikut terkompilasi,
termasuk yang tidak punya pemanggil (ini relevan: lihat §7).

**Aturan main lapis 5 (audio thread):** Oboe memanggil
`AudioCallback::onAudioReady` pada tiap buffer audio. Callback ini
**real-time**: tidak boleh alokasi, tidak boleh lock, tidak boleh panggil JS.
Karena itu visualizer dirancang sebagai **sadapan (tap)**: callback hanya
menyalin sample ke sebuah ring buffer, dan semua pekerjaan berat (FFT,
polling, gambar) terjadi di thread lain. Prinsip ini benar — yang rusak
adalah sambungan di sekelilingnya.

---

## 2. Cara kerja visualizer — alur yang dirancang

```
[Langkah 0] Session ID dibuat (sekali, saat play)
     NativeDSPModule.createAudioSession() → id sintetis Android
     → useAudioPlayer.syncAudioSession() → equalizer store
     (BUKAN player store — ini akar blocker B1, lihat §7)

[Langkah 1] Audio thread menulis (tiap buffer Oboe, ~ribuan kali/detik)
     AudioCallback::onAudioReady
       → PlaybackController::render() → pipeline (mode) → sanitize
       → mVisualizer.write(mLeft, mRight, numFrames)
       → VisualizerBuffer: mixdown stereo→mono, tulis ke ring 2048

[Langkah 2] UI thread membaca, 20x per detik
     VisualizerService.start(sessionId) → doStart()
       → bridge.startVisualizer(sessionId)   (no-op, hanya log)
       → startPolling(): setInterval 50 ms
         → bridge.getFFTData()
           → JNI getVisualizerData() → 256 sample mentah
           → Kotlin: cek ≥ 2048 → Hann → FFT radix-2 → magnitude
             → 128 bin log-scaled (20 Hz–20 kHz, −80..−10 dB)
           → Promise<number[128]>

[Langkah 3] Service mengolah
     handleFftData: validasi panjang 128 → applySmoothing (0.3)
       → kirim ke SEMUA subscriber: Set callback + Set SharedValue
         (multi-subscriber sejak 2026-11-10; sebelumnya SATU output saja —
         lihat "Perbaikan 2026-11-10 (multi-subscriber)" di §7)

[Langkah 4] Layar menggambar
     SpectrumAnalyzer (Skia Canvas): 128 bin → N bar (log mapping,
       falloff 0.85, sensitivity) → Path persegi bulat + blur
     SpectogramView: konsumen kedua, jalur yang sama

[Langkah 5] Tab mengatur hidup-mati
     visualizer.tsx: baca audioSessionId dari playerStore
       → hasValidSession = id > 0
       → SpectrumAnalyzer start hanya bila isPlaying && id > 0
       → AppState: pause saat background, resume saat active
```

### Langkah 0 — dari mana session ID berasal

Session ID **bukan** milik stream Oboe. Ia dibuat oleh
`NativeDSPModule.createAudioSession()` (`NativeDSPModule.kt:195`,
dideklarasikan `nativeInterface.ts:13`) — sebuah ID sesi audio Android
sintetis, yang tujuan aslinya adalah jalur efek Android (bass boost via
`AudioManager`). `useAudioPlayer.ts:35-52` (`syncAudioSession`) mengambil ID
itu dan menulisnya ke **equalizer store**
(`useEqualizerStore(...setAudioSessionId)`), lengkap dengan komentar TODO
"custom service belum punya getAudioSessionId". Player store punya field
`audioSessionId` sendiri (`playerStore.ts:129`, initial `null` `:181`,
setter `:918`) — tapi tidak ada yang pernah menulisnya. Dua store, satu ID,
tidak ada yang menjembatani. Itulah kenapa tab visualizer selalu membaca
null.

### Langkah 1 — sadapan di audio thread

`AudioCallback.cpp` memanggil `mVisualizer.write(mLeft, mRight, numFrames)`
di **dua** tempat: akhir `onAudioReady` (jalur utama, setelah pipeline +
sanitize) dan jalur fallback (tanpa PlaybackController). Artinya visualizer
melihat sinyal **keluaran akhir** — setelah DSP di mode DSP/immersive, dan
mentah di mode bit-perfect (pipeline-nya no-op).

`VisualizerBuffer` (`visualizer/VisualizerBuffer.h`):
- `kSize = 2048`, `kMask = 2047` — ring buffer, indeks dibungkus `& kMask`.
- Dua buffer `float mBufferA[2048]` / `mBufferB[2048]`, `alignas(16)`.
- `std::atomic<int> mWriteBuffer{0}` — penanda buffer yang sedang ditulis.
- `std::atomic<uint32_t> mWritePos{0}` — posisi tulis global (monoton naik).

`write()` (`VisualizerBuffer.cpp:30`): baca `mWriteBuffer` (selalu 0, karena
tidak ada yang pernah men-store), pilih buffer, tulis
`(left[i] + right[i]) * 0.5f` (mixdown mono) ke posisi `(pos + i) & kMask`,
lalu `mWritePos.store(pos + frames, release)`. Tanpa lock, tanpa alokasi —
aman dipanggil dari audio thread.

`read()` (`VisualizerBuffer.cpp:85`): baca buffer **kebalikan** dari penulis
(niatnya anti-tearing), lalu salin `size` sample terakhir:
`src[(pos - size + i) & kMask]`. Masalahnya: karena `mWriteBuffer` tidak
pernah di-flip, penulis selalu ke A dan pembaca selalu ke B — dan B hanya
berisi nol dari konstruktor. (Detail di §7, blocker B3.)

### Langkah 2 — JNI + FFT Kotlin

`NativeVisualizerModule.cpp` — satu-satunya fungsi JNI visualizer:

```cpp
Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getVisualizerData(
    JNIEnv* env, jobject) {
    constexpr int kVisualizerSize = 256;   // <-- akar blocker B2
    jfloatArray array = env->NewFloatArray(kVisualizerSize);
    float buffer[kVisualizerSize];
    EngineManager::get().engine().getVisualizerData(buffer, kVisualizerSize);
    env->SetFloatArrayRegion(array, 0, kVisualizerSize, buffer);
    return array;
}
```

`AudioEngine::getVisualizerData` (`core/AudioEngine.cpp:281`) hanya
meneruskan ke `mCallback.visualizerBuffer().read(dst, size)`.

`NativeVisualizerBridge.kt` — kelas ini melakukan tiga hal:
1. **Siklus hidup (no-op).** `startVisualizer(audioSessionId, promise)` hanya
   log + `resolve(true)` — parameter session dipertahankan agar kontrak TS
   tidak berubah, tapi tidak dipakai (data dari engine sendiri).
   `stopVisualizer()` hanya log. Tidak ada objek
   `android.media.audiofx.Visualizer` lagi (sengaja dihapus — lihat §5).
2. **`getFFTData()`** — panggil JNI `getVisualizerData()`, tolak dengan
   `VISUALIZER_SHORT_BUFFER` bila `< FFT_SIZE` (2048), selain itu hitung
   spektrum dan kembalikan `number[128]`. Kegagalan di-reject dengan kode
   spesifik (`VISUALIZER_UNAVAILABLE`, `VISUALIZER_SHORT_BUFFER`,
   `VISUALIZER_ERROR`), bukan array kosong.
3. **FFT** — `computeSpectrum`: ambil 2048 sample terakhir, jendela Hann
   (mencegah spectral leakage), `fftInPlace` radix-2 decimation-in-time
   (bit-reversal + butterfly), magnitude `sqrt(re²+im²)/half` sampai Nyquist,
   lalu `mapToLogBins`: 1024 bin linear dikelompokkan logaritmik (20 Hz–
   20 kHz) jadi 128 bin, dipetakan ke 0.0–1.0 via dB
   (`20·log10`, floor −80 dB, ceil −10 dB). Konstanta di
   `NativeVisualizerBridge.kt:59` (`FFT_SIZE = 2048`), `:172`
   (`computeSpectrum`), `:270` (`mapToLogBins`).

Kenapa FFT di Kotlin, bukan C++? Komentar kelasnya menjelaskannya: FFT native
(`cpp/fft/FFTPlan.{h,cpp}`, radix-2, nyata) ada, tapi **JNI yang
mengeksposnya belum pernah dibuat** — `NativeVisualizerModule.cpp` hanya
mengembalikan sample mentah. Jadi Kotlin menghitung sendiri supaya visualizer
bisa berfungsi tanpa jalur JNI baru. Konsekuensinya ada tiga implementasi FFT
di repo (lihat §6).

### Langkah 3 — VisualizerService (otak di JS)

`src/features/visualizer/services/VisualizerService.ts` — singleton
(`export const visualizerService`). Tanggung jawabnya: lifecycle, polling,
smoothing, dan pengiriman data ke semua subscriber (Set callback + Set
SharedValue; multi-subscriber sejak 2026-11-10).

- **`start(sessionId)`** (`:191`): tolak bila modul tidak ada atau
  `sessionId <= 0`; bila sesi berganti, stop native dulu; bila belum ada
  output target, simpan `pendingSessionId` (start di-queue sampai
  `setDataCallback`/`initialize` dipanggil).
- **`doStart`** (`:228`): panggil `bridge.startVisualizer`, lalu
  `startPolling()`. Gagal → retry maks 3x dengan backoff 100/200/300 ms.
- **`startPolling`** (`:325`): `setInterval` 50 ms → `getFFTData()` →
  `handleFftData`. Tanpa guard overlap: bila satu panggilan bridge > 50 ms,
  panggilan berikutnya menumpuk.
- **`handleFftData`** (`:366`): validasi panjang tepat 128, smoothing
  eksponensial (`previous*0.7 + baru*0.3`, `applySmoothing` `:388`), lalu
  kirim ke `frequencyData` (SharedValue) ATAU `dataCallback` — keduanya
  saling meniadakan (`setDataCallback` meng-nol-kan SharedValue dan
  sebaliknya).
- **`pause` / `resume` / `stop` / `destroy`** (`:260, :273, :288, :314`):
  pause stop polling + stop native tapi simpan state; resume memakai
  `lastSessionId`; stop me-reset semuanya dan mengirim array 128 nol ke
  output; destroy juga melepas listener AppState.
- **AppState** (`:96, :109`): background/inactive → pause; active →
  resume bila sebelumnya pause dan ada session.
- **`onError`** (`:73`): field ini **tidak punya setter** — tidak ada yang
  bisa mengisinya, jadi `this.onError?.(error)` (`:349`) tidak pernah fire.
  Yang jalan hanya log kegagalan pertama + hitungan `consecutiveFailures`.

### Langkah 4 — menggambar (Skia + Reanimated)

`SpectrumAnalyzer.tsx` — komponen yang digambar tab visualizer:
- **Render:** `@shopify/react-native-skia` `Canvas` + `Path`. Tiap frame,
  `visualizerPath` (derived value) membangun path dari persegi bulat
  (`barWidth` + gap 3, radius 4, tinggi `amp * height * 0.85`) dengan
  `BlurMask blur=2`. Warna = `color` prop (default `#00D4AA`).
- **Data:** `freqData` adalah Reanimated `SharedValue<number[]>` (isi awal
  128 nilai 0.1). `setDataCallback` service menulis ke sini via `runOnUI`
  (worklet) — jadi update bar tidak melewati JS thread React biasa.
- **Pemetaan 128 bin → N bar:** `processedData` (`:160`) — indeks log
  (`logT = t^1.2`), rata-rata 8 bin sekitar, kali `sensitivity` (default
  2.2), kali `1 + (i/barCount)*0.5` (boost frekuensi tinggi), clamp
  0.05–1.0, lalu **falloff 0.85**: bar hanya boleh turun 15% per frame
  (naik bebas, turun pelan — ini yang membuat animasi terlihat "jatuh"
  natural, bukan berkedip).
- **Animasi dummy:** bila `!hasRealData && isPlaying`, digambar gelombang
  sinus palsu (tiga sinus dijumlah, fase maju 0.5 tiap 100 ms), opacity
  0.5. `hasRealData` jadi true bila ada frame dengan max > 0.01, dan false
  lagi setelah > 10 frame sunyi. Di build release **tidak ada penanda**
  bahwa ini palsu; hanya overlay debug `__DEV__` yang menampilkan
  `FFT Max` + `Real: Y/N`.
- **Start/stop:** efek `:120` — `shouldStart = isPlaying && audioSessionId
  > 0`. Ganti `barCount` ikut me-restart sesi (ada di deps efek).
  Sisa `const success = true;` (`:113`) adalah bekas pemanggilan
  `initialize` yang dihapus; cleanup efek init kosong (`:120`).

`SpectogramView.tsx` — konsumen kedua: memakai `setDataCallback` yang sama.
Sebelum perbaikan 2026-11-10, service hanya punya satu slot output, jadi
komponen yang terakhir memasang callback menang; yang lain berhenti
menerima data tanpa pemberitahuan. Sekarang keduanya menerima data yang
sama (multi-subscriber).

### Langkah 5 — tab dan gating

`visualizer.tsx` — `VisualizerScreen()`:
- Baca `currentSong`, `isPlaying`, `audioSessionId` dari `playerStore`.
- `hasValidSession = audioSessionId > 0`. Bila `currentSong` null → empty
  state + tombol Kembali. Bila `isPlaying` → render `SpectrumAnalyzer`
  (mode `"bars"`, `barCount={64}`, tinggi 280); bila dijeda → overlay
  "⏸️ Playback dijeda".
- Bila `!hasValidSession && isPlaying` → peringatan kuning "Audio session
  tidak tersedia. Coba restart lagu." + tombol retry (ikon RefreshCw).
  `handleRetry` (`:33`) hanya menaikkan counter — reconnect dikomentari
  (`// usePlayerStore.getState().reconnectDSP?.()`).
- Debug `__DEV__`: `Session ID: {audioSessionId || "null"}`.

`analyzer.tsx` — tab Analyzer memakai service yang sama (dan `api/analyzer.ts`
untuk analisis statis file — heuristik tabel bitrate, bukan FFT; lihat §6).

---

## 3. Kenapa tanpa `RECORD_AUDIO` (sengaja, dan benar)

Visualizer **tidak memakai mikrofon**. Datanya berasal dari buffer engine
sendiri (`VisualizerBuffer`), yang diisi audio thread dari sinyal yang sedang
diputar. Karena itu:

- `RECORD_AUDIO` **sengaja tidak ada** di `AndroidManifest.xml:11-18`.
- `engine.enableVisualizer()` (`engine.ts:236`) memanggil
  `requestAudioPermissions()` — itu izin **media**
  (`READ_MEDIA_AUDIO`/`READ_EXTERNAL_STORAGE`), bukan mic; penamaannya
  menyesatkan, tapi keputusannya benar.
- `android.media.audiofx.Visualizer` (objek sistem Android) sudah **dihapus**
  dari `NativeVisualizerBridge`: versi lama membuatnya lalu membuang hasilnya
  (`getFFTData()` tidak pernah membacanya), sementara objek itu menahan sumber
  daya audiofx yang bisa bentrok dengan sesi Oboe low-latency.

Jangan tambahkan `RECORD_AUDIO` saat memperbaiki visualizer — tidak
dibutuhkan, dan akan meminta izin yang tidak ada gunanya.

---

## 4. Jahitan yang tak terlihat — TurboModule vs legacy

Kontrak TS (`src/specs/NativeVisualizerBridge.ts`):

```ts
export interface Spec extends TurboModule {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  getFFTData(): Promise<number[]>;
  ...
}
export default TurboModuleRegistry.getEnforcing<Spec>('NativeVisualizerBridge');
```

Tapi kelas Kotlin-nya (`NativeVisualizerBridge.kt`) extends
`ReactContextBaseJavaModule` — **modul legacy**, bukan TurboModule
(Codegen). `PristineAudioPackage.kt:9,20` mendaftarkannya secara manual ke
`createNativeModules`. Resolusi nama terjadi **dinamis di runtime** lewat
`TurboModuleRegistry.getEnforcing` — tidak ada edge statis dari JS ke
Kotlin yang bisa dibaca graphify atau grep. Inilah kenapa `graphify path
VisualizerService → NativeVisualizerBridge` tidak menemukan jalur, dan kenapa
audit jalur 1 mencatat inkonsistensi arsitektur yang sama untuk
`NativePlaybackModule`/`NativePlaybackService`. Fungsinya jalan (build CI
sukses, modul ter-resolve), tapi sambungannya tidak terlihat di analisis
statis. Kalau modul tidak ditemukan, `getEnforcing` throw sinkron saat
import — sebelum error state app sempat tampil.

---

## 5. Tiga FFT, dua analisis, satu service — duplikasi yang ada

| Implementasi | Lokasi | Status |
|---|---|---|
| `fftInPlace` (Kotlin) | `NativeVisualizerBridge.kt` | Nyata; **satu-satunya yang terhubung ke layar** (tapi kelaparan buffer — B2) |
| `FFTPlan` radix-2 (C++) | `cpp/fft/FFTPlan.{h,cpp}` | Nyata; pemakai hanya `FFTResonanceAnalyzer` (immersive) + test paritas; tanpa JNI ke visualizer |
| `SpectrumAnalyzer` / `FFTProcessor` / `SpectrumVisualizer` (C++) | `cpp/fft/` | Nyata (`FFTProcessor` memanggil `mPlan.forward`); **nol pemanggil** di luar `fft/`; `SpectrumVisualizer::onUpdate` stub eksplisit; `WaveformVisualizer` juga nol pemanggil. Semua terkompilasi via glob CMakeLists |
| `api/fft.ts` (JS) | `src/features/visualizer/api/fft.ts` | Kode mati (nol pemanggil); komentar mapping log-nya tidak cocok dengan dB Kotlin |
| `api/analyzer.ts` (JS) | `src/features/visualizer/api/analyzer.ts` | Analisis **statis file** (heuristik): `analysisMethod` selalu `"heuristic"`, `peakFrequencyHz = cutoff*0.95`, dynamic range rumus teoritis `6.02*bitDepth+1.76`. Dipakai tab analyzer — tapi label hasilnya ("spectral cutoff", "peak frequency") menyesatkan karena itu estimasi tabel bitrate, bukan pengukuran FFT |

`scripts/test_fft_parity.cpp` menjaga dua implementasi pertama tetap sepadan
(selisih maks `1.99e-06`). Tidak ada yang menjaga yang ketiga.

---

## 6. Peta file subsistem visualizer

| Lapisan | File | Peran |
|---|---|---|
| Tab | `src/app/(drawer)/(tabs)/visualizer.tsx` | Gating session, empty state, peringatan, retry (no-op) |
| Tab | `src/app/(drawer)/(tabs)/analyzer.tsx` | Tab Analyzer (service + analisis statis file) |
| Render | `src/features/visualizer/components/SpectrumAnalyzer.tsx` | Skia bars + dummy + falloff |
| Render | `src/features/visualizer/components/SpectogramView.tsx` | Konsumen kedua (spectrogram) |
| Service | `src/features/visualizer/services/VisualizerService.ts` | Lifecycle, polling 50 ms, smoothing, fan-out multi-subscriber (sejak 2026-11-10) |
| API mati | `src/features/visualizer/api/fft.ts` | Kode mati (validasi 128 bin) |
| API | `src/features/visualizer/api/analyzer.ts` | Analisis statis file (heuristik) |
| Hook mati | `src/features/visualizer/hooks/useAudioAnalyzer.ts` | Tidak ada layar yang mengimpor |
| Barrel | `src/features/visualizer/index.ts` | Re-export (satu-satunya yang mengimpor hook di atas) |
| Spec | `src/specs/NativeVisualizerBridge.ts` | Kontrak TurboModule (`getEnforcing`) |
| Registrasi | `android/app/src/main/java/com/pristineaudio/PristineAudioPackage.kt` | Daftarkan 7 modul native |
| Kotlin | `android/app/src/main/java/com/pristineaudio/visualizer/NativeVisualizerBridge.kt` | FFT 2048 → 128 bin, start/stop no-op, reject jujur |
| JNI | `android/app/src/main/cpp/jni/NativeVisualizerModule.cpp` | `getVisualizerData` → 256 sample mentah |
| Engine | `android/app/src/main/cpp/core/AudioEngine.cpp:281` | `getVisualizerData` → `mCallback.visualizerBuffer().read()` |
| Callback | `android/app/src/main/cpp/core/AudioCallback.cpp:134, 264` | `mVisualizer.write(mLeft, mRight, numFrames)` (2 jalur) |
| Buffer | `android/app/src/main/cpp/visualizer/VisualizerBuffer.{h,cpp}` | Ring 2048, double-buffer, atomics |
| FFT C++ | `android/app/src/main/cpp/fft/FFTPlan.{h,cpp}` | Radix-2 nyata (tanpa JNI visualizer) |
| FFT C++ mati | `android/app/src/main/cpp/fft/SpectrumAnalyzer.{h,cpp}`, `SpectrumVisualizer.cpp`, `WaveformVisualizer.{h,cpp}` | Nyata tapi nol pemanggil; `feed()` punya OOB laten |
| Session | `src/features/player/hooks/useAudioPlayer.ts:35-52` | `syncAudioSession` → **equalizer store** |
| Session | `src/features/player/api/engine.ts:236` | `enableVisualizer()` — tanpa pemanggil, di-gate `isExclusive` |
| Session | `src/features/player/store/playerStore.ts:129,181,918` | Field + setter `audioSessionId` — nol pemanggil |

---

## 7. Di mana rantai putus (ringkas — detail di `AUDIT_2026-11-10.md`)

1. **B1 — session ID tidak pernah sampai.** `useAudioPlayer.syncAudioSession`
   menulis ke equalizer store; `playerStore.audioSessionId` tidak pernah
   ditulis siapa pun. Tab + `SpectrumAnalyzer` membaca null → service tidak
   pernah di-start.
2. **B2 — JNI 256 vs FFT 2048.** `kVisualizerSize = 256`
   (`NativeVisualizerModule.cpp:23`) vs `FFT_SIZE = 2048`. `getFFTData()`
   selalu reject `VISUALIZER_SHORT_BUFFER`.
3. **B3 — buffer baca selalu nol.** `mWriteBuffer` tidak pernah di-`store`
   (`VisualizerBuffer.cpp` hanya dua `load()`); `write()` selalu ke A,
   `read()` selalu dari B (yang hanya nol). "Perbaikan" anti-tearing 9848ed0d
   yang menciptakan ini — sebelumnya robek, sesudahnya nol.
4. **Penyamaran:** animasi dummy (`SpectrumAnalyzer.tsx:160-172`) + opacity
   0.5 tanpa label di release; `onError` tanpa setter; tombol retry no-op;
   satu slot output untuk dua konsumen.

Perbaikan P0 (dari audit — **diperbaiki 2026-11-10, lihat
`AUDIT_2026-11-10.md` § "Perbaikan 2026-11-10"**): sambungkan session ID ke
player store (`initStore` + `syncAudioSession`, getter `getSessionId()` baru
di `engine.ts`); samakan buffer JNI 256 → 2048; `read()` kembali membaca
buffer yang sama dengan `write()` + test C++ tulis→baca baru
(`scripts/test_visualizer_buffer.cpp`, 6/6 lolos). **Koreksi:** rekomendasi
audit semula ("flip `write()` per panggilan") salah — flip per panggilan
menyebar chunk selang-seling ke dua buffer sehingga tidak ada satu buffer
pun yang berisi 2048 sample terakhir yang utuh; yang benar adalah `read()`
membaca buffer yang sama. Status tetap **belum terverifikasi di device**
sampai Fase 1 membuktikan rantai hidup.

**Perbaikan 2026-11-10 (multi-subscriber):** pemeriksaan elemen terdekat
analyzer menemukan `VisualizerService` hanya punya SATU slot output untuk
tiga layar (tab Analyzer + tab Visualizer + `SpectogramView` di player).
Diperbaiki: service memakai `Set` callback + `Set` SharedValue, `setDataCallback`
/`initialize` aditif dan mengembalikan unsubscribe, polling berhenti hanya
saat subscriber terakhir pergi, `stop()` kini kill-switch global saja.
`SpectrumAnalyzer` dan `SpectogramView` diubah subscribe/unsubscribe dan
tidak lagi memanggil `stop()`; `const success = true;` yang mati di
`SpectrumAnalyzer` ikut dibersihkan. Unit test baru
`src/__tests__/features/visualizer/VisualizerService.test.ts` 5/5 lolos
(fan-out, unsubscribe satu, subscriber terakhir pergi, pending start,
SharedValue).

---

## 8. Kenapa "dianaktirikan" — bukan satu bug, tapi tidak ada pemilik

Bukti yang terkumpul dari kode, bukan dari kesan:

- **Session ID dibangun untuk orang lain.** Satu-satunya penulis session ID
  adalah jalur efek Android (bass boost) — visualizer hanya "numpang" ID
  itu, dan numpangnya pun putus di tengah (equalizer store vs player store).
- **`startVisualizer` adalah no-op.** Fungsi yang namanya paling menjanjikan
  di rantai ini tidak melakukan apa-apa selain log.
- **FFT native ada tapi tidak pernah dihubungkan.** JNI-nya tidak dibuat,
  jadi Kotlin menghitung sendiri — dan sekarang ada tiga FFT.
- **Kegagalan disembunyikan, bukan dilaporkan.** Animasi dummy, `onError`
  mati, retry no-op, array kosong di versi lama. Setiap lapisan menutupi
  lapisan di bawahnya, sampai tidak ada yang tahu jalurnya mati.
- **Tidak ada test.** Nol test visualizer di `src/__tests__`; test C++
  (`test_fft`, paritas) hanya menguji matematika FFT, bukan rantai hidup.
- **Dokumennya bilang sudah diperbaiki.** `VISUALIZER_AUDIT.md` berstatus
  DIPERBAIKI sementara tiga blocker di atas ada di kode — dikoreksi
  2026-11-10 (lihat dokumen tersebut).

Pola yang sehat di repo ini — dan yang dipakai equalizer sebagai layar
teladan — adalah: gagal berisik, satu sumber kebenaran, dan status yang bisa
dibuktikan di kode. Visualizer melanggar ketiganya sekaligus. Perbaikan yang
benar bukan sekadar menambal tiga blocker, tapi mengembalikan tiga hal itu:
satu pemilik ujung-ke-ujung (session → buffer → FFT → service → layar),
kegagalan yang terlihat, dan satu test integrasi yang membuktikan rantai
hidup.
