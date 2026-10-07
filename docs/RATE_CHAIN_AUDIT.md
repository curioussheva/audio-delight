# Rate Chain Audit — hulu ke hilir

**Tanggal:** 2026-10-07
**Scope:** bagaimana sample rate mengalir dari file → decoder → stream → DAC, dan di mana rantainya putus.
**Kaitan:** melengkapi [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md) (bug domain posisi) dan [`PLAYBACK_CONSISTENCY_ANALYSIS.md`](./PLAYBACK_CONSISTENCY_ANALYSIS.md) (konsistensi JNI).

---

## Jawaban singkat

**Autodetect device/DAC sudah ada dan sudah jalan** — tidak perlu dibuat lagi.
Yang belum ada adalah **jalur yang membawa laju file ke stream**. Deteksi perangkat
dan penyaluran laju file adalah dua hal berbeda, dan hanya yang pertama yang selesai.

---

## 1. Yang sudah ada (terverifikasi ada pemanggil)

| Komponen | Lokasi | Status |
|---|---|---|
| `DeviceRateDetector::refresh()` | `core/DeviceRateDetector.cpp:87` | ✅ dipanggil `AudioEngine.cpp:54` |
| `DeviceRateDetector::supportedRates()` | `core/DeviceRateDetector.cpp:237` | ✅ dipanggil `AudioEngine.cpp:59` |
| `setDeviceRateDetectorVm()` | dipanggil `jni/OnLoad.cpp:69` | ✅ JavaVM terpasang di JNI_OnLoad |
| `AudioEngine::start(exclusive, rate)` | `core/AudioEngine.cpp:40` | ✅ menerima laju; `rate<=0` → deteksi sendiri |
| `AudioStreamController::actualSampleRate()` | `core/AudioStreamController.cpp` | ✅ laju aktual stream dipakai hilir |

Rantai yang **sudah** tersambung:

```
AudioEngine::start(exclusiveMode, requestedSampleRate = 0)
   └─ requestedSampleRate <= 0
        └─ DeviceRateDetector::refresh()              ← baca AudioManager (termasuk USB DAC)
        └─ rates.back() = laju TERTINGGI yang didukung
   └─ mStreamController.open(..., requestedSampleRate)
   └─ actualRate = mStreamController.actualSampleRate()
   └─ mPipeline.prepare(actualRate, framesPerBurst)
   └─ mCallback.setSampleRate(actualRate)
```

Jadi deteksi perangkat, pemilihan laju, dan pemakaian laju *aktual* (bukan laju
yang diminta) sudah benar dan sudah terpasang.

---

## 2. Di mana rantainya putus

### 2.1 `EngineManager::start()` tidak punya parameter laju

```cpp
// android/app/src/main/cpp/manager/EngineManager.h:25
void start();          // ← tidak ada parameter sample rate
```

```cpp
// android/app/src/main/cpp/manager/EngineManager.cpp:80
mEngine.start(
    exclusiveMode      // ← argumen kedua (requestedSampleRate) tidak pernah diisi
);
```

```cpp
// android/app/src/main/cpp/manager/EngineManager.cpp:236 (toggleExclusiveMode)
mEngine.start(
    enabled
);
```

**Akibat:** `requestedSampleRate` **selalu 0** di kedua call site. Engine selalu
memilih **laju tertinggi yang didukung perangkat**, bukan laju file.

Contoh nyata: file 44.1 kHz pada DAC yang mendukung 384 kHz → engine membuka
stream di 384 kHz, lalu decoder meresample 44.1 → 384. Itu **empat kali upsampling
fraksional**, kebalikan dari bit-perfect.

### 2.2 `pickBestRate()` — fungsi yang dirancang untuk ini — tidak pernah dipanggil

```cpp
// core/DeviceRateDetector.h:60
static int32_t pickBestRate(int32_t fileRate);   // "laju file kalau didukung"
```

