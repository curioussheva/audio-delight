# Audit Mode DSP: Hulu → Hilir

**Tanggal:** 2026-10-10 | **Commit:** `c8b6350aa` | **Metode:** pembacaan jalur pemanggilan + grep pemanggil nyata (bukan grep "ada referensi")

Aturan yang dipakai: `docs/BOILERPLATE_AND_STUBS.md` §6 — *"bukti sah cuma ada jalur
pemanggilan dari jalur produksi"*. Setiap klaim di bawah disertai pemanggil.

Klasifikasi: **NYATA** (ada jalur pemanggilan produksi) / **PUTUS** (jalur ada tapi
terpotong di tengah) / **YATIM** (nol pemanggil).

---

## 1. Ringkasan eksekutif

| Tingkat | Temuan | Dampak |
|---|---|---|
| 🔴 KRITIS | `DSPChain::applyConfig()` nol pemanggil dari luar `dsp/` | Konfigurasi DSP dari UI **tidak pernah sampai** ke rantai |
| 🔴 KRITIS | `AudioEngine::setEqBand()` + `setBassBoost()` bodi kosong | Slider EQ & bass-boost UI adalah **no-op total** |
| 🔴 KRITIS | Mode DSP menghasilkan output **identik** dengan BitPerfect | Tiga mode secara terdengar = dua mode |
| 🟠 TINGGI | `setDSPEnabled(false)` tidak berefek | Sakelar DSP tidak menggerbang apa pun |
| 🟠 TINGGI | `setLimiterEnabled(false)` tidak berefek | Sakelar limiter tidak menggerbang apa pun |
| 🟡 SEDANG | 4 field `DSPParameters` ditulis, nol pembaca | Parameter diset tapi dibuang |
| 🟡 SEDANG | 8 kelas DSP yatim (0 pemanggil) | "Tampak tersedia padahal tidak ada" |
| ⚪ INFO | `softClip` waveshaper → sudah diperbaiki (`c8b6350aa`) | Sebelumnya distorsi di seluruh rentang |

---

## 2. Jalur hulu → hilir (yang ada)

```
JS  equalizerStore / useEqualizer / engine.ts
     ↓  NativeDSPModule.setFullEqualizer(gains, sessionId)
Kotlin  NativeDSPModule.kt:86  @ReactMethod setFullEqualizer
     ↓  loop → setNativeEqualizerBand(i, gain)        ✅ NYATA
JNI  NativeDSPModule.cpp:30  Java_..._setNativeEqualizerBand
     ↓  EngineManager::get().setEqBand(band, gainDb)  ✅ NYATA
C++  EngineManager.cpp:760  setEqBand
     ↓  mEngine.setEqBand(band, gainDb)               ✅ NYATA
C++  AudioEngine.cpp:339  setEqBand(int, float)
     ╳  { /* reserved for DSP pipeline param sync */ }  🔴 PUTUS DI SINI
```

Jalur `setBassBoost` **putus persis di tempat yang sama**: `AudioEngine.cpp:328`.

Jalur yang benar-benar utuh hanya jalur **mode** dan **immersive**:

```
JS setProcessingMode(n) → Kotlin → JNI:148 → EngineManager::setProcessingMode
   → AudioEngine::setProcessingMode → AudioState.setProcessingMode(atomic)
   → AudioCallback::updateParameters() → mParams.processingMode
   → AudioPipeline::process() switch                        ✅ NYATA
```

`processingMode`, `solfeggioFreq`, `brainwaveFreq`, `resonanceIntensity`,
`stereoWidth` — kelimanya punya pembaca. Sisanya tidak.

---

## 3. Bukti per temuan

### 3.1 `DSPChain::applyConfig()` — nol pemanggil 🔴

