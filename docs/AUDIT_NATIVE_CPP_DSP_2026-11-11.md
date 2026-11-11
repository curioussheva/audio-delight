# Audit Native C++ — DSP (2026-11-11)

- **Repo:** `curioussheva/audio-delight`, branch `fix/ffmpeg-disable-doc`
- **Scope:** `android/app/src/main/cpp/dsp/` — **62 file** (16 top-level + convolution/ 12 + immersive/ 12 + filters/ 5 + headphone/ 6 + spatial/ 2 + dynamics/ 2 + tone/ 4 + graph/ 3) + pemanggilnya (`core/AudioPipeline`, `core/AudioCallback`, `core/AudioEngine`, `core/AudioState`, `core/ImmersiveStage`, `core/DSPProcessingGate`, `jni/NativeDSPModule.cpp`, Kotlin `NativeDSPModule.kt`, TS `src/specs/NativeDSPModule.ts`)
- **Metode:** 4 track paralel read-only (laporan di `~/workspace/audit-dsp-2026-11-11/TRACK_A_CORE.md`, `TRACK_B_IMMERSIVE.md`, `TRACK_C_CONVOLUTION.md`, `TRACK_D_NODES.md`); setiap klaim kunci diverifikasi ulang asisten dari kode + 6 harness standalone atas file produksi asli (g++ 13, `-std=c++17/20 -O2`, tanpa mock)
- **Status:** AUDIT SELESAI, perbaikan BELUM dikerjakan (catat dulu)

## Ringkasan eksekutif

**15 MAJOR, 45 MINOR, 16 DUGAAN, dead code ~28 dari 62 file (~45%).** Tiga MAJOR **hidup di produksi** — dua di antaranya (DSP-M1, DSP-M2) lahir dari penyambungan rantai DSP 2026-10-10 yang memperbaiki M6, dan satu (DSP-M3) ada di mode Immersive sejak awal:

| # | Temuan | Status |
|---|---|---|
| DSP-M1 | Setiap reopen stream diam-diam menghapus seluruh setting DSP (EQ, bass, gain, balance, width, koreksi headphone) sampai user mengubah sesuatu | **HIDUP** |
| DSP-M2 | Limiter jalan 2× di mode DSP (node di graph + `Limiter::apply` di callback) | **HIDUP** |
| DSP-M3 | `HarmonicExciter` menyuntik DC offset yang bergantung level, di parameter default mode Immersive | **HIDUP** |
| DSP-M4 | Stage brainwave tidak pernah jalan (gate `brainwaveFreq > 0`, default 0.0) | HIDUP (dengan tidak jalan) |
| DSP-M5 | Parameter immersive tidak terjangkau user (0 pemanggil TS untuk ketiga setter) | HIDUP (dengan beku) |
| DSP-M6 | `SolfeggioResonator` tidak stabil di atas Nyquist → inf/NaN | Laten |
| DSP-M7 | `setHighShelf` → koefisien NaN (dikonfirmasi 3 track independen + 3 harness) | Laten, jalur live via preset headphone |
| DSP-M8 | `HighPassFilter`/`LowPassFilter::setCutoff` memanggil method `BiquadFilter` yang tidak ada — error kompilasi laten | Laten |
| DSP-M9 | Rantai konvolusi mati end-to-end (tidak ada node, `IRLoader` stub, `FFTConvolver`/`PartitionedConvolver` tanpa `process`) | Laten |
| DSP-M10 | `StateVariableFilter` tanpa clamp → osilasi tak teredam / blow-up / NaN | Laten |
| DSP-M11 | `FIRFilter::setKernel` tidak thread-safe + alokasi tak terbatas di audio thread | Laten |
| DSP-M12 | `CrossfeedProcessor` bukan crossfeed — plain blend; `strength=1` → mono | Laten, 0 caller |
| DSP-M13 | `OutputStage` mati total (0 instansiasi); DC blocker tidak pernah jalan di jalur hidup | Struktural |
| DSP-M14 | `sanitizeInline()` mati; penjaga bit-perfect diduplikasi sebagai `AudioCallback::sanitizeOutput` | Struktural |
| DSP-M15 | Dua stub immersive berbohong (`BinauralRenderer` copy-mono, `FFTResonanceAnalyzer::getDominantFrequency()` selalu 0.0) | Struktural |

**Peta hidup/mati dsp (verifikasi grep + harness):**

| Komponen | Status |
|---|---|
| `DSPChain` → `DSPGraph` → 5 node (HeadphoneCorrection, EQ, StereoWidener, Gain, Limiter) | **HIDUP** di mode DSP; gate `DSPProcessingGate` default ON sejak 2026-10-07 |
| `EQProcessor`/`BiquadFilter`/`BiquadCascade`/`PresetParser` (parse + konversi) | **HIDUP** — EQ 10-band terverifikasi ujung-ke-ujung (harness: 16 kHz +12 dB → 3,984 di 16 kHz, 1,004 di 1 kHz) |
| `SolfeggioResonator`, `HarmonicExciter`, `SpatialFieldProcessor` (depth) | **HIDUP** di mode Immersive, dengan default beku |
| `BrainwaveGenerator` | HIDUP tapi tidak pernah jalan (gate tidak pernah terbuka) |
| `SpatialFieldProcessor` (width) | HIDUP separuh — cabang mid/side tidak pernah dieksekusi (width beku 1.0) |
| `BinauralRenderer`, `FFTResonanceAnalyzer`, `CrossfeedProcessor`, `HeadphoneCorrection` (kelas lama) | **MATI + stub** |
| Seluruh `convolution/` (kecuali `createHanningWindow`, dipakai `FFTProcessor`) | **MATI** |
| Seluruh `filters/` (`HighPassFilter`, `LowPassFilter`, `StateVariableFilter`, `ToneControl`) | **MATI** (+ 2 di antaranya tidak bisa dikompilasi) |
| `OutputStage`, `DCBlocker`, `GainProcessor` instance-API, `PresetParser::applyPreset`, `DSPConfig::reset()`, `BiquadCascade::overflowed()`/`setSampleRate()`, `Limiter::softClip()`, `DSPController.kt` | **MATI** |

**Dua generasi, keduanya hidup:** Gen-1 (`EQProcessor`, `GainProcessor`, `Limiter`, `StereoWidener`) dibungkus Gen-2 node (`EQNode`, `GainNode`, `LimiterNode`, `StereoWidenerNode`) — node adalah adapter tipis, bukan pengganti. Satu-satunya pemakaian Gen-1 langsung di luar node adalah `Limiter::apply` dari `AudioCallback` (→ DSP-M2).

**Urutan 5 node di `DSPChain::buildGraph`** (`dsp/DSPChain.cpp:99-158`): HeadphoneCorrection → EQ → StereoWidener → Gain → Limiter. `DSPGraph` bukan graph bercabang: array ≤32 node, proses sekuensial, skip node disabled/null (`dsp/graph/DSPGraph.cpp:102-111`).

## §Koreksi atas klaim lama

1. **M6 (audit manager+core) — "AudioModeManager mati, dspEnabled tak pernah true" — TIDAK BERLAKU LAGI dalam bentuk lamanya.** Dari sisi dsp, rantai **HIDUP di mode DSP**: `AudioPipeline::processDSP` memanggil `applyDSPConfig(params)` lalu `mDSP.process()` (`core/AudioPipeline.cpp:117-133`); `AudioCallback::updateParameters()` menyalin EQ 10-band + bass boost + preset headphone dari `AudioState` tiap buffer (`core/AudioCallback.cpp:228-266`); setter `AudioEngine::setEqBand`/`setBassBoost` yang dulu bodi kosong kini menyimpan ke `AudioState`. Flag `dspEnabled` **sengaja** tidak dipakai sebagai gerbang — gerbang yang sah adalah `ProcessingMode` itu sendiri (komentar `core/AudioPipeline.cpp:228-236` mendokumentasikan keputusan ini eksplisit). Yang tersisa dari M6 hanyalah penamaan yang menyesatkan (`DSPParameters.dspEnabled`, `AudioState::isDSPEnabled()` masih ada dan ditulis ke metrik, tapi tidak menggerbang apa pun) dan dua gerbang berbeda di dua jalur (`DSPProcessingGate` di jalur utama vs `mState.isDSPEnabled()` di jalur fallback — lihat dsp-m32). Perbaikan 2026-10-10 yang menyambungkan jalur ini terverifikasi dari sisi dsp.
2. **M7 (audit manager+core) — "immersive timpang, brainwave 0 Hz" — TERKONFIRMASI dan DIPERHALUS.** Benar: brainwave 0.0 Hz → stage tidak pernah jalan (DSP-M4); parameter tidak terjangkau user (DSP-M5). Perhalusan: **TIDAK semua parameter immersive mati** — solfeggio (528 Hz), harmonic (drive dari intensitas), dan spatial-depth JALAN dengan nilai default; yang mati adalah brainwave (freq 0) dan spatial-width (stereoWidth beku 1.0). Mode Immersive adalah **satu preset beku dengan 1 dari 4 tahap mati**, bukan mode mati total.
3. **Track 2 audit penuh — "mode immersive genuinely wired end-to-end" — PERLU KOREKSI.** Yang tersambung adalah *mode switch*-nya (mode → `processImmersive` → 4 tahap). Yang TIDAK tersambung: permukaan parameternya (0 pemanggil TS untuk ketiga setter immersive) dan 2 dari 6 processor (stub). Koreksi tertanggal ditambahkan ke `docs/AUDIT_2026-11-10.md` di bagian Track 2.
4. **Pola stub terkompilasi berulang.** `BinauralRenderer`, `FFTResonanceAnalyzer`, `CrossfeedProcessor`, `HeadphoneCorrection` lama, `IRLoader`, `FFTConvolver`/`PartitionedConvolver` adalah `SincResampler` (R-M5) versi dsp — kelas lengkap yang menjanjikan fungsi yang tidak ada. `AGENTS.md` sudah memperingatkan pola ini sejak 2026-10-03; pola yang sama sudah dinilai MAJOR di decoder (D-M5: `DecoderFactory`+`PCMDecoder` mati total).

---

## MAJOR

### DSP-M1 — Reopen stream menghapus seluruh setting DSP sampai user mengubah sesuatu (HIDUP)

**Rantai bukti (semua dari kode):**

1. `AudioEngine::start()` memanggil `mPipeline.prepare(actualRate, framesPerBurst)` (`core/AudioEngine.cpp:109`) — di SETIAP pembukaan stream, termasuk setiap reopen.
2. `EngineManager::reopenStreamPreservingPlayback()` memanggil `mEngine.stop()` lalu `mEngine.start()` — jadi mode toggle, cabut/colok device, dan ganti laju SEMUA melewati langkah 1.
3. `AudioPipeline::prepare()` → `mDSP.prepare()` (`core/AudioPipeline.cpp:28-31`) → `DSPChain::prepare()` → **`buildGraph()`** (`dsp/DSPChain.cpp:32`) — membuat LIMA node baru (`HeadphoneCorrectionNode`, `EQNode`, `StereoWidenerNode`, `GainNode`, `LimiterNode`) dengan state default. `prepare()` TIDAK memanggil `applyConfig(mConfig)` setelah membangun ulang graph.
4. `AudioPipeline::applyDSPConfig()` punya guard dedup (`core/AudioPipeline.cpp:238-241`):
   ```cpp
   if (mConfigApplied && dspConfigEquals(mDspConfig, mAppliedConfig)) {
       return;
   }
   ```
   dan `mConfigApplied` **tidak pernah di-reset di mana pun** — satu-satunya assignment adalah `mConfigApplied = true` (`:245`); `prepare()` maupun `reset()` tidak menyentuhnya (grep: 3 kemunculan total — deklarasi `AudioPipeline.h:94` + guard + set-true).
5. Akibatnya setelah reopen, node-node baru berjalan dengan default: EQ semua band 0 dB, bass 0 (EQ user hilang); gain/balance 1.0/1.0 (hilang); width 1.0 (hilang); koreksi headphone `prepare()` memanggil `setEnabled(false)` (`dsp/headphone/HeadphoneCorrectionNode.cpp:29` — hilang). Limiter selamat karena default `mEnabled{true}` (`dsp/graph/DSPNode.h`) — satu-satunya yang lolos karena kebetulan.
6. Config hanya dikirim ulang kalau user MENGUBAH sesuatu (`dspConfigEquals` false → `applyConfig` jalan). Sampai saat itu, mode DSP berjalan "flat" walau UI menampilkan EQ aktif.

