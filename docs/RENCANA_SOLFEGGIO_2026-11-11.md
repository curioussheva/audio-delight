# Rencana Mode Solfeggio — 2026-11-11

**Status: RENCANA — belum dieksekusi.** Dokumen ini rencana, bukan laporan hasil.
Sumber: `docs/AUDIT_NATIVE_CPP_DSP_2026-11-11.md` (DSP-M4, DSP-M5, DSP-M6, DSP-M15),
ronde perbaikan dsp 2026-11-11 (DSP-M3 selesai, commit `1fd288b2`).

## Keputusan 2026-11-11 (diputuskan csheva)

- **Nama UI: Solfeggio.** Label tampil diganti di 4 file TS (`equalizer.tsx`,
  `settings.tsx`, `onboarding.tsx`, `player/index.tsx`), commit `25462f88`,
  tsc 0 error, JS-only (tidak butuh rebuild — sync Termux + Metro).
  Nama INTERNAL tetap `immersive` (`ProcessingMode::Immersive = 2`, JNI
  `setNativeImmersiveEnabled`, spec `setImmersiveEnabled`, string mode
  `"immersive"`) — jangan di-refactor. Di dokumen ini, "Solfeggio" = nama
  produk/UI, "Immersive" yang tersisa = identifier kode.
- **DSP nanti: pastikan HRTF vs stereo widener.** Catatan untuk kerja DSP
  berikutnya (bukan sekarang): StereoWidener (DSPChain) dan SpatialFieldProcessor
  adalah pelebar mid/side — jalan di speaker + headphone, mono-compatible bila
  width ≤ 1, BUKAN HRTF. HRTF adalah filter per-telinga (ITD/ILD + pinna),
  headphone-only, butuh input mono atau proses per-kanal. Jangan sebut widener
  sebagai "HRTF"/"binaural" di UI, doc, atau komentar. HRTF butuh keputusan
  arsitektur dulu (mono dari mana?) sebelum implementasi — lihat Fase 3.
- **432 Hz: OPEN.** Dua arti, belum diputuskan: (a) preset frekuensi resonator
  432 Hz (tinggal tambah ke daftar preset — gampang); (b) retune lagu ke A=432
  (pitch shift seluruh lagu — fitur lain, rantai sekarang tidak punya pitch
  shifter). Jangan bangun preset 432 sebelum arti ini diputuskan.
- **Checklist strategi:** `docs/SOLFEGGIO_CHECKLIST.md` (dibuat 2026-11-11).
- **Arah produk: PSIKOAKUSTIK (2026-11-11).** Widening + HRTF urusan mode DSP,
  bukan Solfeggio — skip di Solfeggio kalau mahal. `SpatialFieldProcessor` yang
  sudah ada tetap; HRTF baru tidak dibangun untuk Solfeggio.
- **432 Hz: RETUNE (2026-11-11).** Bukan preset resonator — yang diharapkan user
  adalah lagu di-retune ke A=432. Desain di "Fase R" di bawah; pendekatan
  menunggu pilihan csheva (phase vocoder vs tape-style).

## 1. Keadaan sekarang (grounded di kode)

Rantai mode Solfeggio (`core/ImmersiveStage.cpp`, `process()`):
`Solfeggio → Harmonic → Spatial → Brainwave`. `BinauralRenderer` TIDAK aktif
(member + `reset()` saja, `ImmersiveStage.h`). Mode ini hari ini adalah **preset beku**:
user hanya bisa memilih modenya, tidak bisa mengubah apa pun di dalamnya.