```bash
$ grep -rn "applyConfig" --include=*.cpp --include=*.h . | grep -v oboe
./dsp/DSPChain.h:32        (deklarasi)
./dsp/DSPChain.cpp:58      (definisi → mGraph.applyConfig)
./dsp/graph/DSPNode.h:31   (virtual kosong)
./dsp/graph/DSPGraph.h:26  (deklarasi)
./dsp/graph/DSPGraph.cpp:56 (definisi → loop node->applyConfig)
./dsp/dynamics/LimiterNode.{h,cpp}
./dsp/spatial/StereoWidenerNode.{h,cpp}
./dsp/tone/EQNode.{h,cpp}
./dsp/tone/GainNode.{h,cpp}
```

**Nol pemanggil dari `core/`, `manager/`, `playback/`, `jni/`.** Semua referensi
berputar di dalam `dsp/` sendiri — pola "lingkaran tertutup" yang sama dengan
kasus `modes/` di `BOILERPLATE_AND_STUBS.md` §4.3.

`AudioPipeline` hanya memanggil tiga method `DSPChain`:

```bash
$ grep -rn "mDSP\." core/   # → prepare(), reset(), process()
```

Akibatnya `DSPChain::mConfig` (`DSPChain.h:58`) tetap pada konstruktor default
`DSPConfig{}`:

| Field `DSPConfig` | Default | Sumber nilai sebenarnya |
|---|---|---|
| `enabled` | `true` | tak pernah diubah |
| `limiterEnabled` | `true` | tak pernah diubah |
| `masterGain` | `1.0f` | `AudioState.masterGain()` — tapi hanya dipakai Immersive |
| `balance` | `0.0f` | tak pernah dibaca |
| `stereoWidth` | `1.0f` | `AudioState.stereoWidth()` — dipakai Immersive |
| `eqGain[10]` | semua `0.0f` | **tidak ada pembaca di jalur hulu** |
| `bassBoost` | `0.0f` | **tidak ada pembaca di jalur hulu** |

### 3.2 `AudioEngine::setEqBand` / `setBassBoost` — bodi kosong 🔴

```cpp
// core/AudioEngine.cpp:328
void AudioEngine::setBassBoost(float gainDb) {
    // reserved for DSP pipeline param sync     ← tidak menyentuh apa pun
}

// core/AudioEngine.cpp:339
void AudioEngine::setEqBand(int, float) {
    // reserved for DSP pipeline param sync     ← tidak menyentuh apa pun
}
```

Ini **stub yang mengembalikan sukses tanpa efek** — tepat yang dilarang
`BOILERPLATE_AND_STUBS.md` §2. Bedanya dengan kasus `USBDACModule`: di sini
fungsi `void`, jadi tidak ada `promise.resolve(true)`. Tapi JNI-nya juga `void`,
dan Kotlin-nya `promise.resolve(true)` setelah memanggilnya:

```kotlin
// NativeDSPModule.kt:75
fun setEqualizer(band: Int, level: Float, sessionId: Int, promise: Promise) {
    if (!engineAvailable) { promise.resolve(false); return }
    try {
        setNativeEqualizerBand(band, level)   // → berakhir di bodi kosong
        promise.resolve(true)                 // ← SUKSES PALSU
    } catch (e: Exception) { promise.reject("DSP_ERROR", e.message) }
}
```

**UI menerima `true`, audio tidak berubah.** Inilah "utang kejujuran" yang
disebut §1 dokumen itu.

### 3.3 Mode DSP = BitPerfect secara terdengar 🔴

Rantai `DSPChain::buildGraph()` (`DSPChain.cpp:98`) memasang 4 node berurutan.
Keempatnya, dengan konfigurasi default yang benar-benar berlaku:

| Node | Parameter efektif | Perilaku |
|---|---|---|
| `EQNode` | `mBandGain[10]` semua `0.0f`, `mBandEnabled[10]` semua `false`, `mBassEnabled=false` | **identity** — `EQProcessor::process` hanya melewati `left[i]=l` |
| `StereoWidenerNode` | `mWidth = 1.0f` (`StereoWidenerNode.h:32`) | **identity** — `StereoWidener::process` width 1.0 = "original" (lihat tabel komentar di `StereoWidener.h`) |
| `GainNode` | `mGainL = mGainR = 1.0f` (`GainNode.h`) | **identity** |
| `LimiterNode` | threshold `0.98`, identity di bawahnya | **identity** untuk sinyal normal |