**Dampak:** skenario nyata dari logcat #9 (toggle mode 07:20:22, cabut headset 07:23:39, colok lagi 07:23:52) — kalau user punya EQ/koreksi aktif, ketiganya diam-diam dimatikan. UI dan suara berbohong satu sama lain; user mengira EQ jalan. `DSPChain::mConfig` sendiri masih memegang config lama (member tidak di-rebuild) — yang hilang hanya penerapannya ke node. **Perbaikan yang benar:** reset `mConfigApplied = false` di `AudioPipeline::prepare()`, atau panggil `mDSP.applyConfig(mConfig)` di akhir `DSPChain::prepare()`. **Catatan:** `reset()` (jalur stop) TIDAK memicu ini — `reset()` hanya membersihkan state node, config node tetap. Yang berbahaya hanya `prepare()` (= rebuild graph).

**Verifikasi device (dugaan DSg-1):** set EQ +6 dB (atau pasang koreksi headphone), toggle mode DSP→BitPerfect→DSP (atau cabut/colok headset), dengarkan — EQ/koreksi hilang sampai slider digeser sedikit. Atau: logcat cari `applyConfig` — setelah reopen tidak ada pemanggilan ulang sampai ada perubahan setting.

### DSP-M2 — Limiter diterapkan DUA KALI per sample di mode DSP (HIDUP)

**Bukti kode:**
- Jalur 1 (node): `DSPChain::buildGraph()` menambahkan `LimiterNode` (`dsp/DSPChain.cpp:158`); `LimiterNode::process()` memanggil `Limiter::process()` (`dsp/dynamics/LimiterNode.cpp:22-31`); node aktif bila `config.limiterEnabled` (default true).
- Jalur 2 (callback): `AudioCallback::applyPipeline()` — setelah `mPipeline.process()`, loop interleave menerapkan `Limiter::apply()` untuk SETIAP sample bila `shaped` (`core/AudioCallback.cpp:318-329`):
  ```cpp
  const bool shaped = (mParams.processingMode != ProcessingMode::BitPerfect);
  // ...
  if (shaped) { l = Limiter::apply(l); r = Limiter::apply(r); }
  ```
  Jalur fallback (`AudioCallback.cpp:143-144`) juga menerapkan `Limiter::apply` — double limiting juga terjadi di sana.

**Dampak terukur (dihitung dari rumus `Limiter::apply`, threshold 0.98):** puncak 1,5 → sekali: 0,9993; dua kali: `apply(0.9993) = 0,9898`. Komposisi BUKAN idempotent — puncak panas ditekan ~0,01 lebih jauh + CPU limiter 2×. Tiga mode punya perilaku limiter berbeda: DSP 2×, Immersive 1× (hanya callback; `processImmersive` tidak menyentuh `DSPChain`), BitPerfect 0×. Komentar di `AudioCallback.cpp:316-318` ("Limiter tetap ada di DSP/Immersive karena rantai itu bisa menaikkan level") tidak menyebut node — duplikasi ini tampak tidak disengaja (kemungkinan sisa perbaikan 2026-10-10: limiter callback ditambahkan sebagai pengganti `softClip` lama, sementara node sudah ada).
**Efek samping:** `mVisualizer.write(mLeft, mRight, ...)` (`AudioCallback.cpp:343`) membaca `mLeft/mRight` yang TIDAK diperbarui loop interleave — jadi visualizer melihat sinyal SEBELUM limiter callback. Di mode DSP, node limiter sudah diterapkan (visualizer melihat sinyal ter-limit 1×); di mode Immersive, visualizer melihat sinyal TANPA limiter sama sekali.
**Perbaikan:** hapus salah satu — paling aman hapus `Limiter::apply` di `AudioCallback` untuk mode DSP (node sudah melakukannya), atau jadikan `LimiterNode` satu-satunya limiter dan `applyPipeline` hanya sanitize.

### DSP-M3 — HarmonicExciter menyuntik DC offset yang bergantung level (HIDUP, parameter default)

**Bukti kode** — `dsp/immersive/HarmonicExciter.cpp:74-86`:
```cpp
float HarmonicExciter::shape(float x, float k) {
    const float soft = std::tanh(k * x) / k;
    // x^2 adalah fungsi GENAP -> menghasilkan harmonisa orde 2.
    // Pergeseran -0.25 membuat reratanya nol supaya tidak ada DC offset.
    const float even = (x * x - 0.25f) * 1.2f;
    return soft + even;
}
```
Komentar mengklaim "−0.25 menggeser agar rerata nol, jadi tidak ada DC offset" — **klaim itu salah kecuali sinyalnya ber-RMS tepat 0.5**: E[x²−0.25] = E[x²]−0.25, dan E[x²]=0.25 hanya untuk RMS 0.5. DC yang disuntik = **1.2·(E[x²]−0.25)·mAmount** — nol hanya di satu level. `ImmersiveStage::process()` memanggil `mHarmonic.setDrive(params.resonanceIntensity * 12.0f)` (`core/ImmersiveStage.cpp:84-86`) — default intensitas 0.5 → **drive 6 dB, mAmount = 0.15**.

**Bukti harness** (file produksi asli, 1 detik @48 kHz):

| Kondisi | DC terukur |
|---|---|
| Input diam, drive 6 dB (default immersive) | **−0.045** |
| Input diam, drive 18 dB | **−0.135** |
| Input diam, drive 24 dB | **−0.180** |
| Sine 440 Hz A=1.0, drive 18 | **+0.135** (tanda berbalik!) |
| Sine 440 Hz A=0.1, drive 18 | **−0.132 (lebih besar dari sinyalnya)** |
| Sine 440 Hz A=0.7071, drive 18 | −0.000003 (satu-satunya level yang nol) |

Aritmetika dari kodenya saja sudah membuktikan: diam (x=0) → even = −0.3; × mAmount 0.15 = **−0.045** — persis terukur harness. DC berayun −0.135…+0.135 mengikuti level musik (envelope) — bukan DC statis yang bisa diabaikan, melainkan modulasi yang mengikuti dinamika lagu.

**Dampak:** setiap track yang dimainkan dalam mode Immersive mendapat DC offset yang berayun mengikuti envelope musik — thump saat efek engage, lumpur low-end, headroom termakan (DC −0.045 pada default sudah ~4,5% full-scale yang tidak bersuara), dan pada bagian pelan DC mendominasi sinyal. Terjadi pada parameter DEFAULT — bukan edge case. **Perbaikan yang benar:** suku genap harus zero-mean untuk SEMUA level — mis. ganti konstanta −0.25 dengan DC blocker (highpass ~10–20 Hz) setelah shaper, atau hitung `x² − E[x²]` adaptif. Jangan hanya mengubah konstanta (angka berapa pun hanya benar di satu level).
**Catatan:** klaim komentar lain juga tidak tereproduksi — "h2/f0 ~0.17 dengan perubahan level hanya −0.35 dB pada drive 18" terukur −1.87 dB (A=0.5), −2.61 dB (A=0.7071), −2.54 dB (A=1.0); h2/f0 = 0.404 pada A=1.0 (baru 0.175 pada A≈0.5). Angka komentar tampaknya diukur pada satu amplitudo dan digeneralisasi (dsp-m19). Output juga bisa melewati 0 dBFS (maxabs 1.0497 pada input A=1.0 drive 18) tanpa limiter di jalur immersive (dsp-m18).

### DSP-M4 — Stage brainwave tidak pernah jalan (M7 terkonfirmasi dari sisi immersive)

**Bukti:** gate `if (params.brainwaveFreq > 0.0f)` (`core/ImmersiveStage.cpp:108`) + default `brainwaveFreq = 0.0f` (`core/AudioTypes.h:173-174`, `core/AudioState.h:507`) + 0 pemanggil TS `setBrainwaveFreq` (DSP-M5). `BrainwaveGenerator::generate()` tidak pernah dieksekusi pada APK hari ini — meskipun kelasnya sendiri **benar penuh** (harness: carrier 194.5/204.5 Hz tepat untuk beat 10 Hz, amplitudo tepat 0.04, kontinuitas fase antar-buffer maxDiff 0.0, bypass volume-0 bit-exact). `setType` hanya dipanggil di dalam gate — `mType` bertahan (default ALPHA) antar mode switch; tidak berbahaya.
**Dampak:** 1 dari 4 tahap rantai immersive mati total; "binaural beat" yang dijanjikan mode Immersive (dan disebut di hint UI `settings.tsx:329` + `onboarding.tsx:273`) tidak pernah terdengar. Yang terdengar hanyalah solfeggio + harmonic + spatial-depth.

### DSP-M5 — Parameter immersive tidak terjangkau user (M7 terkonfirmasi)

**Bukti:** 0 pemanggil TS untuk `setSolfeggioFreq` / `setBrainwaveFreq` / `setResonanceIntensity` (hanya deklarasi spec `src/specs/NativeDSPModule.ts:57-59` + `src/features/equalizer/api/nativeInterface.ts:34-36` + wrapper Kotlin `NativeDSPModule.kt:351-362`). Seluruh rantai JNI (`jni/NativeDSPModule.cpp:211-225`, TANPA clamp) → `EngineManager` → `AudioEngine` (`:446-472`) → `AudioState` (`:216-267`) ada dan berfungsi — tapi tidak ada yang memanggilnya dari atas. Tidak ada slider Immersive Lab di TS mana pun; UI hanya memilih mode. `isImmersiveEnabled()` write-only (0 reader di cpp; setter JNI+Kotlin ada tapi tidak dipanggil TS) — dispatch mode tidak memakainya.
**Nilai yang benar-benar dipakai hari ini (default, beku):** solfeggioFreq 528.0 Hz (resonator jalan, Q efektif 0.7 + 0.5×7.3 = 4.35); brainwaveFreq 0.0 Hz (mati); resonanceIntensity 0.5 (drive 6 dB, depth 0.2); stereoWidth 1.0 (cabang widening tidak pernah jalan); masterGain 1.0 / balance 0.0 (diterapkan di `processImmersive`, `AudioPipeline.cpp:276-292`).
**Dampak:** mode Immersive adalah satu preset beku, bukan instrumen yang bisa diatur — padahal arsitekturnya (atomics + setter per-buffer) sudah dirancang untuk kontrol live. Ini juga berarti DSP-M3 tidak bisa dihindari user dari UI (intensitas 0.5 → drive 6 dB → DC −0.045 selalu aktif di mode Immersive); satu-satunya jalan keluar adalah pindah mode.

### DSP-M6 — SolfeggioResonator tidak stabil (inf/NaN) untuk frekuensi di atas Nyquist — tanpa clamp di rantai mana pun (laten)

**Bukti kode:** `setFrequency` hanya clamp bawah (`std::max(20.0f, hz)`, `dsp/immersive/SolfeggioResonator.cpp:16`) — tidak ada clamp atas. `updateCoefficientsIfNeeded` (`:38-46`): `w0 = 2π·f/fs`; untuk f > fs/2, sin(w0) < 0 → α < 0 → `a2 = (1−α)/(1+α) > 1` → pole di luar unit circle → blow-up eksponensial. Koefisien RBJ-nya sendiri benar (harness: sine 528 Hz A=0.5 → outRMS 0.3531 vs in 0.3536, pass-through di resonansi sesuai peak gain 0 dB; noise → maxabs 0.29, terbatas, tanpa non-finite).
**Bukti harness:** `setFrequency(30000)` @48 kHz (Nyquist 24000), noise 1 detik → **maxabs=inf, mean=−nan, nonFinite=1**. Pada 528 Hz normal: terbatas.
**Rantai tanpa clamp:** JNI (`jni/NativeDSPModule.cpp:211-213`) → `EngineManager` (`:869-870`) → `AudioEngine` (`:446-450`) → `AudioState` (`:216-224`) — semuanya pass-through mentah.
**Dampak hari ini:** laten (freq selalu 528, tidak ada pemanggil TS). Dampak kalau terpicu: satu panggilan JNI dengan nilai salah meracuni seluruh jalur audio dengan inf/NaN — dan state IIR menyimpan NaN sampai `reset()`, jadi kerusakannya menempel. Batas aman: clamp ke `min(freq, 0.45 × sampleRate)` atau ke daftar frekuensi solfeggio yang valid. Catatan: pada f tepat Nyquist (24000), α=0 → wet=0, stabil tapi tanpa resonansi. Di atas fs (w0 > 2π), sin berosilasi → pita stabil/tidak-stabil bergantian — makin tidak dapat diprediksi.

