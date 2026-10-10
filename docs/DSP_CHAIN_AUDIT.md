# Audit Mode DSP: Hulu → Hilir

**Tanggal:** 2026-10-10 | **Commit:** `c8b6350aa` | **Revisi:** v3 (perbaikan diterapkan)

> **Status perbaikan (v3).** Temuan #1, #2, #3, #7 dan bug sample-rate EQ sudah
> **disambungkan** — lihat §7. Temuan #4, #5, #6 (`BrainwaveGenerator`,
> `HarmonicExciter`, `SpatialFieldProcessor`) **belum** disentuh: ketiganya stub
> yang dipanggil, dan memperbaikinya = mengimplementasi fitur baru, bukan
> menyambungkan jalur. Temuan #8, #9 menunggu keputusan.

> **Koreksi v1 → v2.** v1 menyatakan "`ImmersiveStage` 4 tahap NYATA" dan
> mengusulkan menghapus 9 kelas yatim sebagai "dead code". **Keduanya salah.**
> Rantai immersive hanya punya **1 dari 4** tahap yang nyata, dan kelas yatim
> adalah **fitur yang belum diimplementasi**, bukan sampah — koreksi dari
> operator. v2 memakai klasifikasi tiga tingkat dan tidak mengusulkan
> penghapusan.

**Metode:** pembacaan jalur pemanggilan + grep pemanggil nyata, bukan grep "ada
referensi". Aturan: `docs/BOILERPLATE_AND_STUBS.md` §6.

**Klasifikasi:**
- **NYATA** — ada jalur pemanggilan produksi *dan* perilakunya sesuai namanya
- **STUB-DIPANGGIL** — dipanggil jalur produksi, tapi perilakunya bukan yang dijanjikan nama
- **BELUM** — belum diimplementasi, nol pemanggil (fitur masa depan, bukan sampah)

---

## 1. Ringkasan eksekutif

| # | Tingkat | Temuan |
|---|---|---|
| 1 | 🔴 KRITIS | `DSPChain::applyConfig()` nol pemanggil dari luar `dsp/` — config UI tidak pernah sampai |
| 2 | 🔴 KRITIS | `AudioEngine::setEqBand()` + `setBassBoost()` bodi kosong; Kotlin tetap `resolve(true)` |
| 3 | 🔴 KRITIS | Mode DSP ≈ BitPerfect untuk seluruh sinyal di bawah 0.98 FS |
| 4 | 🔴 KRITIS | `BrainwaveGenerator` **menolkan buffer** — audio hilang total kalau `brainwaveFreq > 0` |
| 5 | 🟠 TINGGI | `HarmonicExciter` bukan exciter — ia **gain linear +6 dB** di intensitas default |
| 6 | 🟠 TINGGI | `SpatialFieldProcessor` dipanggil tapi `do nothing` |
| 7 | 🟠 TINGGI | `setDSPEnabled`/`setLimiterEnabled` → ditulis ke `mParams`, **nol pembaca** |
| 8 | 🟡 SEDANG | `HeadphoneCorrection::loadProfile()` `return true` tanpa memuat apa pun |
| 9 | 🟡 SEDANG | UI `settings.tsx:852` mengklaim "DSP & Immersive benar-benar memproses PCM" |
| 10 | ⚪ INFO | `softClip` waveshaper → sudah diperbaiki (`c8b6350aa`) |

---

## 2. Jalur hulu → hilir

### 2.1 Yang PUTUS

```
JS  equalizerStore / useEqualizer
     ↓  NativeDSPModule.setFullEqualizer(gains, sessionId)
Kotlin  NativeDSPModule.kt:86  @ReactMethod setFullEqualizer
     ↓  loop → setNativeEqualizerBand(i, gain)        ✅
JNI  NativeDSPModule.cpp:30  Java_..._setNativeEqualizerBand
     ↓  EngineManager::get().setEqBand(band, gainDb)  ✅
C++  EngineManager.cpp:760  setEqBand
     ↓  mEngine.setEqBand(band, gainDb)               ✅
C++  AudioEngine.cpp:339  setEqBand(int, float)
     ╳  { /* reserved for DSP pipeline param sync */ }   ← PUTUS
```

`setBassBoost` putus persis sama (`AudioEngine.cpp:328`).

### 2.2 Yang UTUH

```
JS setProcessingMode(n) → Kotlin → JNI:148 → EngineManager::setProcessingMode
   → AudioEngine → AudioState (atomic) → AudioCallback::updateParameters()
   → mParams.processingMode → AudioPipeline::process() switch        ✅
```

