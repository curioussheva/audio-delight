# Rencana Mode Immersive — 2026-11-11

**Status: RENCANA — belum dieksekusi.** Dokumen ini rencana, bukan laporan hasil.
Sumber: `docs/AUDIT_NATIVE_CPP_DSP_2026-11-11.md` (DSP-M4, DSP-M5, DSP-M6, DSP-M15),
ronde perbaikan dsp 2026-11-11 (DSP-M3 selesai, commit `1fd288b2`).

## 1. Keadaan sekarang (grounded di kode)

Rantai mode Immersive (`core/ImmersiveStage.cpp`, `process()`):
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
Layar Equalizer secara eksplisit bilang kontrolnya tidak berlaku di Immersive
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
Tujuan: mode Immersive berhenti jadi preset beku. Semua yang dikerjakan di sini
sudah ada kodenya — yang hilang hanya wiring + UI + satu guard.

- **Guard dulu (DSP-M6):** clamp frekuensi solfeggio ke `min(freq, 0,45 × sampleRate)`
  di `SolfeggioResonator::setFrequency` (mSampleRate sudah jadi member via
  `prepare()`). WAJIB sebelum slider frekuensi dibuka — user yang geser ke 30 kHz
  akan membunuh mode dengan NaN.
- **Wiring TS:** panggil setter yang sudah ada — `setSolfeggioFreq`,
  `setBrainwaveFreq`, `setResonanceIntensity`. Untuk width: tambah deklarasi
  `setStereoWidth` di spec TS + periksa wrapper Kotlin (`NativeDSPModule.kt:133-166`
  membagi 1000 sebelum `setNativeStereoWide` — samakan skalanya dulu).
- **UI:** panel Immersive di layar Equalizer, di bawah switcher mode, hanya tampil
  saat mode Immersive aktif: Solfeggio (preset 396/417/528/639/741/852 Hz + slider
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

### Fase 3 — Binaural / HRTF beneran (DSP-M15)
Tujuan: ganti stub `BinauralRenderer` dengan rendering spasial nyata.

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

### Fase 5 — Polish & bersih-bersih
- Hapus `FFTResonanceAnalyzer` (mati total, DSP-M15) dan `BinauralRenderer` lama
  bila diganti Fase 3.
- Limiter jalur Immersive: sudah 1× via callback (fix DSP-M2, `412b0968`) —
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

1. Arah produk (§2.1): psikoakustik saja, spasial saja, atau dua-duanya?
2. Filosofi kontrol (§2.2): Intensitas tetap master + frekuensi/width terpisah,
   atau semua kontrol dipisah?
3. Eksekusi: Fase 1 dulu, atau lompat ke Fase 3?