### DSP-M7 — `setHighShelf` menghasilkan koefisien NaN untuk Q/gain tertentu; state filter keracunan permanen (LATEN, jalur live via preset headphone)

**Bukti kode** — `dsp/BiquadFilter.cpp:209` (`setHighShelf`), sqrt di `:256`:
```cpp
const float alpha =
    (sinW0 / 2.0f) *
    sqrtf(
        ((A + (1.0f / A)) * ((1.0f / Q) - 1.0f)) + 2.0f
    );
```
Argumen sqrt menjadi negatif bila `(A + 1/A) * (1 - 1/Q) > 2`. `sqrtf(negatif)` = NaN → SEMUA koefisien (b0/b1/b2/a1/a2) NaN. **Dikonfirmasi 3 track independen + 3 harness** (Track A, Track C c-m3, Track D D-M1 — batas zona yang dihitung ketiga track cocok: Q > 2,35 @ ±20 dB; Q > 5,03 @ ±12 dB; Q ≳ 1,9 @ +24 dB).

**Bukti harness** (file produksi asli):
```
Track A: HSC Q=3 +20dB: b0=-nan b1=-nan b2=-nan a1=-nan a2=-nan  NaN/Inf=1
         HSC Q=3 -20dB: sama (NaN) | HSC Q=0.707 +12dB: aman
Track D: HSC Q=6 +12dB: b0=b1=b2=a1=a2=-nan, process(0.5)=-nan
         HSC Q=2 +24dB: b0=-nan | HSC Q=0.707 +6dB (tipikal AutoEQ): b0=1.483452, aman
```
Parser menerima SEMUA `q > 0` dan `gainDb` tanpa batas atas (`dsp/PresetParser.cpp:341-346` hanya memeriksa `freqHz > 0` dan `q > 0`) — jadi preset AutoEQ dengan shelf Q tinggi + gain besar mencapai zona ini. Q=3 untuk shelf memang tidak umum, tapi tidak ada satu pun guard di rantai ini (`BiquadCascade::setFilter` juga tidak memvalidasi). `setLowShelf` dan `setPeakingEQ` tidak punya jalur NaN ini (tidak ada sqrt) — hanya `setHighShelf`.

**Kenapa permanen:** `BiquadFilter::process()` menulis state dari koefisien (`z1 = b1*x - a1*y + z2`) — sekali koefisien NaN, `z1/z2` menjadi NaN pada sample pertama dan TIDAK PERNAH pulih: `setFilter`/`setSampleRate` menghitung ulang koefisien TANPA me-reset state (`dsp/BiquadCascade.cpp:74-105, 175-216` — tidak ada `.reset()` di sana). `sanitizeOutput` di callback hanya men-nol-kan sample output, bukan state filter. Hasil: rantai DSP diam (output 0 setelah sanitasi) sampai `reset()` — yaitu sampai stop. Preset yang salah bisa membisukan mode DSP sampai restart pemutaran.
**Perbaikan:** clamp argumen sqrt ke `>= 0` di `setHighShelf`, dan/atau clamp Q/gain high-shelf di `PresetParser`.

### DSP-M8 — `HighPassFilter`/`LowPassFilter::setCutoff` memanggil method `BiquadFilter` yang tidak ada — error kompilasi laten (TERBUKTI compile test)

**Bukti kode** — `dsp/filters/HighPassFilter.h:21` memanggil `mFilter.setHighPass(cutoff, 0.707f, mSampleRate)`; `dsp/filters/LowPassFilter.h:21` memanggil `mFilter.setLowPass(cutoff, 0.707f, mSampleRate)`. `dsp/BiquadFilter.h` hanya mendeklarasikan `setPeakingEQ`, `setLowShelf`, `setHighShelf` — tidak ada `setHighPass`/`setLowPass`. `dsp/BiquadFilter.cpp` juga tidak mendefinisikannya.
**Bukti compile test** (`/tmp/test_hplp.cpp`, `g++ -std=c++20 -fsyntax-only`, TU yang menginstansiasi keempat kelas filter):
```
dsp/filters/HighPassFilter.h:21:17: error: 'class pristine::BiquadFilter' has no member named 'setHighPass'
dsp/filters/LowPassFilter.h:21:17: error: 'class pristine::BiquadFilter' has no member named 'setLowPass'
```
`ToneControl` dan `StateVariableFilter` dalam TU yang sama **lolos** kompilasi — hanya HPF/LPF yang rusak.
**Kenapa lolos sampai sekarang:** kedua kelas 0 caller, dan method yang didefinisikan in-class di header hanya di-instansiasi saat dipakai — jadi tidak ada yang pernah mengkompilasi `setCutoff()`. Pola yang sama persis sudah diperingatkan `dsp/BiquadFilter.h:59` (komentar FIX 2026-10-10 soal `setHighShelf` yang hilang padahal `ToneControl` memanggilnya — "error kompilasi laten, tidak terlihat sampai kelas itu benar-benar dipakai"). Untuk HPF/LPF, tidak ada yang pernah memperbaikinya.
**Arkeologi git:** `git log -S setHighPass -- dsp/` hanya menemukan commit import awal (`30252b45`) — method itu **tidak pernah ada** di riwayat repo ini. Wrapper ditulis terhadap API yang tidak pernah diimplementasikan.
**Dampak hari ini:** nol (0 caller). Dampak laten: siapa pun yang memakai `HighPassFilter`/`LowPassFilter` — mis. untuk crossover atau tone stage — akan mematahkan build, dan akan mengira `BiquadFilter` punya API high/low-pass padahal tidak.
**Perbaikan:** implementasikan `setHighPass`/`setLowPass` di `BiquadFilter` (RBJ cookbook, cerminan `setPeakingEQ`), atau hapus kedua wrapper.

### DSP-M9 — Rantai konvolusi mati end-to-end: tidak ada node di graph, tidak ada pemuat IR (mati)

**Bukti kode:**
- `dsp/DSPChain.cpp:99-158` membangun graph dengan tepat 5 node: `HeadphoneCorrectionNode`, `EQNode`, `StereoWidenerNode`, `GainNode`, `LimiterNode`. `ConvolverNode` tidak pernah ditambahkan; tidak ada `#include` ke `convolution/` di `DSPChain.cpp`.
- `dsp/convolution/IRLoader.cpp:9-15`: `loadWavMono(const std::string&)` mengabaikan path dan `return {}` — stub dengan komentar `// TODO: wav parsing`. Tidak ada pemuat IR lain di repo (grep `loadWavMono` / `loadImpulseResponse` di luar file sendiri: 0 caller).
- `dsp/convolution/FFTConvolver.{h,cpp}`: hanya `prepare(int fftSize)` (menyimpan angka) + `reset()` kosong — **tidak ada method `process`**, tidak ada buffer input/output, tidak ada FFT. `PartitionedConvolver` hanya meneruskan `prepare(blockSize)` → `mFFT.prepare(blockSize * 2)`; juga tanpa `process`, tanpa pemuatan IR, tanpa partisi.
**Dampak:** fitur konvolusi/reverb **tidak ada** — bukan rusak, melainkan tidak pernah disambung. `ConvolverNode::loadImpulseResponse(vector)` adalah satu-satunya jalan masuk IR, dan tidak ada yang memanggilnya; kalaupun dipanggil, IR hanya bisa datang dari kode (bukan dari file), karena `IRLoader` stub. Dokumen (`docs/DSP_CHAIN_AUDIT.md:286-296`, `docs/FEATURES.md:48`, `docs/IDEAS.md:209-220`) sudah mencatat ini dengan jujur — kontribusi audit ini adalah verifikasi pemanggil yang presisi.
**Perbaikan:** isi `IRLoader` (parsing WAV — repo sudah punya preseden `PCMDecoder` yang dihapus di D-M5; jangan ulangi bug validasi headernya) + tambahkan `ConvolverNode` ke `DSPChain` + implementasikan `PartitionedConvolver`/`FFTConvolver` untuk IR panjang — atau hapus seluruh subdir bila reverb tidak masuk roadmap. Jangan biarkan kelas yang tampak tersedia padahal tidak ada (peringatan `AGENTS.md`).

### DSP-M10 — `StateVariableFilter`: parameter tanpa clamp → osilasi tak teredam / blow-up / NaN (laten, TERBUKTI harness)

**Bukti kode** — `dsp/filters/StateVariableFilter.cpp`: `setResonance()` (`:62-67`) menyimpan nilai apa adanya; `setFrequency()` (`:55-60`) menyimpan apa adanya; `prepare()` (`:14-21`) menyimpan `sampleRate` apa adanya; `update()` (`:28-38`) menghitung `mF = 2*sin(π·f/fs)` tanpa guard. `process()` (`:77-108`) adalah Chamberlin SVF: `mLow += mF·mBand; high = input − mLow − mResonance·mBand; mBand += mF·high`.
**Bukti harness** (`/tmp/test_svf.cpp`, `/tmp/test_svf2.cpp`, file produksi asli):
- `resonance = 0` → osilasi **tidak pernah padam**: max|low| 0,5–1,0 dtk setelah impulse = **0,131087**, dan 1,0–2,0 dtk = **0,131087** (identik — pole di unit circle). Bandingkan `resonance = 0,707` → max|low| 0,5–1,0 dtk = **0,000000**.
- `resonance = -0,5` → blow-up eksponensial: output **−5,4×10¹²** setelah 1000 sampel.
- `prepare(sampleRate = 0)` → `mF = 2·sin(π·f/0) = NaN` → output **`-nan`** pada sampel pertama.
- `frequency >= fs` → `sin(π·f/fs)` negatif → `mF` negatif → tidak stabil (dari rumus).
**Dampak hari ini:** nol (0 caller). Dampak laten: satu `setResonance(0)` atau `setFrequency()` di atas Nyquist dari UI/preset akan menghasilkan dering abadi atau ledakan amplitudo — dan karena SVF tidak punya guard, tidak ada yang menangkapnya sebelum masuk ke output.
**Perbaikan:** clamp di setter: `frequency ∈ (0, fs/2)`, `resonance > 0` (dan `sampleRate > 0` di `prepare()`); atau clamp `mF ∈ (0, 2)` di `update()`. Bonus: `mResonance` dipakai sebagai **damping**, bukan Q — bandpass peak pada fc dengan `resonance=0,707` adalah 1,414491 (= 1/0,707), jadi Q efektif 1,41 bukan 0,707 (dsp-m30).

### DSP-M11 — `FIRFilter::setKernel` / `ConvolverNode::loadImpulseResponse` tidak thread-safe + alokasi tak terbatas di audio thread (laten)

**Bukti kode:**
- `dsp/convolution/FIRFilter.cpp:11-25`: `setKernel()` melakukan `mKernel = kernel` (copy + alokasi) dan `mDelay.assign(kernel.size(), 0.0f)` (alokasi) — tanpa lock, tanpa batas ukuran.
- `dsp/convolution/ConvolverNode.cpp:27-34`: `loadImpulseResponse()` memanggil `setKernel()` pada kedua channel — tanpa lock, tanpa memastikan `process()` tidak sedang berjalan.
- `FIRFilter::process()` (`:39-84`) membaca `mKernel`, `mDelay`, `mPos` secara bersamaan — tidak ada sinkronisasi dengan `setKernel()`.
**Dampak laten:** bila `loadImpulseResponse()` suatu hari dipanggil dari UI/control thread sementara audio thread sedang `process()`, terjadi data race: `mDelay.assign()` dapat merealokasi `mDelay` sementara `process()` membaca `mDelay[index]` → use-after-free / OOB; `mKernel` diganti di tengah loop konvolusi → kernel campur aduk. Alokasi `std::vector` di audio thread juga melanggar realtime-safety (blocking allocator + potensi `bad_alloc` → terminate, tanpa try/catch di rantai pemanggil). Kernel tanpa batas ukuran (IR 10 detik @48 kHz = 480.000 float ≈ 1,9 MB per channel + biaya O(N) per sampel, lihat dsp-m24).
**Perbaikan:** double-buffer kernel + atomic swap (atau muat IR di control thread lalu swap pointer di batas blok), dan batasi panjang IR maksimum di `setKernel()`.