---

## 3. Temuan

### 3.1 `DSPChain::applyConfig()` — nol pemanggil 🔴

```bash
$ grep -rn "applyConfig" --include=*.cpp --include=*.h . | grep -v oboe
```
Semua hasil berada di dalam `dsp/` sendiri. **Nol pemanggil** dari `core/`,
`manager/`, `playback/`, `jni/`. `AudioPipeline` hanya memanggil tiga method
`DSPChain`: `prepare()`, `reset()`, `process()`.

Akibat: `DSPChain::mConfig` (`DSPChain.h:58`) tetap pada `DSPConfig{}` selamanya.

### 3.2 EQ & bass-boost UI = no-op 🔴

```cpp
// core/AudioEngine.cpp:328 / :339
void AudioEngine::setBassBoost(float gainDb) { /* reserved ... */ }
void AudioEngine::setEqBand(int, float)      { /* reserved ... */ }
```

Kotlin tetap melaporkan sukses:

```kotlin
// NativeDSPModule.kt:75
setNativeEqualizerBand(band, level)   // → berakhir di bodi kosong
promise.resolve(true)                 // ← SUKSES PALSU
```

**UI menerima `true`, audio tidak berubah.** Pelanggaran `BOILERPLATE_AND_STUBS.md` §2.

### 3.3 Mode DSP ≈ BitPerfect 🔴

Keempat node `DSPChain::buildGraph()` (`DSPChain.cpp:98`) dengan config default:

| Node | Nilai efektif | Perilaku |
|---|---|---|
| `EQNode` | `mBandGain[10]` = 0.0f, `mBandEnabled[10]` = false | identity |
| `StereoWidenerNode` | `mWidth = 1.0f` | identity (`left = mid + side×1.0`) |
| `GainNode` | `mGainL = mGainR = 1.0f` | identity |
| `LimiterNode` | threshold 0.98 | identity di bawah 0.98 |

Gate EQ terverifikasi:

```cpp
// EQProcessor.cpp:135
mBandEnabled[band] = std::fabs(gainDb) > 0.001f;   // 0 dB → false
// EQProcessor.cpp:100
if (mBandEnabled[b]) { l = mLeft[b].process(l); }   // → dilewati
```

**Node-nya benar.** Yang tidak ada adalah jalur yang membawa *nilai* ke node.
Implementasinya siap: `BiquadFilter::setPeakingEQ` menghitung koefisien RBJ
cookbook sungguhan, `EQProcessor::updateBand` memasangnya ke `mLeft[band]`.

### 3.4 `BrainwaveGenerator` menolkan buffer 🔴

```cpp
// dsp/immersive/BrainwaveGenerator.cpp:9
void BrainwaveGenerator::generate(float* left, float* right, int32_t numFrames, float) {
    // stub: fill with zeros
    for (int32_t i = 0; i < numFrames; ++i) {
        left[i] = 0.0f;
        right[i] = 0.0f;
    }
}
```

Dipanggil **terakhir** di `ImmersiveStage::process` (`ImmersiveStage.cpp:106`),
tanpa menjumlahkan — ia **menimpa** hasil seluruh rantai:

```cpp
if (params.brainwaveFreq > 0.0f) {
    mBrainwave.generate(left, right, numFrames, mSampleRate);   // ← nolkan
}
```

**Saat ini tidak terjangkau**: default `mBrainwaveFreq{0.0f}` (`AudioState.h:363`)
dan `setBrainwaveFreq` nol pemanggil di `src/`. Tapi begitu ada UI yang
menyentuhnya, seluruh audio menjadi senyap — bukan efek, tapi kehilangan suara.

### 3.5 `HarmonicExciter` = gain +6 dB, bukan exciter 🟠

```cpp
// dsp/immersive/HarmonicExciter.cpp:11
void HarmonicExciter::setDrive(float driveDb) {
    mDrive = driveDb;
    mCoeff = std::pow(10.0f, driveDb / 20.0f);
}
void HarmonicExciter::process(...) {
    // stub: just apply gain
    left[i] *= mCoeff;  right[i] *= mCoeff;
}
```

`ImmersiveStage.cpp:84`: `mHarmonic.setDrive(params.resonanceIntensity * 12.0f)`.
Default `mResonanceIntensity{0.5f}` (`AudioState.h:366`) → drive 6.0 dB →
`mCoeff = 1.995`.