| Tahap | Status | Default | Bukti |
|---|---|---|---|
| SolfeggioResonator | HIDUP | 528 Hz, intensitas 0,5 (Q eff. 4,35) | koefisien RBJ terverifikasi harness; `setFrequency` hanya clamp bawah (`std::max(20.0f, hz)`, `SolfeggioResonator.cpp:16`) — DSP-M6: frekuensi > Nyquist → inf/NaN |
| HarmonicExciter | HIDUP | drive = intensitas × 12 = 6 dB | DSP-M3 (DC offset) **SELESAI diperbaiki** 2026-11-11, harness 12/12 PASS |
| SpatialFieldProcessor | HIDUP sebagian | width 1,0 (netral), depth = intensitas × 0,4 | width HIDUP sebagai kode (mid/side + ambience 3 tap), tapi **mati dalam praktik**: `stereoWidth` selalu 1,0 karena tidak ada pemanggil TS untuk `setStereoWide` (JNI ada, `NativeDSPModule.cpp:81-92`, deklarasi spec TS TIDAK ada); depth hidup |
| BrainwaveGenerator | MATI dalam praktik | 0,0 Hz | gate `params.brainwaveFreq > 0.0f` + default 0,0 + 0 pemanggil TS (DSP-M4). Generatornya sendiri TERBUKTI benar (carrier 194,5/204,5 Hz untuk beat 10 Hz, amplitudo tepat 0,04, kontinuitas fase) |
| BinauralRenderer | STUB | — | `process()` copy mono ke dua kanal (DSP-M15); tidak pernah dipanggil |
| FFTResonanceAnalyzer | MATI total | — | `getDominantFrequency()` selalu 0,0; 0 referensi (DSP-M15) |

**Sisi TS/UI:** UI hanya memilih mode (`settings.tsx`, `equalizer.tsx`, `onboarding.tsx`).
Layar Equalizer secara eksplisit bilang kontrolnya tidak berlaku di Solfeggio
(`equalizer.tsx:186-191, 493-494`). Spec TS mendeklarasikan `setSolfeggioFreq` /
`setBrainwaveFreq` / `setResonanceIntensity` (`src/specs/NativeDSPModule.ts:57-59`)
dan wrapper Kotlin-nya ada (`NativeDSPModule.kt:351-361`) — **0 pemanggil TS**
(DSP-M5). Rantai JNI→EngineManager→AudioEngine→AudioState lengkap dan bekerja;
yang hilang hanya pemanggilnya. Persistensi mode/EQ memakai AsyncStorage
(`audio_mode_preference`, `audioConfig.ts:329-345`) — parameter immersive bisa
mengikuti pola yang sama.

**Satu knob mengendalikan segalanya (filosofi sekarang):** `resonanceIntensity`
mengikat drive exciter (×12 dB), volume brainwave, dan depth spasial (×0,4).
Satu slider = seluruh karakter mode. Ini sengaja (lihat komentar di
`ImmersiveStage::process`), bukan kecelakaan — lihat §2 keputusan 2 sebelum
mengubahnya.

## 2. Keputusan produk (dipilih dulu, sebelum eksekusi)

1. **Arah:** (a) *psikoakustik* — solfeggio + binaural beat, identitas mode saat ini;
   (b) *spasial* — mendekati Dolby Atmos (HRTF, virtual surround); atau (c) keduanya.
   Rekomendasi: Fase 1 dulu (murah, bikin mode ini jadi fitur beneran), baru putuskan
   Fase 3 — jangan bangun HRTF sebelum parameter yang sudah ada bisa diubah user.
2. **Filosofi kontrol:** pertahankan satu knob Intensitas sebagai karakter master,
   dan buka frekuensi (solfeggio, brainwave) + width sebagai pilihan terpisah?
   Atau pisahkan semua kontrol (drive, volume beat, depth masing-masing slider)?
   Rekomendasi: opsi pertama — frekuensi adalah *pilihan*, bukan *jumlah*, jadi
   wajar dipisah; jumlah (drive/volume/depth) tetap diikat ke Intensitas.
3. **Urutan eksekusi:** Fase 1 dulu, atau lompat ke Fase 3? (Lihat §4.)

## 3. Fase-fase

### Fase 1 — Buka parameter yang sudah ada (DSP-M4, DSP-M5 + guard DSP-M6)
Tujuan: mode Solfeggio berhenti jadi preset beku. Semua yang dikerjakan di sini
sudah ada kodenya — yang hilang hanya wiring + UI + satu guard.

- **Guard dulu (DSP-M6):** clamp frekuensi solfeggio ke `min(freq, 0,45 × sampleRate)`
  di `SolfeggioResonator::setFrequency` (mSampleRate sudah jadi member via
  `prepare()`). WAJIB sebelum slider frekuensi dibuka — user yang geser ke 30 kHz
  akan membunuh mode dengan NaN.