### DSP-M12 — `CrossfeedProcessor` bukan crossfeed; `strength=1` → mono (laten, 0 caller)

**Bukti kode** — `dsp/headphone/CrossfeedProcessor.cpp:11-14`:
```cpp
const float blend = mStrength * 0.5f;
float l = left[i] * (1.0f - blend) + right[i] * blend;
float r = right[i] * (1.0f - blend) + left[i] * blend;
```
- **Bukan crossfeed:** ini blend polos (campur silang instan). Crossfeed sungguhan butuh delay antar-telinga (ITD, ~0,2–0,7 ms) + lowpass pada sinyal silang (bayangan kepala, frekuensi-dependen). Di sini tidak ada keduanya.
- **`strength=1` → mono.** `blend = 0.5` → `l = r = (L+R)/2`. Fitur yang tujuannya *melebarkan* kesan ruang justru *menghapus* stereo pada kekuatan penuh.
- **State filter mati:** `mPrevL`/`mPrevR` dideklarasikan dan di-reset (`:21`) tapi **tidak pernah dibaca** di `process()` — bekas niat memasang filter yang tak pernah diimplementasikan.
**Status:** 0 caller (grep repo-wide, hanya file sendiri), tanpa UI (tidak ada JNI/Kotlin/TS yang menyebutnya). Dinilai MAJOR karena (a) matematikanya salah secara konseptual, bukan edge case; (b) pada kekuatan penuh output adalah mono — kebalikan tujuan fitur; (c) kelas ini lengkap, bernama meyakinkan, dan siap di-wire kapan saja — satu wiring akan menghancurkan stereo secara diam-diam. Preseden: audit decoder menilai `DecoderFactory`+`PCMDecoder` yang mati total sebagai MAJOR (D-M5).
**Perbaikan:** hapus kelas ini bersama `HeadphoneCorrection` lama dan `OutputStage` (satu sapuan dead-code), atau tulis ulang `process()` sebagai crossfeed sungguhan (delay + lowpass pada jalur silang, dengan `mPrevL`/`mPrevR` dipakai sebagai state filter). Jangan "aktifkan" implementasi sekarang.

### DSP-M13 — `OutputStage` mati total (0 instansiasi); DC blocker tidak pernah berjalan di jalur hidup (STRUKTURAL)

**Bukti:** grep `OutputStage` repo-wide (cpp/h/kt/ts) hanya menemukan file-nya sendiri + satu komentar di `dsp/GainProcessor.h:137` ("Stateful convenience wrapper for callers (e.g. OutputStage)"). Tidak ada yang menginstansiasi `OutputStage`, memanggil `prepare`/`process`/`setGain`/`setBalance`/`setLimiterEnabled`-nya.
**Konsekuensi:**
- `DCBlocker` juga mati: satu-satunya pemakai adalah `OutputStage::process()` (`dsp/OutputStage.cpp:84-103`). Tidak ada DC removal di jalur hidup mana pun — callback, pipeline, maupun graph tidak memanggil DC blocker. (Relevan dengan DSP-M3: DC offset exciter tidak ada yang membersihkannya.)
- "Final output stage before DAC" (`dsp/OutputStage.cpp:43-45`) tidak ada; yang benar-benar menjadi tahap akhir adalah kode ad-hoc di `AudioCallback::applyPipeline()` (limiter + sanitize + interleave). Tiga implementasi gain/balance yang paralel — `OutputStage::setBalance` (linear), `GainNode::applyConfig` (linear, SAMA), `AudioPipeline::processImmersive` (constant-power) — dan yang dipakai hanya dua terakhir, dengan hukum yang berbeda (lihat dsp-m7).
- `GainProcessor` instance-API (`prepare`/`reset`/`setGain`/`setChannelGain`, `GainProcessor.h:127-148`) hanya dipakai `OutputStage` — ikut mati bersama kelasnya; yang hidup hanya static `process()` via `GainNode`.

### DSP-M14 — `sanitizeInline()` mati; penjaga bit-perfect diduplikasi (STRUKTURAL)

**Bukti:** grep `sanitize` repo-wide: `dsp/Limiter.h:127` (definisi `sanitizeInline`) 0 pemanggil. Yang dipakai adalah `AudioCallback::sanitizeOutput` (`core/AudioCallback.h:191`, definisi `core/AudioCallback.cpp:345-357`) — logika yang SAMA persis (NaN/Inf → 0; |x| > 2 → 0; |x| < 1e-30 → 0), diverifikasi baris-per-baris identik ambangnya dengan `sanitizeInline`.
**Dampak:** komentar di `dsp/Limiter.h:37` ("Untuk jalur BitPerfect, kelas ini TIDAK dipakai: lihat sanitize() di bawah") menunjuk ke fungsi yang tidak pernah dieksekusi — pembaca (dan calon pemperbaiki) akan mengira penjaga bit-perfect hidup di sini. Kalau seseorang "memperbaiki" `sanitizeInline`, tidak ada yang berubah (rasa aman palsu); dan kedua salinan bisa menyimpang di masa depan (sudah ada preseden: ambang denormal 1e-15 → 1e-30 diperbaiki di `AudioConstants.h`, tapi hanya satu salinan yang "hidup" untuk diuji). Hapus salah satunya; yang hidup (`sanitizeOutput`) sebaiknya memanggil satu implementasi bersama.

### DSP-M15 — Dua stub mati yang berbohong, tetap terkompilasi (pola AGENTS.md)

**Bukti:**
- `BinauralRenderer`: `process()` copy mono→stereo, abaikan azimuth/elevation (`dsp/immersive/BinauralRenderer.cpp:9-14` — komentar kodenya sendiri: `// stub: copy input to both channels`); tidak pernah dipanggil. Satu-satunya referensi di luar file sendiri: member `dsp::BinauralRenderer mBinaural` (`core/ImmersiveStage.h:81`) + `mBinaural.reset()` (`core/ImmersiveStage.cpp:134`). Sengaja tidak aktif menurut komentar `core/ImmersiveStage.h:38-40` ("butuh input mono dan hanya masuk akal untuk headphone... disimpan untuk dipakai nanti, bukan dihapus") — keputusan itu didokumentasi, tapi kelasnya tetap terkompilasi dan API-nya menjanjikan rendering binaural yang tidak ada.
- `FFTResonanceAnalyzer`: `getDominantFrequency()` return `0.0f` selalu (`dsp/immersive/FFTResonanceAnalyzer.cpp:22`); **0 referensi repo-wide**; `mPlan` (`FFTPlan`, implementasi radix-2 asli — `fft/FFTPlan.h`) tidak pernah dipanggil `forward()`. `process()` (`:12-18`) mengakumulasi mono-sum ke `mBuffer` sampai penuh (4096) lalu membuang sisanya diam-diam; FFT tidak pernah dijalankan. Aman dari OOB (guard `if (mWritePos < mFFTSize)` di `:14`) — hanya kelas mati yang berbohong soal namanya.
**Perbaikan:** hapus keduanya, atau implementasikan sungguhan (binaural butuh HRTF/panning; analyzer butuh `mPlan.forward()` + peak-picking).

---

## MINOR (45 — setelah dedup dari 51 temuan mentah 4 track + 1 tambahan dari narasi Track D §3)

Dedup: LSC/HSC alpha (a-m1 = d-m3 = c-m1 → dsp-m1); denormal (a-m3 = c-m9 → dsp-m2); null guard (a-m5 = d-m10 → dsp-m3); hukum balance (a-m7 = d-m2 → dsp-m4). Promosi ke MAJOR: c-m3 (→ DSP-M7), d-m1 (→ DSP-M2). Satu tambahan dari narasi Track D §3: dua gerbang DSP (dsp-m32).