**Mode Immersive diam-diam menaikkan level +6 dB.** Nama kelasnya menjanjikan
penambahan harmonisa; yang terjadi perkalian linear. Ini satu-satunya tahap
immersive yang *terdengar* selain Solfeggio — tapi bukan karena efeknya, karena
volumenya.

### 3.6 `SpatialFieldProcessor` dipanggil, tidak melakukan apa pun 🟠

```cpp
void SpatialFieldProcessor::process(float* left, float* right, int32_t numFrames) {
    // stub: do nothing
    (void)left; (void)right; (void)numFrames;
}
```

`setWidth`/`setDepth` menyimpan nilai yang tidak pernah dibaca.

### 3.7 Sakelar DSP & limiter tidak menggerbang apa pun 🟠

```bash
$ for f in masterGain balance stereoWidth dspEnabled limiterEnabled ...; do
    grep -rn "params\.$f" | grep -v "mParams\.$f =" | wc -l; done
masterGain:      0     ← ditulis, tidak dibaca
balance:         0     ← ditulis, tidak dibaca
dspEnabled:      0     ← ditulis, tidak dibaca
limiterEnabled:  0     ← ditulis, tidak dibaca
stereoWidth:     1     ← dibaca (ImmersiveStage)
solfeggioFreq:   1     ← dibaca
brainwaveFreq:   2     ← dibaca
resonanceIntensity: 4 ← dibaca
processingMode:  3    ← dibaca
```

Gate DSP yang sebenarnya: `DSPProcessingGate` (diagnostik global, default ON).
Gate limiter yang sebenarnya: `DSPConfig.limiterEnabled` via `LimiterNode::applyConfig`
— **yang tidak pernah dipanggil** (§3.1).

### 3.8 Stub yang mengaku jadi 🟡

```cpp
// dsp/headphone/HeadphoneCorrection.cpp:8
bool HeadphoneCorrection::loadProfile(const std::string& model) {
    (void)model;
    // stub: load some default coefficients
    mFilterLeft = {1.0f};  mFilterRight = {1.0f};
    return true;           // ← sukses tanpa memuat apa pun
}
```

`applyFIR` hanya `inout[i] *= coeffs[0]` → `×1.0` = identity. Nama `loadProfile`
menjanjikan pemuatan profil; yang terjadi pengembalian `true`.

```cpp
// dsp/immersive/BinauralRenderer.cpp:8
// stub: copy input to both channels
outLeft[i] = monoInput[i]; outRight[i] = monoInput[i];
```

```cpp
// dsp/immersive/FFTResonanceAnalyzer.cpp:19
float FFTResonanceAnalyzer::getDominantFrequency() const { return 0.0f; // stub }
```

Ketiganya mengembalikan hasil tanpa arti, bukan kegagalan berisik.

### 3.9 Klaim UI yang tidak lagi benar 🟡

```
src/app/(drawer)/settings.tsx:852
  "Aktif — mode DSP & Immersive benar-benar memproses PCM."
```

Untuk DSP: hanya limiter di atas 0.98 FS yang aktif — EQ/gain/width identity.
Untuk Immersive: Solfeggio nyata, exciter = gain, spatial = no-op.

### 3.10 Konfirmasi: tidak ada jalur Android audiofx

`android.media.audiofx.Equalizer` tidak dipakai. Satu-satunya pemakaian
`android.media.audiofx` adalah `Visualizer` (`NativeVisualizerBridge.kt:5`).
Hipotesis "EQ jalan lewat audiofx meski C++ putus" **tertutup**.

---

## 4. Klasifikasi per node

### NYATA (6)
`processingMode` switch · `DSPProcessingGate` · **`SolfeggioResonator`** (biquad RBJ
sungguhan, Q = 0.7 + intensity×7.3, wet/dry) · `BiquadFilter` · `Limiter` baru ·
`sanitizeOutput`

### STUB-DIPANGGIL (3)
| Kelas | Di mana dipanggil | Yang sebenarnya terjadi |
|---|---|---|
| `HarmonicExciter` | `ImmersiveStage.cpp:86` | gain linear +6 dB |
| `SpatialFieldProcessor` | `ImmersiveStage.cpp:93` | tidak ada |
| `BrainwaveGenerator` | `ImmersiveStage.cpp:106` | menolkan buffer |

### BELUM (9) — fitur belum diimplementasi, **bukan sampah**