Verifikasi gate EQ:

```cpp
// EQProcessor.cpp:135
mBandEnabled[band] = std::fabs(gainDb) > 0.001f;   // 0 dB → false
// EQProcessor.cpp:100
if (mBandEnabled[b]) { l = mLeft[b].process(l); }   // → dilewati
```

**Kesimpulan:** memilih mode DSP memberi output PCM yang identik dengan mode
BitPerfect untuk seluruh sinyal di bawah 0.98 full-scale. Tiga mode secara
terdengar = **dua** mode (BitPerfect ≡ DSP), plus Immersive.

Ini bukan bug implementasi node — node-nya benar. Yang tidak ada adalah jalur
yang membawa *nilai* ke node.

### 3.4 Sakelar `setDSPEnabled` / `setLimiterEnabled` tidak menggerbang apa pun 🟠

Nilai sampai ke `AudioState` (NYATA) dan disalin ke `mParams`:

```cpp
// AudioCallback.cpp:159
mParams.dspEnabled     = mState.isDSPEnabled();
mParams.limiterEnabled = mState.isLimiterEnabled();
```

Tapi `mParams.dspEnabled` dan `mParams.limiterEnabled` **nol pembaca**:

```bash
$ for f in masterGain balance stereoWidth dspEnabled limiterEnabled ...; do
    grep -rn "params\.$f" | grep -v "mParams\.$f =" | wc -l; done
masterGain:    0     ← ditulis, tidak dibaca
balance:       0     ← ditulis, tidak dibaca
stereoWidth:   1     ← dibaca (ImmersiveStage::process)
dspEnabled:    0     ← ditulis, tidak dibaca
limiterEnabled:0     ← ditulis, tidak dibaca
solfeggioFreq: 1     ← dibaca (ImmersiveStage)
brainwaveFreq: 2     ← dibaca (ImmersiveStage)
resonanceIntensity: 4 ← dibaca
processingMode: 3    ← dibaca (AudioPipeline switch)
```

Gate DSP yang sebenarnya adalah `DSPProcessingGate` (sakelar diagnostik global,
default ON) — bukan `dspEnabled` per-sesi. Gate limiter yang sebenarnya adalah
`DSPConfig.limiterEnabled` (default `true`) via `LimiterNode::applyConfig` —
yang **tidak pernah dipanggil** (§3.1). Jadi menekan tombol limiter di UI tidak
mengubah perilaku limiter.

### 3.5 Kelas yatim (0 pemanggil) 🟡

Diperiksa dengan pola AGENTS.md (grep nama kelas, buang file yang namanya sama):

| Kelas | Rujukan lain |
|---|---|
| `OutputStage` | **0** |
| `ConvolverNode` | **0** |
| `HeadphoneCorrection` | **0** |
| `CrossfeedProcessor` | **0** |
| `FFTResonanceAnalyzer` | **0** |
| `PartitionedConvolver` | **0** |
| `StateVariableFilter` | **0** |
| `ToneControl` | **0** |
| `BinauralRenderer` | 1 (hanya `ImmersiveStage.h` — dan `mBinaural` tak dipakai di `process()`) |

`OutputStage` layak diperhatikan: ia punya `setGain()`, `setBalance()`,
`setLimiterEnabled()` sendiri — **duplikat limbah** dari `GainNode` +
`LimiterNode`. Ini bentuk §4.3 ("dua struktur paralel untuk hal yang sama")
yang belum dibersihkan, dan berbahaya persis karena namanya menjanjikan
fungsionalitas yang sudah dimiliki jalur lain.

### 3.6 Konfirmasi: tidak ada jalur AudioEffect Android

`android.media.audiofx.Equalizer` tidak dipakai — satu-satunya pemakaian
`android.media.audiofx` adalah `Visualizer` di `NativeVisualizerBridge.kt:5`.
Jadi hipotesis "EQ mungkin jalan lewat audiofx meski C++ tidak" **tertutup**:
tidak ada jalur FX per-sesi. EQ benar-benar hanya lewat `DSPChain`.