| ID | Temuan | Bukti |
|---|---|---|
| dsp-m1 | **Shelf alpha inkonsisten: LSC vs HSC memakai rumus berbeda untuk Q yang sama.** `setLowShelf` memakai `alpha = sin(w0)/(2Q)` (gaya peaking); `setHighShelf` memakai alpha shelf RBJ `sin(w0)/2 * sqrt((A+1/A)*(1/S-1)+2)`. Keduanya tepat di titik Fc (harness: \|H(Fc)\| = 1,4125 = +3 dB untuk gain +6 dB, keduanya), tapi BUKAN cerminan eksak: LSC \|H(Fc/2)\| = 1,9109 vs HSC \|H(2Fc)\| = 1,8162 (selisih ~0,44 dB). Preset AutoEQ yang mencampur LSC/HSC dengan Q sama mendapat slope sedikit berbeda dari yang dimaksud. Low shelf dengan Q=0,707 berperilaku seperti shelf RBJ dengan S≈0,574 | `dsp/BiquadFilter.cpp:139-142` vs `:231-236,256`; harness Track A T2 + Track D §7 |
| dsp-m2 | **Tidak ada proteksi denormal di state filter.** `BiquadFilter::process`, `DCBlocker::process` tidak mem-flush state denormal; `sanitizeOutput` hanya mem-flush sample output, bukan state `z1/z2`/`mPrevOutput`. Ekor sunyi panjang → state mengecil ke denormal → penalti performa ARM. Di ARM64 Android biasanya di-flush hardware (FZ), jadi kemungkinan besar moot — perlu pengukuran (DSg-11) | `dsp/BiquadFilter.h:48-66`; `dsp/DCBlocker.h:10-23`; `dsp/filters/StateVariableFilter.cpp:77-108` |
| dsp-m3 | **Tidak ada null guard** di `EQProcessor::process`, `Limiter::process`, `DSPGraph::process`, `OutputStage::process` (deref `left[i]`/`right[i]` tanpa cek). Saudara-saudaranya punya (`StereoWidener::process`, `GainProcessor::process` memeriksa null). Laten: satu-satunya pemanggil produksi (`AudioCallback::applyPipeline`) sudah guard `!interleaved` | `dsp/EQProcessor.cpp:63-65`; `dsp/Limiter.h:96-111`; `dsp/DSPChain.cpp:77-103`; `core/AudioCallback.cpp:274` |
| dsp-m4 | **Hukum balance beda antar mode.** `GainNode::applyConfig` memakai balance **linear** (`1 - balance`); `processImmersive` memakai **constant-power** (pan cos/sin). Nilai balance yang sama menghasilkan perilaku loudness berbeda saat pindah mode DSP ↔ Immersive. Terkait: balance 0 di Immersive → gainL = gainR = gain·cos(π/4) = 0,707 (−3,01 dB); di DSP → 1,0/1,0. Ganti mode DSP → Immersive menurunkan level 3 dB di posisi tengah | `dsp/tone/GainNode.cpp:49-62` vs `core/AudioPipeline.cpp:283-293` |
| dsp-m5 | **Ganti koefisien tanpa reset state / tanpa smoothing → transient.** `EQProcessor::updateBand`/`updateBass` mengganti koefisien lewat `setCoefficients` tanpa menyentuh `z1/z2`; `BiquadCascade::setFilter`/`setSampleRate` sama. Harness: band 250 Hz +12 → −12 dB tanpa reset → max\|out\| = **1,955** pada 480 sample pertama (steady-state −12 dB ≈ 0,25; input sine amplitudo 1,0). Preset load mengubah 10 band sekaligus → pop lebih besar. Limiter downstream menangkap puncak >0,98, tapi tetap burst distorsi | `dsp/EQProcessor.cpp:210-251`; `dsp/BiquadCascade.cpp:74-105`; harness Track A T6 |
| dsp-m6 | **Cutoff DCBlocker tergantung laju** (moot — kelasnya mati, DSP-M13): koefisien 0,995 tetap → cutoff ≈ 35 Hz @44,1k, ≈ 38 Hz @48k, ≈ 76 Hz @96k. Kalau suatu hari dihidupkan, koefisien harus dihitung dari laju | `dsp/DCBlocker.h:14-17` |
| dsp-m7 | **Balance/masterGain/eqGain tanpa clamp di batas native.** `AudioState::setBalance`/`setMasterGain`/`setEqGain` menyimpan mentah; JNI (`jni/NativeDSPModule.cpp:32-105`) dan Kotlin (`NativeDSPModule.kt:199-206`) juga tidak meng-clamp. Balance \|x\| > 1 di mode DSP → gain negatif (inversi fasa satu channel, `GainNode.cpp:49-62`); `setBassBoost`/width sudah di-clamp di Kotlin/TS (0..12 dB, 1..2), balance/master tidak | `core/AudioState.h:152-206,278-295`; `dsp/tone/GainNode.cpp:49-62` |
| dsp-m8 | **Node selalu aktif, kerja identity tiap buffer.** `DSPNode::mEnabled` default true; hanya `LimiterNode` yang pernah di-`setEnabled` dari config. `EQNode`/`GainNode`/`StereoWidenerNode` berjalan tiap buffer walau flat/netral: `EQProcessor::process` loop 10 band (skip per-band), `GainProcessor` kali 1,0, `StereoWidener` hitung mid/side penuh pada width 1,0. Benar, tapi buang CPU audio thread | `dsp/graph/DSPNode.h:64`; `dsp/tone/EQNode.cpp:28-43` |
| dsp-m9 | **Parser: satuan tidak peduli kunci + tanpa batas atas.** `parseFloat` + penanganan unit (`dsp/PresetParser.cpp:296-312`) mengalikan `KHZ` ×1000 untuk kunci APA PUN: `Gain 5 kHz` → gainDb 5000 (→ A = inf → koefisien NaN, lihat DSP-M7); `Q 0.7 kHz` → q = 700. Sanity check hanya `freqHz > 0` dan `q > 0` (`:341-346`) — tanpa batas atas Fc/Q/gainDb/preamp (`Preamp: +100 dB` diterima → preamp linear 1e5) | `dsp/PresetParser.cpp:296-346`; `dsp/BiquadCascade.cpp:159-162` |
| dsp-m10 | **Preamp error = warning (diterima 0 dB), filter error = fatal.** `Preamp` tanpa `:` / nilai tak terbaca hanya warning lalu lanjut; satu baris filter gagal → SELURUH preset ditolak. Ketidakkonsistenan strictness: preset dengan preamp rusak diterapkan sebagian (0 dB, diam-diam) sementara filter rusak ditolak total | `dsp/PresetParser.cpp:156-174` vs `:395-403` |
| dsp-m11 | **`parseFloat` menerima angka cacat diam-diam.** Loop pembangun `num` hanya mengambil karakter angka di depan: `"1-2"` → `"1-2"` → `strtod` = 1,0; `"1.2.3"` → 1,2. `strtod` berhenti di karakter aneh tanpa error karena cek `end == num.c_str()` hanya gagal kalau TIDAK ADA yang ter-parse | `dsp/PresetParser.cpp:48-72` |
| dsp-m12 | **`DSPConfig::reset()` 0 pemanggil.** Metode ada, tidak pernah dipakai (config di-reset dengan assignment field-per-field di `applyDSPConfig`) | `core/DSPConfig.h` (reset); grep 0 caller |
| dsp-m13 | **`DSPChain::process` sebelum `prepare` = diam tanpa log.** `if (!mPrepared) return;` — audio hilang tanpa jejak. Sama untuk mode tak dikenal di `AudioPipeline::process` (switch tanpa default → tidak ada yang diproses) | `dsp/DSPChain.cpp:80-82`; `core/AudioPipeline.cpp:63-93` |
| dsp-m14 | **Nama `Limiter::softClip` menipu (terdokumentasi di file).** Nama lama dipertahankan untuk kompatibilitas tapi perilakunya SUDAH berubah total (`softClip` kini = `apply`, identity di bawah 0,98). File mendokumentasikannya dengan jelas — tetap jebakan bagi pembaca/kode baru yang mengira soft-clip klasik `x/(1+\|x\|)` | `dsp/Limiter.h:60-68` |
| dsp-m15 | **Tap ambience Spatial tidak diskalakan laju sampling:** 576/888/1200 sample = 12/18.5/25 ms hanya pada 48 kHz; pada 96 kHz jadi 6/9.25/12.5 ms, pada 44.1 kHz 13.1/20.1/27.2 ms. Karakter ruang berubah dengan laju stream. Header mengakuinya ("nilai setara 48 kHz") — tapi tidak ada kompensasi. Tidak ada crash (tap maks 1200 < 8192) | `dsp/immersive/SpatialFieldProcessor.h:60-66` |
| dsp-m16 | **`BrainwaveGenerator::setVolume` tanpa validasi:** volume NaN lolos cek `mVolume <= 0.0f` (false untuk NaN) dan `mVolume > 1.0f` (false) → `amplitude = NaN` → output NaN. Hanya via JNI dengan NaN; laten | `dsp/immersive/BrainwaveGenerator.cpp:79-87` |
| dsp-m17 | **`ImmersiveStage::prepare()` gagal diam-diam:** `sampleRate <= 0` → return tanpa log dan `mPrepared` tetap false → `process()` melewatkan audio tanpa efek dan tanpa jejak — sulit didiagnosis kalau prepare gagal | `core/ImmersiveStage.cpp:29-42,59-64` |
| dsp-m18 | **Exciter bisa mendorong puncak melewati 0 dBFS dan tidak ada limiter di jalur immersive** (terukur maxabs 1.0497 pada input A=1.0 drive 18; `processImmersive` tidak memanggil limiter; hanya master gain + balance) | Harness Track B H3; `core/AudioPipeline.cpp:252-300` |
| dsp-m19 | **Angka komentar `HarmonicExciter` tidak tereproduksi:** klaim level "−0.35 dB pada drive 18" terukur **−1.87 dB (A=0.5), −2.61 dB (A=0.7071), −2.54 dB (A=1.0)**; klaim "h2/f0 ~0.17" hanya cocok pada A≈0.5 (0.1752) dan jadi 0.404 pada A=1.0. Angka-angka itu amplitudo-spesifik, bukan sifat kelas | Harness Track B H3 + exciter2; `dsp/immersive/HarmonicExciter.cpp:95-100` |
| dsp-m20 | **`FFTResonanceAnalyzer` mengisi buffer sekali lalu membuang semua sampel berikutnya diam-diam** (`mWritePos` mentok di `mFFTSize`, tanpa wrap/flag). Moot (kelas mati), tapi kontrak kelasnya sendiri rusak | `dsp/immersive/FFTResonanceAnalyzer.cpp:12-18` |
| dsp-m21 | **`BinauralRenderer::setAzimuth/setElevation` menyimpan nilai yang tidak pernah dibaca `process()`** — parameter mati di dalam kelas mati | `dsp/immersive/BinauralRenderer.cpp:6-7` vs `:9-14` |
| dsp-m22 | **Flag `isImmersiveEnabled()` write-only:** 0 reader di cpp; setter JNI+Kotlin ada tapi tidak dipanggil TS. Dispatch mode (`AudioPipeline.cpp:87`) tidak memakainya — flag ini ilusi kontrol | `core/AudioState.h:98-101`; grep 0 reader |
| dsp-m23 | **Guard safety `BiquadFilter` meninggalkan koefisien basi.** `setPeakingEQ`/`setLowShelf`/`setHighShelf` `return` diam-diam saat `freq/sampleRate/Q <= 0` — filter tetap berjalan dengan koefisien LAMA tanpa pemberitahuan. Pemanggil mengira cutoff/gain baru terpasang | `dsp/BiquadFilter.cpp` (tiga guard `if (freq <= 0 \|\| sampleRate <= 0 \|\| Q <= 0) return;`) |
| dsp-m24 | **`WindowFunctions`: `size <= 1` → pembagian nol; `size < 0` → throw.** `createHanningWindow(1)` → `w[0] = -nan` (terbukti harness: `0/0` di `cosf(2π·0/(1−1))`). `createHanningWindow(-5)` → **THROW** `std::length_error` ("cannot create std::vector larger than max_size()"). `size=0` aman (vector kosong). Berlaku untuk keempat generator (`/ (size-1)`) + `WindowFunctions::hann`/`blackman` statics. Tidak ada validasi ukuran di mana pun | `dsp/convolution/WindowFunctions.cpp:8-32`; `dsp/convolution/WindowFunctions.h:20-55`; harness Track C |
| dsp-m25 | **Hann simetris dipakai untuk analisis FFT — seharusnya periodik.** `createHanningWindow` memakai penyebut `(size−1)` (simetris, benar untuk desain FIR), tapi satu-satunya pemakainya adalah `FFTProcessor` untuk analisis spektral (`fft/FFTProcessor.cpp:9`), di mana window periodik (penyebut `size`) adalah standar — simetris menambah leakage kecil di bin ujung. Dampak kecil, tapi penamaannya tidak membedakan keduanya | `dsp/convolution/WindowFunctions.cpp:8-12`; `fft/FFTProcessor.cpp:9` |
| dsp-m26 | **`FIRFilter` O(N) per sampel — IR panjang tidak feasible; jalur FFT yang seharusnya menangani ini kosong.** IR 1 detik @48 kHz = 48.000 tap → 48.000 MAC/sampel × 2 channel × 48.000 sampel/dtk ≈ 4,6 GMAC/dtk. `PartitionedConvolver`/`FFTConvolver` (yang akan membuat IR panjang murah) tidak punya `process` (DSP-M9) | `dsp/convolution/FIRFilter.cpp:51-69` (loop per tap per sampel) |
| dsp-m27 | **`ConvolverNode::prepare()` no-op** (mengabaikan sampleRate/maxFrames — parameter bahkan tanpa nama); **IR mono dipaksakan ke kedua channel** (tidak ada dukungan IR stereo — `loadImpulseResponse` memakai vector yang sama untuk L dan R) | `dsp/convolution/ConvolverNode.cpp:9-15,27-34` |
| dsp-m28 | **`WindowFunctions` sebagian besar mati:** statics `hann`/`blackman` 0 caller; `createHammingWindow`, `createBlackmanWindow`, `createRectangularWindow` 0 caller. Hanya `createHanningWindow` hidup (`fft/FFTProcessor.cpp:9`) | grep repo-wide; `dsp/convolution/WindowFunctions.h` |
| dsp-m29 | **`PartitionedConvolver::prepare(blockSize)` tanpa validasi:** `mFFT.prepare(blockSize * 2)` — `blockSize` besar → overflow int; tidak ada cek power-of-2 (ukuran FFT harus power-of-2); `FFTConvolver::prepare` menyimpan angka apa adanya tanpa cek. Moot hari ini (keduanya mati), tapi kontraknya tidak ada | `dsp/convolution/PartitionedConvolver.cpp:9-15`; `dsp/convolution/FFTConvolver.cpp:7-12` |
| dsp-m30 | **Semantik resonansi SVF salah label:** `mResonance` dipakai sebagai **damping**, bukan Q. Terbukti harness: bandpass peak pada fc dengan `resonance=0,707` adalah **1,414491** (= 1/0,707) — Q efektif 1,41, bukan 0,707. Default `mResonance = 0,707f` (angka Q Butterworth) menyesatkan: siapa pun yang mengira itu Q akan mendapat peak +3 dB di cutoff | `dsp/filters/StateVariableFilter.cpp:85-92`; `dsp/filters/StateVariableFilter.h:29`; harness Track C |
| dsp-m31 | **`FIRFilter::setKernel` tidak memvalidasi isi kernel** (NaN/inf lolos ke output); **`ConvolverNode::process` in-place** — bila pointer `left == right` (buffer mono yang di-alias), channel kanan memproses data kiri yang sudah terfilter | `dsp/convolution/FIRFilter.cpp:11-25`; `dsp/convolution/ConvolverNode.cpp:41-55` |
| dsp-m32 | **Dua gerbang DSP berbeda di dua jalur.** Jalur utama: `DSPProcessingGate::enabled()` (`AudioCallback.cpp:101`, default ON); jalur fallback: `mState.isDSPEnabled()` (bukan gate yang sama). Cross-ref M6: flag `dspEnabled` yang "mati" ternyata masih menggerbang jalur fallback — jadi klaim "dspEnabled tidak menggerbang apa pun" hanya benar di jalur utama | `core/AudioCallback.cpp:101` vs jalur fallback; `core/DSPProcessingGate.cpp:25,31` |
| dsp-m33 | **`PresetParser`: tanpa batas Nyquist untuk Fc.** `parseFrequency` menerima Fc berapa pun (mis. Fc 100000 Hz pada 48 kHz) → koefisien RBJ jadi sampah (stabil tapi salah). Perbaikan: tolak `Fc >= sampleRate/2` — perlu laju diteruskan ke parser, atau validasi di `HeadphoneCorrectionNode::applyConfig` yang tahu laju | `dsp/PresetParser.cpp` (`parseFrequency`) |
| dsp-m34 | **`PresetParser`: preamp last-wins diam-diam.** Dua baris `Preamp:` → yang terakhir menang tanpa peringatan. Perbaikan: peringatan (sudah ada mekanisme warning) atau tolak duplikat | `dsp/PresetParser.cpp` (parse `Preamp:`) |
| dsp-m35 | **`PresetParser`: vektor filter tumbuh tak terbatas sebelum cek >16.** `filters` membesar selama parse, cek `> 16` baru di akhir. Preset 10.000 baris mengalokasi 10.000 `ParsedFilter` dulu baru ditolak. Perbaikan: tolak saat `parsedCount` melewati 16 | `dsp/PresetParser.cpp:103` (`parseParametricPreset`) |
| dsp-m36 | **`PresetParser::parseFloat`: `"1,000.5"` → 1,0.** Koma desimal Eropa didukung, tapi `"1,000.5"` (titik ribuan + koma desimal) berhenti di koma → 1,0 tanpa peringatan. Edge case parsing; perbaiki dengan menolak format campuran | `dsp/PresetParser.cpp` (`parseFloat`) |
| dsp-m37 | **Komentar basi: `DSPProcessingGate.h:25` bilang "DEFAULT: false".** Faktanya default **ON** sejak 2026-10-07 (`DSPProcessingGate.cpp:24-31`, `PRISTINE_DSP_IN_PRODUCTION 1`; CMakeLists tidak meng-override). Komentar header menyesatkan — siapa pun yang membaca header akan mengira pipeline mati | `core/DSPProcessingGate.h:25`; `core/DSPProcessingGate.cpp:24-31` |
| dsp-m38 | **Komentar basi: `DSPPipeline.ts` klaim "EQ Android level session".** Komentar `src/features/visualizer/api/DSPPipeline.ts` (~:78-82) menyebut `setFullEqualizer` sebagai "efek level Android session" yang "bisa aktif bersamaan" dengan DSPChain C++. **Salah:** tidak ada `android.media.audiofx.Equalizer` di mana pun di Kotlin (grep: hanya komentar + stub `DSPController.kt`); `setFullEqualizer` (`NativeDSPModule.kt:102-113`) memanggil JNI `setNativeEqualizerBand` per band → jalur C++ yang **sama** dengan EQNode. `sessionId` diterima Kotlin tapi **tidak diteruskan ke JNI** (diabaikan). Jadi tidak ada "dua EQ yang menumpuk" — hanya satu EQ, dengan komentar yang mengklaim dua | `src/features/visualizer/api/DSPPipeline.ts:78-82`; `android/app/src/main/java/com/pristineaudio/playback/NativeDSPModule.kt:102-113` |
| dsp-m39 | **`DSPGraph::addNode` menyiapkan node 2x.** Node di-`prepare` sekali saat ditambah (dengan default 48000) lalu sekali lagi di `DSPGraph::prepare` dengan laju asli. Redundan, tidak berbahaya | `dsp/graph/DSPGraph.cpp:9-19,72-92` |
| dsp-m40 | **`DSPChain::prepare` membangun ulang graph tiap panggilan.** `DSPChain::prepare` → `buildGraph` membuat ulang 5 node (`make_unique`) tiap `start()`/reopen. Bukan di audio thread (prepare dipanggil dari `start()`), jadi tidak berbahaya — hanya alokasi berulang. Perbaikan: bangun sekali, `prepare` ulang saja. (Ini juga akar DSP-M1: rebuild + guard dedup yang tidak di-reset) | `dsp/DSPChain.cpp:20,99` |
| dsp-m41 | **Magic number 0/1/2 untuk tipe filter (risiko divergensi).** `HeadphoneCorrectionNode::applyConfig` dan `PresetParser::toPresetData` memakai angka mentah `0=Peaking, 1=LowShelf, 2=HighShelf` padahal enum `FilterType` sudah ada dan dipakai `BiquadCascade`. Kalau urutan enum berubah, kedua situs rusak diam-diam | `dsp/headphone/HeadphoneCorrectionNode.cpp:102-155`; `dsp/PresetParser.cpp:385` |
| dsp-m42 | **Cap 32 node: `addNode` gagal diam-diam.** `DSPGraph::addNode` mengembalikan `false` saat penuh (`kMaxNodes = 32`), tapi `DSPChain::buildGraph` mengabaikan nilai kembaliannya. Hari ini 5 node — laten | `dsp/graph/DSPGraph.cpp:72-92`; `dsp/graph/DSPGraph.h:13` |
| dsp-m43 | **Komentar basi: `AudioCallback.cpp:~97-100`.** "Defaultnya masih perilaku lama sampai diuji di perangkat" — gate sudah ON sejak 2026-10-07. Sama seperti dsp-m37: perbarui komentar | `core/AudioCallback.cpp:97-100` |
| dsp-m44 | **`GainProcessor.h`: cek NEON ganda.** `#if defined(__ARM_NEON) \|\| defined(__ARM_NEON__)` — makro yang sama dua kali (ejaan berbeda). Tidak berbahaya (OR), hanya sloppy | `dsp/GainProcessor.h` |
| dsp-m45 | **`PresetParser::applyPreset()` mati + logika diduplikasi.** `applyPreset()` (deklarasi `PresetParser.h:96`) punya **0 caller C++** (hit TS `applyPreset` adalah fungsi Zustand store yang tidak terkait). Logika yang sama (loop `setFilter` + preamp + `setActiveCount`) diduplikasi di `HeadphoneCorrectionNode::applyConfig` (`:66-167`) — risiko divergensi. Bonus: `applyPreset` juga *partial-apply saat gagal* (membersihkan cascade, memasang sebagian filter, lalu `return false` tanpa rollback) — laten di kode mati. Perbaikan: hapus `applyPreset`, atau jadikan `HeadphoneCorrectionNode::applyConfig` memanggilnya (satu implementasi) | `dsp/PresetParser.cpp:345`; `dsp/headphone/HeadphoneCorrectionNode.cpp:66-167` |