| Kelas | Isi | Catatan |
|---|---|---|
| `HeadphoneCorrection` | `loadProfile` → `true` palsu | perlu kegagalan berisik |
| `BinauralRenderer` | copy mono ke L/R | HRTF belum ada |
| `FFTResonanceAnalyzer` | akumulasi buffer, `mPlan` tak dipakai | analisis belum ada |
| `ConvolverNode` + `FIRFilter` | konvolusi nyata, butuh IR | belum ada pemuat IR |
| `PartitionedConvolver` | `prepare`/`reset` saja, **tanpa `process`** | belum lengkap |
| `IRLoader` | `// TODO:` | belum ada |
| `CrossfeedProcessor` | **algoritma nyata** (blend L/R) | tinggal disambungkan |
| `StateVariableFilter` · `ToneControl` · `DCBlocker` | **implementasi nyata** | komponen siap pakai |
| `OutputStage` | gain + limiter + DC blocker | **duplikat** `GainNode`+`LimiterNode` |

**Penting:** `CrossfeedProcessor`, `StateVariableFilter`, `ToneControl`,
`DCBlocker`, `FIRFilter`, `ConvolverNode` sudah **berfungsi** — hanya belum
tersambung. Yang benar-benar belum jadi: `HeadphoneCorrection`,
`BinauralRenderer`, `FFTResonanceAnalyzer`, `PartitionedConvolver`, `IRLoader`.

`OutputStage` berbeda: ia duplikat konsep yang sudah dimiliki `DSPChain`. Ini
bentuk §4.3 ("dua struktur paralel untuk hal yang sama") — bukan fitur masa
depan, tapi risiko divergensi.

---

## 5. Langkah perbaikan

### Prioritas 1 — Kejujuran (wajib, terlepas dari opsi lain)

1. `AudioEngine::setEqBand`/`setBassBoost` → jangan resolve sukses. Sesuai §2:
   kegagalan berisik.
2. `HeadphoneCorrection::loadProfile` → `return false` sampai profil nyata ada.
3. `BrainwaveGenerator::generate` → **jangan menolkan buffer**; minimal
   `return` tanpa menyentuh audio. Ini satu-satunya temuan yang bisa
   menghilangkan suara.
4. `settings.tsx:852` → perbaiki klaim agar sesuai kenyataan.

### Prioritas 2 — Sambungkan jalur DSP (butuh keputusan)

1. `AudioEngine` menyimpan `DSPConfig`, meneruskan ke `AudioPipeline` →
   `DSPChain::applyConfig`.
2. `setEqBand`/`setBassBoost` mengisi `DSPConfig::eqGain[]`/`bassBoost`.
3. `updateParameters()` menyertakan `eqGain[]` + `bassBoostGain` ke `mParams`;
   `processDSP` meneruskan `mParams` (sekarang tak bernama:
   `const DSPParameters&) noexcept`).

**Risiko realtime:** `applyConfig` → `updateBand` → `setPeakingEQ` menjalankan
`powf`/`cosf`/`sinf` dan menulis `coeffs` (struct non-atomik) yang dibaca
`process()` di audio thread. Perlu jalur aman: pre-compute di luar audio thread
lalu tukar pointer/indeks, atau snapshot atomic. **Tidak boleh langsung dari
thread UI.**

### Prioritas 3 — Rapikan immersive
`HarmonicExciter` ganti nama atau implementasi sungguhan; `SpatialFieldProcessor`
isi atau lepas dari rantai.

### Prioritas 4 — Bersihkan duplikasi
`OutputStage` — putuskan mana yang berlaku (`DSPChain` sudah punya keduanya).

---

## 6. Catatan proses

Pola ini konsisten dengan #9 `TROUBLESHOOTING.md` ("parameter config yang tidak
dibaca tidak ada gunanya") — kasus kelima setelah `chunkFrames`,
`kLimiterThreshold`, `setTargetFormat`, `setDurationFrames`.

**Pelajaran v1 → v2:** "nol pemanggil" tidak sama dengan "sampah". Yang
diperlukan bukan penghapusan, tapi **pelacakan status per node**. Kelas yang
belum diimplementasi harus dibedakan dari kelas yang sudah jalan tapi belum
tersambung, dan keduanya dari yang mengaku jadi.

Audit ini **tidak** mengubah kode. Perbaikan dikerjakan terpisah — lihat §7.

---

## 7. Perbaikan yang diterapkan (v3)

**Keputusan operator:** opsi **A** — koefisien dihitung di audio thread, tapi
hanya saat parameter berubah.

### 7.1 Yang disambungkan