Audit pemanggil (definisi dikecualikan):

| Fungsi | Pemanggil nyata |
|---|---|
| `refresh` | 1 |
| `supportedRates` | 1 |
| `pickBestRate` | **0** |
| `supportsRate` | **0** |
| `isBitPerfectFor` | **0** |
| `activeDeviceName` | **0** |
| `isUsbActive` | **0** |

`pickBestRate` sudah mengimplementasikan aturan yang benar (laju file persis →
kelipatan bulat → laju tertinggi → fallback apa adanya), tapi tidak ada yang
memanggilnya. `isBitPerfectFor()` — yang jelas-jelas untuk indikator bit-perfect
di UI — juga menganggur.

### 2.3 Tidak ada API laju per-file sama sekali

```bash
$ grep -rni "setFileRate\|setTrackRate\|fileSampleRate\|nativeRate" android/app/src/main
# hanya komentar oboe; tidak ada API
```

Tidak ada jalur Kotlin/JS untuk memberi tahu engine "file ini 96 kHz". `TrackInfo`
tidak membawa laju ke engine, dan `EngineManager::start()` tidak menerimanya.

### 2.4 `USBDACModule.setSampleRate` adalah stub murni

```kotlin
// android/app/src/main/java/com/pristineaudio/usb/USBDACModule.kt:134
@ReactMethod
fun setSampleRate(rate: Int, promise: Promise) {
    try {
        // Implementasi pergantian clock rate hardware DAC   ← komentar, bukan kode
        val result = Arguments.createMap().apply {
            putBoolean("success", true)
            putInt("sampleRate", rate)
        }
        promise.resolve(result)     // ← selalu "sukses", tidak mengubah apa pun
    } catch (e: Exception) {
        promise.reject("ERR_SAMPLERATE", e.message)
    }
}
```

Modul ini **tidak punya `external fun` dan tidak memanggil `System.loadLibrary`** —
nol JNI. Sama untuk `setExclusiveMode` di file yang sama (baris ~120), yang juga
hanya menyetel flag lokal.

**Akibat:** slider sample rate di `settings.tsx` → `useUSBDAC.setSampleRate()` →
`saveConfig({...config, sampleRate})` hanya **menyimpan preferensi ke konfigurasi**.
Tidak ada efek ke stream audio. UI memberi kesan bisa memilih laju, padahal tidak.

### 2.5 `NativeDeviceModule` tidak dikonsumsi JS

`src/specs/NativeDeviceModule.ts` ada, tapi tidak ada hook/consumer yang
memakainya (hanya referensi komentar di `shared/types/dac.ts`). Kotlin
`NativeDeviceModule.kt:159` bahkan mengembalikan `48000` sebagai fallback
hardcode saat `info.sampleRate` gagal dibaca.

---

## 3. PrebufferManager: seluruhnya dead code

Audit memperlihatkan `PrebufferManager` **tidak direferensikan dari mana pun**:

```bash
$ grep -rn "PrebufferManager" android/app/src/main \
    --include=*.cpp --include=*.h --include=*.kt --include=*.txt \
    | grep -v "playback/PrebufferManager"
# (kosong)
$ grep -rn "takePrebuffer\|startPrebuffer" ... # (kosong)
```

Tidak ada pemanggil `startPrebuffer()`, tidak ada pemanggil `takePrebuffer()`,
tidak ada yang mengonstruksi `PrebufferManager(...)`. File-nya tetap terkompilasi
karena `CMakeLists.txt` memakai `GLOB_RECURSE "playback/*.cpp"`.

**Catatan jujur:** perbaikan `PrebufferManager.cpp` (sampleRate dari
`getOutputFormat()`, bukan hardcode 48000/2ch) ada di commit `ebaa24b0b`, tapi
karena kelasnya tidak pernah dipakai, perubahan itu **tidak berefek ke audio saat
ini**. Perbaikannya benar sebagai kode, dan akan otomatis berlaku kalau
PrebufferManager nanti disambungkan. Yang salah bukan perbaikannya, melainkan
menganggap kelas itu hidup.