---

## DUGAAN (16)

| ID | Dugaan | Dasar + cara verifikasi |
|---|---|---|
| DSg-1 | **DSP-M1 teramati di device?** EQ/koreksi hilang setelah mode toggle atau cabut headset — persis skenario logcat #9 (reopen 07:20:22, 07:23:39, 07:23:52) | Device: set EQ +6 dB (atau pasang koreksi headphone), toggle mode DSP→BitPerfect→DSP (atau cabut/colok headset), dengarkan — EQ/koreksi hilang sampai slider digeser sedikit. Atau: logcat cari `applyConfig` — setelah reopen tidak ada pemanggilan ulang sampai ada perubahan setting |
| DSg-2 | **Double limiter (DSP-M2) terdengar?** Efek hanya di atas 0,98; pada master biasa mungkin tidak terdengar | Harness: tone panas (puncak 1,2–1,5) lewat limiter 1× vs 2×, ukur THD + selisih puncak. Device: bandingkan master keras mode DSP vs Immersive (1×) — kalau DSP terdengar sedikit lebih "jinak" di puncak, itu double limiter |
| DSg-3 | **NaN high-shelf (DSP-M7) terjangkau preset AutoEQ nyata?** Zona NaN butuh Q > 2,35 @ ±20 dB (Q > 5 @ ±12 dB). Preset AutoEQ umumnya Q 0,5–2 | Grep preset headphone yang dibundel/diunduh app: cari baris `HSC` dengan Q > 2 dan \|gain\| > 12 dB. Kalau tidak ada, temuan tetap valid sebagai guard yang hilang, tapi tidak terjangkau preset nyata |
| DSg-4 | **Pop saat load preset (dsp-m5) terdengar di device?** Load preset mengubah 10 band sekaligus tanpa reset state | Device: mainkan lagu, load preset EQ yang jauh berbeda, dengarkan klik di awal. Atau ukur transient dari file hasil harness Track A T6 (max\|out\| 1,955 vs steady 0,25) |
| DSg-5 | **Jalur NEON `GainProcessor` benar di ARM?** Loop `i <= frames-4` + remainder sudah benar menurut inspeksi; `vld1q/vst1q` tak-beralign aman di ARMv8. Tidak bisa dieksekusi di VM x86 ini | Butuh build ARM / device: bandingkan output NEON vs skalar pada buffer acak (bit-identik diharapkan — perkalian float NEON vs skalar bisa beda 1 ulp terakhir, toleransi itu) |
| DSg-6 | **DC offset exciter (DSP-M3) TERDENGAR sebagai thump / lumpur low-end pada musik nyata di mode Immersive (default)?** Harness membuktikan DC ada (±0.045 pada default); ambang dengar pada musik kompleks belum tahu | Device: mainkan track dengan bagian pelan/diam dalam mode Immersive (headphone), dengarkan thump saat efek engage + dengung low-end; atau rekam output dan ukur DC per segmen. Alternatif: render file lewat harness dengan musik nyata, ukur DC per 100 ms vs envelope |
| DSg-7 | **Resonator Q=8.0 (intensitas 1.0) berdering terdengar pada transient?** Waktu luruh ≈ Q/(π·f): ~4.8 ms @528 Hz, ~14.6 ms @174 Hz — kemungkinan pendek, tapi belum didengar | Device/harness: impuls + tone burst pada intensitas 1.0, ukur RT60 ekor resonansi; dengarkan ringing pada transient tajam |
| DSg-8 | **Binaural beat (kalau gate dibuka) terdengar di bawah musik?** Amplitudo carrier hanya 0.04 pada volume 0.5 — klaim psikoakustik, bukan fakta kode | Device: set `brainwaveFreq` via JNI/adb (atau UI sementara), dengarkan dengan headphone pada musik pelan; ukur apakah beat 10 Hz terasa vs placebo |
| DSg-9 | **Konvolusi direncanakan untuk fitur reverb/headphone-IR yang tidak pernah mendarat.** `git log` hanya import awal (`30252b45`) + mass-update + migrasi namespace — tidak ada satu pun commit yang pernah menyambung `ConvolverNode` ke graph atau mengisi `IRLoader`. Dokumen (`docs/IDEAS.md:209-220`, `docs/FEATURES.md:48`) mencatatnya sebagai pekerjaan masa depan (P2) | Tanya pembuat aslinya / cek branch lama; dari kode saja tidak bisa dipastikan niatnya |
| DSg-10 | **`HighPassFilter`/`LowPassFilter` ditulis untuk tone/crossover stage yang direncanakan lalu dibatalkan** — tidak ada caller, tidak ada referensi di dokumen manapun, tidak ada jejak di git selain import awal | Sama seperti DSg-9 — niat penulis tidak terekam di kode |
| DSg-11 | **Biaya CPU denormal (dsp-m2) di device** — perlu pengukuran, bukan asumsi. ARM64 umumnya flush-to-zero, tapi perilaku tergantung flag FPCR yang dipakai runtime | Ukur dengan state filter yang meluruh + profiling di device; atau tambahkan flush/denormal guard dan ukur bedanya |
| DSg-12 | **DC blocking tidak ada di jalur hidup.** `DCBlocker` hanya dipakai `OutputStage` (mati). Matematikanya benar (`y = x - x_prev + 0.995*y_prev`, cutoff ~38 Hz @48 kHz) tapi tidak ada di rantai hidup. `sanitizeOutput` menangani NaN/Inf/denormal, **bukan** DC offset. File dengan DC offset akan lolos | Butuh file uji ber-DC offset untuk memastikan dampak terdengar |
| DSg-13 | **Urutan 5 node: apakah limiter sesudah gain memang disengaja?** Urutan headphone → EQ → widener → gain → limiter berarti limiter melihat sinyal sesudah master gain (gain bisa mendorong sinyal ke limiter). Alternatif (limiter sebelum gain) punya perilaku berbeda. Ini pertanyaan desain/produk, tidak bisa diputuskan dari kode | Tanya pembuat aslinya |
| DSg-14 | **`ImmersiveStage.h:7` include `DSPChain.h` tanpa memakai simbol DSPChain.** Hanya komentar (`:16-17,30`) yang menyebut DSPChain; tidak ada member/tipe DSPChain di file itu. Kemungkinan unused include (cross-track: `core/`) | Cek kompilasi tanpa include |
| DSg-15 | **`DSPController.kt` stub TODO, 0 caller** — sisa percobaan DSP sisi Kotlin; aman dihapus (cross-track: Kotlin) | Hapus + build |
| DSg-16 | **"Same" check `HeadphoneCorrectionNode` tidak membandingkan laju.** `applyConfig` (`:100-121`) membandingkan field preset saja, bukan `mAppliedSampleRate`. Hari ini aman karena `prepare()` me-reset `mHasApplied=false` tiap start/reopen. Rapuh bila di masa depan ada jalur ganti laju tanpa `prepare()` | Catatan desain, bukan bug |