- **Wiring TS:** panggil setter yang sudah ada — `setSolfeggioFreq`,
  `setBrainwaveFreq`, `setResonanceIntensity`. Untuk width: tambah deklarasi
  `setStereoWidth` di spec TS + periksa wrapper Kotlin (`NativeDSPModule.kt:133-166`
  membagi 1000 sebelum `setNativeStereoWide` — samakan skalanya dulu).
- **UI:** panel Solfeggio di layar Equalizer, di bawah switcher mode, hanya tampil
  saat mode Solfeggio aktif: Solfeggio (preset 396/417/528/639/741/852 Hz + slider
  20–2000 Hz), Intensitas 0–1, Brainwave (mati / Delta 2 / Theta 6 / Alpha 10 /
  Beta 20 / Gamma 40 Hz), Width 0–2.
- **Persist:** kunci AsyncStorage baru mengikuti pola `audio_mode_preference`;
  muat di `_layout.tsx` bersama mode tersimpan.
- **Verifikasi device:** solfeggio terdengar beresonansi saat frekuensi diganti;
  brainwave terdengar (headphone, lihat Fase 2); width melebar tanpa merusak mono
  (cek: putar ke mono, tidak boleh hilang/berubah drastis).
- **Estimasi:** kecil — 1 ronde (JS/TS + 1 guard native → 1 build Dev gabungan).

### Fase 2 — Brainwave yang benar (DSP-M4, lanjutan)
Tujuan: binaural beat berfungsi sebagaimana mestinya, bukan sekadar hidup.