---

## 4. Peta status

### NYATA (10)
`processingMode` · `AudioPipeline::process` switch 3 cabang · `DSPProcessingGate` ·
`ImmersiveStage` 4 tahap (Solfeggio → Harmonic → Spatial → Brainwave) ·
solfeggioFreq · brainwaveFreq · resonanceIntensity · stereoWidth (Immersive) ·
`EQNode`/`GainNode`/`StereoWidenerNode`/`LimiterNode` sebagai implementasi ·
`Limiter` baru (`c8b6350aa`) · `sanitizeOutput`

### PUTUS (5)
1. `AudioEngine::setEqBand` → `DSPChain::applyConfig` (bodi kosong)
2. `AudioEngine::setBassBoost` → `DSPChain::applyConfig` (bodi kosong)
3. `mParams.masterGain` → tidak ada pembaca (Immersive pakai `AudioState` langsung)
4. `mParams.balance` → tidak ada pembaca
5. `mParams.dspEnabled` / `mParams.limiterEnabled` → tidak ada pembaca

### YATIM (9)
`OutputStage` · `ConvolverNode` · `HeadphoneCorrection` · `CrossfeedProcessor` ·
`FFTResonanceAnalyzer` · `PartitionedConvolver` · `StateVariableFilter` ·
`ToneControl` · `BinauralRenderer`

---

## 5. Langkah perbaikan (butuh keputusan)

### Opsi A — Sambungkan jalur yang putus (mode DSP benar-benar bekerja)

1. `AudioEngine` menyimpan `DSPConfig` dan meneruskan ke `AudioPipeline` →
   `DSPChain::applyConfig`.
2. `setEqBand`/`setBassBoost` mengisi `DSPConfig::eqGain[]`/`bassBoost`, lalu
   panggil `applyConfig` (deferred ke audio thread atau lewat snapshot atomic —
   `applyConfig` melakukan `mEQ.setBandGain` yang menghitung koefisien biquad;
   **tidak boleh di thread UI**).
3. `updateParameters()` menyertakan `eqGain[]` + `bassBoostGain` ke `mParams`,
   dan `processDSP` meneruskan `mParams` ke `mDSP` (sekarang parameter `params`
   sengaja tak bernama: `const DSPParameters&) noexcept`).

**Risiko:** `applyConfig` → `updateBand()` menghitung koefisien + alokasi
potensial. Perlu jalur aman realtime (pre-computed, double-buffer, atau
pindah ke `prepare()`).

### Opsi B — Nyatakan apa adanya (jujur, tanpa fitur baru)

Per `BOILERPLATE_AND_STUBS.md` §2, ganti bodi kosong dengan kegagalan berisik:

```cpp
void AudioEngine::setEqBand(int, float) {
    // BELUM TERSAMBUNG. Jangan resolve(true) di Kotlin.
}
```

…plus `promise.reject("NOT_IMPLEMENTED", ...)` di Kotlin, dan tandai di
`FEATURES.md` bahwa EQ C++ belum aktif. UI berhenti berbohong; tidak ada fitur
baru yang dijanjikan.

### Opsi C — Bersihkan yang yatim

Hapus 9 kelas yatim (termasuk `OutputStage` yang duplikat). Satu unit utuh,
seperti pola `AudioRouteManager` + izin USB.

**Catatan:** A dan B saling eksklusif untuk EQ. C bisa jalan sendiri.

---

## 6. Catatan proses

Temuan ini konsisten dengan pola #9 di `TROUBLESHOOTING.md`
(*"parameter config yang tidak dibaca tidak ada gunanya"*) — kasus kelima di
proyek ini setelah `chunkFrames`, `kLimiterThreshold`, `setTargetFormat`, dan
`setDurationFrames`. Semuanya muncul dengan bentuk sama: **struktur lengkap,
terkompilasi, terdokumentasi, tanpa jalur pemanggilan.**

Audit ini belum mengubah kode apa pun. Menunggu keputusan Opsi A/B/C.