---

## Dead code (grep-verifikasi)

| Simbol / file | Status | Bukti |
|---|---|---|
| `ConvolverNode` (seluruh kelas) | Mati — 0 caller | `DSPChain.cpp:99-158` hanya menambahkan 5 node lain; grep repo-wide 0 referensi di luar file sendiri |
| `FIRFilter` | Mati — hanya dipakai `ConvolverNode` (mati) | `dsp/convolution/ConvolverNode.h:31-32` satu-satunya member |
| `FFTConvolver` | Mati — hanya member `PartitionedConvolver` (mati) | `dsp/convolution/PartitionedConvolver.h:18` |
| `PartitionedConvolver` | Mati — 0 caller | grep repo-wide 0 referensi di luar file sendiri |
| `IRLoader::loadWavMono` | Mati + stub — 0 caller, selalu return `{}` | `dsp/convolution/IRLoader.cpp:9-15` |
| `HighPassFilter` | Mati — 0 caller (+ tidak bisa dikompilasi, DSP-M8) | grep repo-wide 0 referensi di luar file sendiri |
| `LowPassFilter` | Mati — 0 caller (+ tidak bisa dikompilasi, DSP-M8) | grep repo-wide 0 referensi di luar file sendiri |
| `StateVariableFilter` | Mati — 0 caller | grep repo-wide 0 referensi di luar file sendiri |
| `ToneControl` | Mati — 0 caller (sudah dicatat `dsp/BiquadFilter.h:59`) | grep repo-wide 0 referensi di luar file sendiri |
| `WindowFunctions::hann` / `blackman` (statics) + `createHammingWindow` / `createBlackmanWindow` / `createRectangularWindow` | Mati — 0 caller | grep repo-wide: hanya definisi |
| `BinauralRenderer` (seluruh kelas) | Mati — `process()` 0 caller; hanya member + `reset()` | DSP-M15 |
| `FFTResonanceAnalyzer` (seluruh kelas) | Mati — 0 referensi repo-wide | DSP-M15 |
| `CrossfeedProcessor` (seluruh kelas) | Mati — 0 caller (+ matematika salah, DSP-M12) | grep repo-wide: hanya file sendiri |
| `HeadphoneCorrection` (kelas lama) | Mati — 0 instansiasi; `loadProfile` selalu `return false`; `process` menerapkan FIR trivial `inout[i] *= coeffs[0]` di atas vektor kosong | `dsp/headphone/HeadphoneCorrection.cpp:18,29` |
| `OutputStage` (seluruh kelas) | Mati — 0 instansiasi/pemanggilan repo-wide | DSP-M13 |
| `DCBlocker` | Mati (transitif) — hanya `OutputStage.h:65-66` | DSP-M13 |
| `GainProcessor` instance-API (`prepare`/`reset`/`setGain`/`setChannelGain`/instance `process`) | Mati — hanya dipakai `OutputStage` (mati); yang hidup hanya static `process()` via `GainNode` | `dsp/GainProcessor.h:127-148` |
| `PresetParser::applyPreset` | Mati — 0 caller C++ | dsp-m45 |
| `DSPConfig::reset()` | Mati — 0 pemanggil | dsp-m12 |
| `BiquadCascade::overflowed()` | Mati — 0 pembaca produksi; flag `mOverflowed` memang di-set di `setFilter`, tapi tidak ada yang memeriksa (parser menolak preset > 16 filter sebelum sampai sini) | `dsp/BiquadCascade.h:108` |
| `BiquadCascade::setSampleRate()` | Mati — 0 caller; jalur laju yang hidup adalah `prepare()` (K-1 di Track D: `HeadphoneCorrectionNode::prepare` mencatat laju baru + reset `mHasApplied` tiap start/reopen) | `dsp/BiquadCascade.cpp:139` |
| `Limiter::sanitizeInline` | Mati — 0 pemanggil; logika diduplikasi `AudioCallback::sanitizeOutput` | DSP-M14 |
| `Limiter::softClip()` | Mati — 0 caller kode, hanya definisi + komentar; alias `apply()` | `dsp/Limiter.h:73` |
| `DSPController.kt` | Mati — 0 caller, badan `// TODO` | DSg-15 |

**Tidak mati (jangan dihapus):** `DSPChain`, `DSPGraph`, `DSPNode`, kelima node, `EQProcessor` (+ `BiquadFilter`, `BiquadCascade`), `GainProcessor` (static), `Limiter::apply`/`process`, `StereoWidener`, `PresetParser::parseParametricPreset`/`toPresetData`, `createHanningWindow` (dipakai `fft/FFTProcessor.cpp:9`), `SolfeggioResonator`, `HarmonicExciter` (perlu DIPERBAIKI, bukan dihapus — DSP-M3/DSP-M6), `SpatialFieldProcessor` (perlu width dihidupkan), `BrainwaveGenerator` (benar; perlu gate dibuka), `ImmersiveStage` + `processImmersive` (rantai hidup), `dsp::LinearResampler` / `StreamResampler` (ranah audit resampler).

**Klaim ditolak (bukan bug, hasil verifikasi Track D):**
- **K-1 — "HeadphoneCorrectionNode bisa stale saat stream ganti laju" — DITOLAK.** `prepare()` mencatat laju baru dan me-reset `mHasApplied=false`; `prepare` dipanggil tiap `AudioEngine::start` (dengan laju **aktual** stream) termasuk tiap reopen. Yang benar-benar mati hanyalah `BiquadCascade::setSampleRate`.
- **K-2 — "DSPChain/gate mati" — DITOLAK.** Gate default ON; `AudioPipeline::processDSP` → `mDSP.process` hidup; `AudioCallback` memanggil `applyPipeline` di belakang gate. Yang basi hanyalah komentar header (dsp-m37, dsp-m43).
- **K-3 — "EQ band tidak tersambung / `setEqBand` overload salah" — DITOLAK.** Jalur JNI → Kotlin → `EngineManager` → `AudioEngine::setEqBand` (`core/AudioEngine.cpp:359`) → `AudioState::setEqGain` → `EQNode` terverifikasi lengkap.
- **K-4 — "Immersive memakai DSPChain" — DITOLAK.** `processImmersive` tidak memanggil `mDSP`; komentar `core/ImmersiveStage.cpp:89-93` eksplisit: immersive berhenti memakai `DSPChain`. Satu-satunya sisa adalah include + komentar di `ImmersiveStage.h` (DSg-14).

---

## Yang sehat (terverifikasi, jangan dirusak saat perbaikan)

- **Matematika biquad BENAR.** `setPeakingEQ` dan `setLowShelf` sama persis dengan RBJ Audio EQ Cookbook (diverifikasi koefisien-per-koefisien); `setHighShelf` juga cocok RBJ dengan S=Q (kecuali zona NaN, DSP-M7). Harness Track A: DF-II-T vs referensi DF-I maxErr **0,0000058** (presisi float saja); peaking 16 kHz @44,1 kHz → |H(16k)| = 3,9811 (ideal +12 dB = 3,981), |H(1k)| = 1,0010, pole stabil (|a2| = 0,76 < 1, |a1| < 1+a2). Harness Track A T5: `EQProcessor` band 16 kHz +12 dB @44,1 kHz → gain 3,984 di 16 kHz, 1,004 di 1 kHz — **EQ benar-benar memproses di frekuensi yang benar**. Band 16 kHz di 44,1 kHz tidak melewati Nyquist (w0 = 2,28 rad < π).
- **Guard `setPeakingEQ`/`setLowShelf`/`setHighShelf` untuk freq/rate/Q ≤ 0** — return awal, koefisien tetap identity (fail-flat), bukan crash.
- **`EQProcessor::setBandGain` guard nilai-tak-berubah** — trig hanya jalan saat slider benar-benar bergerak; `applyConfig()` tiap buffer tidak membebani audio thread.
- **Rumus limiter benar.** `apply()`: identity bit-exact di bawah 0,98; kontinu + turunan 1 di titik sambung; asimtot 1,0. Perbaikan 2026-10-10 atas `softClip` lama (`x/(1+|x|)`, THD 10% di 0,9) terverifikasi dari rumusnya.
- **Matematika widener benar.** width=1 → identity (L=l, R=r); width=0 → mono; clamp [0,2]. `StereoWidener` mid/side benar (`mid=(l+r)*0.5`, `side=(l-r)*0.5*width`, `l=mid+side`, `r=mid-side`).
- **Parser ketat pada baris filter** (sesuai janji "gagal berisik"): satu baris filter gagal → seluruh preset ditolak (`totalFilterLines != parsedCount`); > 16 filter → error, bukan potong diam-diam; `kMaxFilters` 16 konsisten di `BiquadCascade` dan `HeadphonePresetData` (`AudioTypes.h:116`). `toPresetData` hanya menulis `out` saat sukses.
- **Node koreksi headphone disiplin soal enable.** `prepare()` memanggil `setEnabled(false)` — node tanpa preset tidak mengaku aktif (persis anti-pola "tampak tersedia padahal tidak ada" di `BOILERPLATE_AND_STUBS.md` §2).
- **Dedup config benar sebagai optimasi** (jangan kirim ulang koefisien biquad tiap buffer) — yang salah hanya ia tidak di-reset saat graph di-rebuild (DSP-M1).
- **Jalur imersif terpisah dengan sengaja.** `processImmersive` tidak menyentuh `DSPChain` (EQ tidak bocor ke mode immersive) — keputusan desain yang didokumentasikan (`AudioPipeline.cpp:254-274`).
- **BrainwaveGenerator benar penuh** (harness Track B H6): frekuensi carrier tepat, amplitudo tepat 0.04, fase kontinu antar-buffer (maxDiff 0.0), bypass volume-0 bit-exact, guard null/numFrames/sampleRate.
- **Koefisien RBJ SolfeggioResonator benar** (H5c: pass-through di resonansi sesuai peak gain 0 dB; noise terbatas). Q 0.7–8.0, state per-channel independen (tanpa crosstalk), atomics untuk freq/intensity, koefisien dihitung ulang hanya saat berubah (realtime-safe).
- **SpatialFieldProcessor bypass bit-exact** (H7a: memcmp identik pada w=1/d=0); mono tetap mono pada width 2 (H7b); cross-feed tap asimetris bekerja (H7c: impuls di L muncul di R pada tap 576 (0.16) dan 1200 (0.24)); smoothing satu-pole anti-zipper; priming pertama mencegah sapuan render pertama.
- **HarmonicExciter bypass bit-exact** pada drive 0 dan drive negatif; `setDrive` menghitung cache di setter (bukan per-sample); shaper stateless (reset no-op yang benar).
- **Urutan rantai ImmersiveStage disengaja dan benar:** solfeggio → harmonic → spatial → brainwave (beat ditambahkan terakhir supaya tidak terdistorsi exciter).
- **Dispatch mode bersih:** `AudioPipeline::process()` switch berdasar `processingMode` saja — tidak bergantung pada flag `dspEnabled`/`isImmersiveEnabled` yang mati (kontras dengan bug M6 di `AudioModeManager`).
- **`prepare()` rate-aware:** `mSolfeggio.prepare(sampleRate)` + `mSampleRate` untuk brainwave — koefisien mengikuti laju stream (kecuali tap spatial, dsp-m15).
- **Matematika `FIRFilter` benar.** Konvolusi direct-form dengan circular delay buffer: `out = Σ kernel[i]·x[n−i]`; wraparound `index` dan `mPos` benar; guard kernel kosong (`return input`) benar. Satu-satunya yang benar-benar "nyata" di `convolution/` — sayangnya tidak terjangkau.
- **Rumus window benar.** Hann `0,5·(1−cos(2πi/(N−1)))`, Hamming `0,54−0,46·cos(...)`, Blackman `0,42−0,5·cos(2πi/(N−1))+0,08·cos(4πi/(N−1))`, rectangular `1,0` — semuanya sesuai rumus standar.
- **`BiquadFilter::process` benar.** Direct Form II Transposed RBJ: `y = b0·x + z1; z1 = b1·x − a1·y + z2; z2 = b2·x − a2·y`. Koefisien peaking dan low shelf cocok dengan RBJ cookbook; high shelf cocok dengan RBJ (dengan S sebagai slope — lihat dsp-m1).
- **Struktur SVF Chamberlin benar.** `mF = 2·sin(π·f/fs)` (kompensasi warping yang benar), urutan update `low → high → band` standar. Yang salah hanya validasi parameter dan label resonansi, bukan strukturnya.
- **Bypass ditangani di level graph.** `DSPGraph::process` melewati node yang `!isEnabled()` — jadi `ConvolverNode` yang tidak mengecek `mEnabled` sendiri bukan bug.
- **Dokumen sudah jujur.** `docs/DSP_CHAIN_AUDIT.md:286-296`, `docs/FEATURES.md:48`, `docs/IDEAS.md:209-220` mencatat status belum-disambung-nya konvolusi dengan benar — tidak ada klaim palsu yang perlu dikoreksi di sini.
- **Tidak ada OOB/UB di immersive** (kecuali DSP-M6 inf/NaN): semua akses buffer terjaga (`FFTResonanceAnalyzer` guard `mWritePos < mFFTSize`; tap spatial modulo 8192; exciter loop `i < numFrames`).
- **Tidak ada duplikasi resampling di dsp/** — satu jalur produksi (swr), konsisten dengan audit resampler.
- **CMakeLists meng-glob subdir dsp** (`CMakeLists.txt:78-79` glob `"dsp/*.cpp"` + `"dsp/*/*.cpp"`, include dirs `:208-209` mencakup `dsp dsp/graph dsp/tone dsp/spatial dsp/dynamics dsp/filters dsp/convolution dsp/immersive dsp/headphone`) — file-file mati terkompilasi ke `libpristine-audio.so`; itulah kenapa DSP-M8 (error laten) tidak pernah terlihat: tidak ada TU yang menginstansiasi HPF/LPF.