---

## 4. Status fix poin 1 (seek domain)

Sudah dikerjakan dan terverifikasi, commit `ebaa24b0b`:

```cpp
// PlaybackController.cpp:273-277
uint32_t seekRate = streamSampleRate();
if (seekRate == 0) {
    seekRate = 48000;      // stream belum terbuka → perilaku lama
}
clock_->seekToSeconds(seconds, seekRate);
```

Verifikasi model (`scripts/test_domain_96k.cpp`, semua assertion lulus):

```
=== TEST DOMAIN POSISI 44.1kHz -> 48kHz ===
  posisi fixed = 100s                                  OK
  posisi buggy = 108.8s (1.088x cocok log speed 1.08x) OK
```

`seekBuggy` (clock di 48000 sementara stream 44100) mereproduksi angka 108.8s
yang persis sama dengan yang dilaporkan di log — jadi model test memang menangkap
bug ini, dan versi `seekFixed` menghilangkannya.

Syntax check kedua file yang diubah: `scripts/check.sh` → `Passed: 2, Failed: 0`
(PlaybackController.cpp, PrebufferManager.cpp).

**Penting:** fix seek ini tidak memerlukan autodetect. Ia hanya butuh laju stream,
yang sudah tersedia lewat `streamSampleRate()`.

---

## 5. Yang benar-benar kurang untuk bit-perfect hi-res

Bukan deteksi perangkat. Yang kurang adalah **penyaluran laju file ke stream**:

1. **Tambah parameter laju di `EngineManager::start()`** — sekarang `void start();`,
   perlu menerima laju yang diminta dan meneruskannya ke `mEngine.start(exclusive, rate)`.

2. **Panggil `pickBestRate(fileRate)`** saat track dibuka, lalu pakai hasilnya
   sebagai laju yang diminta. Implementasinya sudah ada dan sudah benar; hanya
   belum tersambung.

3. **Buka ulang stream saat laju file berubah antar-track.** Satu stream = satu
   laju. Kalau track berikutnya beda laju, stream harus di-restart. Belum ada
   jalur restart-per-track.

4. **Ganti stub `USBDACModule.setSampleRate`** dengan implementasi nyata, atau
   hapus slider-nya supaya UI tidak menjanjikan yang tidak bisa dilakukan.

5. **Pakai `isBitPerfectFor(fileRate)`** untuk badge UI — fungsinya sudah ada,
   tinggal dipanggil. Sudah ada `useBitPerfectStatus` di sisi JS; sambungkan.

---

## 6. Ringkasan prioritas

| # | Item | Dampak | Effort |
|---|---|---|---|
| 1 | Fix domain seek | ✅ selesai (`ebaa24b0b`) | — |
| 2 | Teruskan laju file ke `EngineManager::start()` | Bit-perfect hi-res | Sedang |
| 3 | Panggil `pickBestRate()` per track | Bit-perfect hi-res | Rendah |
| 4 | Restart stream saat laju antar-track beda | Bit-perfect hi-res | Sedang-tinggi |
| 5 | Netralkan/selamatkan slider sample rate stub | Kejujuran UI | Rendah |
| 6 | Pakai `isBitPerfectFor()` di badge UI | Kejujuran UI | Rendah |
| 7 | Putuskan PrebufferManager: sambungkan atau hapus | Kebersihan | Rendah |

Urutan alami: **2 → 3 → 4** untuk benar-benar mencapai bit-perfect, lalu
**5 → 6** supaya UI jujur soal apa yang benar-benar tercapai.

---

**Status dokumen:** diverifikasi lewat pembacaan kode + audit pemanggil, 2026-10-07.
Semua klaim "ada pemanggil" di atas berasal dari grep yang definisinya dikecualikan.