| # | File | Perubahan |
|---|---|---|
| 1 | `core/AudioState.h` | tambah `mBassBoost` + `setBassBoost()`/`bassBoost()` (`mEqGain[10]` sudah ada sejak awal, nol pemakai) |
| 2 | `core/AudioEngine.cpp` | `setEqBand()` + `setBassBoost()` — bodi kosong → tulis ke `mState` |
| 3 | `core/AudioCallback.cpp` | `updateParameters()` salin 10 band + `bassBoostGain` ke `mParams` |
| 4 | `dsp/tone/EQNode.cpp` | `prepare()` → `mEQ.prepare(sampleRate)` (sebelumnya bodi kosong) |
| 5 | `dsp/EQProcessor.cpp` | guard perubahan di `setBandGain()` + `setBassBoost()` sebelum `updateBand`/`updateBass` |
| 6 | `core/AudioPipeline.{h,cpp}` | `applyDSPConfig()` — bangun `DSPConfig` dari `DSPParameters`, kirim ke `mDSP.applyConfig()` hanya saat berubah; dipanggil di `processDSP` **dan** `processImmersive` |

**Gerbang.** `mDspConfig.enabled` sengaja selalu `true`, **bukan**
`params.dspEnabled`. `dspEnabled` tidak punya pemanggil di JS dan defaultnya
`false`; kalau ia jadi gerbang, `DSPChain::process()` langsung `return` dan mode
DSP tetap tidak berefek — persis bug yang sedang diperbaiki. Gerbang yang sah
adalah mode itu sendiri: `applyDSPConfig()` hanya dipanggil dari cabang
DSP/Immersive.

**Realtime.** `applyConfig()` → `updateBand()` → `setPeakingEQ()` memakai
`powf`/`cosf`/`sinf`. Guard di `EQProcessor` membuat trig hanya berjalan saat
nilai benar-benar berubah. Nol alokasi, nol lock (`BiquadFilter` = 5 float
koefisien + 2 state, POD).

**Jalur BitPerfect tidak tersentuh** — `applyConfig()` tidak dipanggil di
`processBitPerfect()`.

### 7.2 Bug yang ikut tertutup

**EQ memakai sample rate salah.** `EQNode::prepare()` kosong, jadi
`EQProcessor::mSampleRate` tetap default `48000`. Untuk file 44.1 kHz, koefisien
biquad dihitung dengan laju 48 kHz → tiap band meleset ~8.8% (band 1 kHz jatuh
di ~919 Hz). Laten selama EQ belum tersambung; langsung terdengar begitu
dinyalakan.

### 7.3 Verifikasi

`scripts/test_dsp_wiring.cpp` — standalone, mengompilasi sumber DSP asli
(`DSPChain`, `DSPGraph`, 4 node, `EQProcessor`, `BiquadFilter`). **9/9 lulus:**

| # | Yang diuji | Hasil |
|---|---|---|
| 1 | config flat = identity | 0.0000 dB |
| 2 | EQ +6 dB band 5 (1 kHz) | +5.99 dB di 1 kHz, +0.00 dB di 16 kHz |
| 3 | bass boost +9 dB | +7.95 dB di 60 Hz, +0.00 dB di 5 kHz |
| 4 | laju salah (rancang 48000, stream 44100) | +5.99 dB vs +5.66 dB — bug terukur |
| 5 | master gain 0.5 / width 0 | −6.02 dB / melebur mono |
| 6 | limiter on/off di atas ambang | −2.48 dB vs +0.00 dB |

Plus: `tsc --noEmit` exit 0, 139 Jest lulus, `scripts/check.sh` pada 5 file C++
yang diubah — semua ✅.

### 7.4 Yang BELUM diperbaiki (sengaja)

- **#4 `BrainwaveGenerator` menolkan buffer** — masih ranjau: `brainwaveFreq > 0`
  akan menghapus suara. Tidak terjangkau sekarang (`setBrainwaveFreq` nol
  pemanggil di `src/`).
- **#5 `HarmonicExciter` = gain +6 dB** di intensitas default. Mode Immersive
  akan menaikkan level, bukan menambah harmonisa.
- **#6 `SpatialFieldProcessor`** no-op.
- **#8 `HeadphoneCorrection::loadProfile()` `return true`** — menunggu keputusan.
- **#9 klaim UI `settings.tsx:852`** — menunggu keputusan.

Memperbaiki #4/#5/#6 berarti **mengimplementasi fitur**, bukan menyambungkan
jalur. Itu di luar lingkup "hidupkan fitur yang sudah ada".