---

## Verifikasi device

- **Tidak ada untuk temuan laten** — dan memang tidak bisa ada: DSP-M6, DSP-M7 (zona NaN), DSP-M8, DSP-M9, DSP-M10, DSP-M11, DSP-M12, DSP-M13, DSP-M14, DSP-M15 tidak punya perilaku runtime pada APK hari ini (mati/dormant). Satu-satunya yang *bisa* diverifikasi di device untuk DSP-M7 adalah via preset headphone dengan band high-shelf ekstrem (slope > 5 + gain +12 dB) — itu pun membutuhkan preset yang sengaja dibuat ekstrem, bukan preset AutoEQ normal.
- **DSP-M1, DSP-M2, DSP-M3 bisa diverifikasi di device** — lihat DSg-1, DSg-2, DSg-6. DSP-M1 punya skenario nyata di logcat #9 (reopen 07:20:22, 07:23:39, 07:23:52) — tapi logcat #9 tidak merekam setting EQ user (tidak ada EQ aktif yang terlihat), jadi tidak bisa diputuskan dari log lama.
- **DSP-M4/DSP-M5 tidak butuh device** — 0 pemanggil TS adalah fakta kode, bukan perilaku runtime.

---

## Perbaikan — BELUM DIKERJAKAN (catat dulu)

Semua 15 MAJOR belum dikerjakan. Yang paling layak kalau csheva mau, diurutkan dampak:

1. **(a) Perbaiki DSP-M1** — reset `mConfigApplied = false` di `AudioPipeline::prepare()`, atau panggil `mDSP.applyConfig(mConfig)` di akhir `DSPChain::prepare()`. Satu baris, dampak langsung: EQ/koreksi tidak lagi hilang tiap mode toggle / cabut headset / ganti laju. (Verifikasi device: DSg-1.)
2. **(b) Perbaiki DSP-M3** — DC blocker (highpass ~10–20 Hz) setelah shaper `HarmonicExciter`, atau hitung `x² − E[x²]` adaptif. Satu-satunya MAJOR hidup yang meracuni audio di parameter default. (Verifikasi device: DSg-6.)
3. **(c) Perbaiki DSP-M2** — hapus salah satu limiter (paling aman: hapus `Limiter::apply` di `AudioCallback` untuk mode DSP, node sudah melakukannya). (Verifikasi: DSg-2.)
4. **(d) Guard DSP-M7** — clamp argumen sqrt ke `>= 0` di `setHighShelf` (1 baris) + clamp Q/gain high-shelf di `PresetParser`. Murah, menutup satu-satunya jalur NaN yang live via preset.
5. **(e) Guard DSP-M6 + DSP-M10** — clamp atas frekuensi solfeggio (`min(freq, 0.45 × sampleRate)`); clamp `frequency ∈ (0, fs/2)`, `resonance > 0` di SVF. Murah, menutup inf/NaN dan blow-up.
6. **(f) Perbaiki DSP-M8** — implementasikan `setHighPass`/`setLowPass` di `BiquadFilter` (RBJ cookbook, ~20 baris), atau hapus kedua wrapper.
7. **(g) Putuskan nasib konvolusi (DSP-M9)** — isi `IRLoader` + sambung `ConvolverNode` ke `DSPChain` + implementasikan `PartitionedConvolver` untuk IR panjang, atau hapus seluruh subdir `convolution/` (mengikuti pola hapus `DecoderFactory`/`PCMDecoder` di D-M5).
8. **(h) Sapuan dead-code** — hapus `OutputStage` + `DCBlocker` + `CrossfeedProcessor` + `HeadphoneCorrection` lama + `BinauralRenderer` + `FFTResonanceAnalyzer` + `HighPassFilter`/`LowPassFilter`/`StateVariableFilter`/`ToneControl` + `PresetParser::applyPreset` + `DSPConfig::reset()` + `BiquadCascade::overflowed()`/`setSampleRate()` + `Limiter::sanitizeInline`/`softClip()` + `DSPController.kt` (mengikuti pola D-M5; CMakeLists glob-only sehingga penghapusan file aman, build CI menjadi gerbang). Jangan hapus `dsp::LinearResampler`/`StreamResampler` (ranah resampler) atau `createHanningWindow` (dipakai `FFTProcessor`).
9. **(i) Hidupkan parameter immersive (DSP-M4/DSP-M5)** — sambungkan setter solfeggio/brainwave/intensitas/width ke UI (Immersive Lab) atau setidaknya buka gate brainwave dengan default yang masuk akal. Ini pekerjaan UI + JNI, bukan hanya C++.
10. **(j) Hapus duplikasi `sanitizeInline` (DSP-M14)** — satu implementasi bersama yang dipanggil `AudioCallback::sanitizeOutput`.

---

## Reproduksi harness

Semua harness memakai file produksi asli, tanpa mock (file harness di `/tmp` — /tmp tidak dijamin bertahan):

```bash
CPP=~/workspace/projects/audio-delight/android/app/src/main/cpp
# Track A — BiquadFilter + EQProcessor (6 test)
g++ -std=c++17 -O2 -I $CPP/dsp /tmp/test_dsp_biquad.cpp $CPP/dsp/BiquadFilter.cpp $CPP/dsp/EQProcessor.cpp -o /tmp/test_dsp_biquad -lm && /tmp/test_dsp_biquad
# Track B — immersive (H1-H7 + exciter2)
g++ -std=c++17 -O2 -I $CPP/dsp/immersive /tmp/imm_audit/test_immersive.cpp \
  $CPP/dsp/immersive/HarmonicExciter.cpp $CPP/dsp/immersive/SolfeggioResonator.cpp \
  $CPP/dsp/immersive/BrainwaveGenerator.cpp $CPP/dsp/immersive/SpatialFieldProcessor.cpp \
  $CPP/dsp/immersive/FFTResonanceAnalyzer.cpp $CPP/fft/FFTPlan.cpp \
  -o /tmp/imm_audit/test_immersive && /tmp/imm_audit/test_immersive
g++ -std=c++17 -O2 -I $CPP/dsp/immersive /tmp/imm_audit/test_exciter2.cpp \
  $CPP/dsp/immersive/HarmonicExciter.cpp -o /tmp/imm_audit/test_exciter2 && /tmp/imm_audit/test_exciter2
# Track C — compile test HPF/LPF + Biquad + SVF
g++ -std=c++20 -fsyntax-only /tmp/test_hplp.cpp
g++ -std=c++20 -O2 /tmp/test_biquad.cpp $CPP/dsp/BiquadFilter.cpp -o /tmp/test_biquad && /tmp/test_biquad
g++ -std=c++20 -O2 /tmp/test_svf.cpp $CPP/dsp/filters/StateVariableFilter.cpp -o /tmp/test_svf && /tmp/test_svf
# Track D — high shelf NaN
g++ -std=c++17 /tmp/test_shelf.cpp $CPP/dsp/BiquadFilter.cpp -o /tmp/test_shelf && /tmp/test_shelf
```

Hasil ringkas (semua terkonfirmasi di atas): Track A T1 HSC Q=3 ±20 dB → semua koefisien NaN (kontrol Q=0,707 finite); T2 LSC/HSC |H(Fc)| = 1,4125 keduanya, cerminan meleset ~0,44 dB; T3 DF-II-T vs DF-I maxErr 0,0000058; T4 PK 16 kHz @44,1 kHz → 3,9811 (ideal 3,981), pole stabil; T5 EQ 16 kHz +12 dB → 3,984 @16 kHz, 1,004 @1 kHz; T6 ganti +12 → −12 dB tanpa reset → max|out| 1,955 (steady-state ~0,25). Track B H1 DC diam −0.045/−0.135/−0.180 (drive 6/18/24); H3 sine A=1.0 drive 18 → DC +0.135, −2.54 dB, h2/f0 0.404, maxabs 1.0497; H4 A=0.1 → DC −0.132; H5a 528 Hz noise maxabs 0.29; H5b 30000 Hz → **inf/NaN**; H5c 528 Hz sine outRMS 0.3531 ≈ in; H6 carrier 194.5/204.5 Hz, amp 0.04, kontinuitas maxDiff 0.0; H7a bypass bit-exact YA; H7b mono max|L−R| 0.0; H7c cross-feed R[576]=0.16, R[1200]=0.24; A=0.5 drive 18 → h2/f0 0.1752, −1.87 dB; drive 0 bypass bit-exact YA. Track C: HPF/LPF gagal kompilasi (error persis di atas); SVF resonance=0 → dering abadi 0,131087; resonance=−0,5 → −5,4×10¹²; sr=0 → NaN; `createHanningWindow(1)` → NaN; `createHanningWindow(-5)` → throw. Track D: HSC Q=6 +12 dB → semua koefisien −nan; Q=2 +24 dB → b0 −nan; Q=0,707 +6 dB → b0=1.483452 aman.