- Binaural beat hanya bekerja di **headphone** (dua carrier berbeda per telinga;
  di speaker kedua carrier tercampur di udara dan beat-nya hilang). Opsi: gate
  brainwave ke output headphone (app sudah bisa deteksi cabut/colok device, M4
  terbukti logcat #9) atau minimal peringatan di UI ("efek ini hanya terasa di
  headphone").
- Volume beat tetap 0,04 (terverifikasi) — opsi: slider volume beat terpisah
  (keputusan §2.2).
- **Verifikasi device:** dengar beat dengan headphone (nada berdenyut sesuai
  frekuensi yang dipilih); konfirmasi tidak ada efek di speaker.
- **Estimasi:** kecil — bisa digabung ke Fase 1 bila mau.

### Fase 3 — Binaural / HRTF beneran (DSP-M15) — DIPINDAH KE MODE DSP (2026-11-11)
Tujuan: ganti stub `BinauralRenderer` dengan rendering spasial nyata.

**Keputusan 2026-11-11: fase ini BUKAN bagian rencana Solfeggio lagi.**
Widening + HRTF urusan mode DSP; skip di Solfeggio kalau mahal. Isi fase di
bawah dipertahankan sebagai catatan untuk kerja mode DSP nanti, bukan untuk
dieksekusi di sini.

- **Tiga opsi implementasi:** (a) ITD + ILD + EQ pinna sederhana (~100 baris,
  tanpa file data, tanpa konvolusi); (b) HRIR SOFA + konvolusi (butuh convolver
  DSP-M9 dulu + file HRIR berlisensi — periksa lisensinya sebelum bundel);
  (c) Resonance Audio / Steam Audio (Apache 2.0, legal, tapi berat dan
  dirancang untuk game/VR, bukan musik).
- **Keputusan arsitektur (bukan implementasi):** renderer butuh input MONO,
  rantai sekarang stereo penuh. Dari mana mono-nya? Downmix stereo → mono
  (kehilangan citra stereo asli) atau upmix virtual-surround (butuh cross-talk
  cancellation + HRTF per kanal)? Diputuskan di awal fase, bukan di tengah.
- **Gate headphone:** HRTF di speaker = salah secara konsep; butuh gate yang sama
  dengan Fase 2.
- **ROI:** terendah untuk music player — sebagian besar pendengar tidak akan
  membedakannya dari pelebaran spasial yang sudah ada. **Paling akhir.**
- **Estimasi:** besar, butuh riset + keputusan desain. Jangan mulai sebelum Fase 1.

### Fase 4 — Konvolusi / ruang (DSP-M9, opsional)
Tujuan: reverb ruang ala IRS-nya ViPER.

- Partitioned convolver di atas `FFTPlan` yang sudah ada + `IRLoader` yang
  benar-benar membaca file (sekarang stub yang mengabaikan path).
- Preset ruang (small / hall / plate): IR bundel (lisensi!) atau IR sintetis
  (noise-decay, tanpa masalah lisensi).
- **Dependensi:** audit section fft dulu (belum jalan) — jangan mulai fase ini
  sebelum fft diaudit.
- **Estimasi:** sedang–besar.

### Fase R — Retune A=432 (DIPUTUSKAN 2026-11-11 — dikejar)

Tujuan: lagu di-retune ke A=432 (Verdi tuning, −31,8 sen) — pitch berubah,
tempo tetap. Ini yang diharapkan user, bukan preset resonator.

- **Pendekatan A (direkomendasikan): phase vocoder.** STFT di atas `FFTPlan`
  yang sudah ada (`fft/FFTPlan.h`: `forward()`/`inverse()` — FFT beneran,
  bukan kissfft; dipakai immersive). Pitch shift via propagasi fase; frame
  masuk = frame keluar (frame-count preserving) → clock posisi (P-M8, hitung
  frame input) + kontrol speed (WSOLA) tidak terganggu. Latensi ~1–2 jendela
  (~40–80 ms). Kelas baru (`playback/PitchShifter` atau `dsp/`), pola
  push/pull + reset di bawah `clearing_` seperti `PlaybackRateProcessor`
  (WSOLA, P-M9); wiring TS → Kotlin → JNI mirror rantai `setPlaybackRate`;
  harness standalone (pola WSOLA 24/24) atas `FFTPlan` + kelas baru.
  Perkiraan: 1–2 ronde. Audit section fft boleh jalan paralel — harness yang
  membuktikan, bukan audit.
- **Pendekatan B (tidak direkomendasikan): tape-style resample.** Lipat rasio
  440/432 ke swr decoder (`FFmpegDecoder::setupResampler`,
  `swr_alloc_set_opts2` dengan `targetSampleRate`). Kode kecil, tapi: pitch +
  tempo berubah bareng (durasi +1,9% — bukan yang diharapkan user); jumlah
  frame berubah → clock posisi + logika rate D-M1/D-M2 (domain frame =
  `targetSampleRate`) kacau; berantem dengan kontrol speed WSOLA. Dua kontrol
  pitch/tempo yang saling tumpang tindih.
- **Rumah kontrol:** level player, sibling kontrol speed di
  `PlaybackController::render` (bypass di rasio 1,0 = A=440); UI picker tuning
  di panel Solfeggio; berlaku di mode DSP + Solfeggio, FORCED OFF di
  bit-perfect (retune = processing). Urutan rantai: pitch dulu, baru tempo
  (WSOLA) — keduanya kontrol ortogonal yang independen.
- **Preset tuning:** Standar A=440 / Verdi A=432 / custom sen (±100 sen);
  rasio = 2^(sen/1200).

### Fase 5 — Polish & bersih-bersih
- Hapus `FFTResonanceAnalyzer` (mati total, DSP-M15) dan `BinauralRenderer` lama
  bila diganti Fase 3.
- Limiter jalur Solfeggio: sudah 1× via callback (fix DSP-M2, `412b0968`) —
  tidak ada kerjaan, dicatat saja. Exciter bisa mendorong output > 0 dBFS
  (dsp-m18, maxabs 1,0497) — limiter callback menangkapnya.
- DC: selesai (DSP-M3). Tidak ada kerjaan.

## 4. Urutan yang diusulkan

**Fase 1 → tes device → Fase 2 (boleh gabung Fase 1) → putuskan Fase 3 vs Fase 4
→ Fase 5 di akhir.**

Yang TIDAK dilakukan di rencana ini: ganti mesin DSP dengan library luar
(JamesDSP dsb — lihat jawaban strategi 2026-11-11: tetap native); HRTF sebelum
Fase 1; konvolusi sebelum audit fft.

## 5. Keputusan yang dibutuhkan dari csheva

1. Arah produk (§2.1): ~~psikoakustik saja, spasial saja, atau dua-duanya?~~ → **PSIKOAKUSTIK** (diputuskan 2026-11-11).
2. Filosofi kontrol (§2.2): Intensitas tetap master + frekuensi/width terpisah,
   atau semua kontrol dipisah?
3. Eksekusi: Fase 1 dulu, atau lompat ke Fase 3? → Fase 3 (HRTF) PINDAH ke mode DSP; yang dikejar sekarang **retune (Fase R)** — pendekatan A vs B menunggu pilihan.
