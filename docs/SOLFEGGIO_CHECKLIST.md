# Checklist Strategi Mode Solfeggio — 2026-11-11

**Status: LIVING DOC — update saat keputusan berubah.**
Rencana lengkap (fase-fase): `docs/RENCANA_SOLFEGGIO_2026-11-11.md`.

## 1. Identitas mode

- [x] Nama UI: **Solfeggio** (diputuskan 2026-11-11, commit `25462f88` — label saja, tsc 0 error)
- [ ] Nama internal tetap `immersive` (`ProcessingMode::Immersive = 2`, JNI, spec, string mode) — JANGAN di-refactor
- [x] Alasan rename: "Immersive" janjiin spatial ala Atmos; isi mode ini resonansi + exciter + pelebar
- [ ] Mode ini MELAKUKAN: resonansi solfeggio, harmonic exciter, spatial field (widen + ambience), binaural beat (opsional, bila dihidupkan)
- [ ] Mode ini TIDAK MELAKUKAN: bukan Atmos/HRTF, bukan retune A=432, bukan convolver/reverb ruangan (belum)

## 2. Rantai (status per tahap, `core/ImmersiveStage.cpp`)

- [x] SolfeggioResonator — HIDUP (528 Hz, intensitas 0,5; Q eff. 4,35)
- [x] HarmonicExciter — HIDUP (DC offset diperbaiki DSP-M3, harness 12/12 PASS)
- [~] SpatialFieldProcessor — HIDUP SEBAGIAN (depth hidup; width mati dalam praktik — `stereoWidth` selalu 1,0, tanpa pemanggil TS)
- [ ] BrainwaveGenerator — MATI dalam praktik (gate `brainwaveFreq > 0` + default 0 + 0 pemanggil TS); kodenya sendiri TERBUKTI benar
- [ ] BinauralRenderer — STUB (copy mono ke dua kanal); tidak pernah dipanggil
- [ ] FFTResonanceAnalyzer — MATI total (hapus di Fase 5)

## 3. Binaural — dua arti, jangan dicampur

- [ ] Binaural beat = efek psikoakustik (dua carrier beda per telinga, mis. 200 vs 210 Hz → beat 10 Hz) — tahap 4 ImmersiveStage; butuh wiring (Fase 1/2); TIDAK otomatis ikut preset solfeggio
- [ ] Binaural rendering / HRTF = spasialisasi buat headphone — stub; butuh Fase 3; TIDAK ada di DSPChain
- [ ] Onboarding mengiklankan "binaural beat" (`onboarding.tsx:273`) padahal fiturnya mati — perbaiki klaim atau hidupkan fiturnya (Fase 1)

## 4. HRTF vs stereo widener (catatan untuk kerja DSP nanti)

- [ ] Stereo widener (DSPChain `StereoWidener`, `SpatialFieldProcessor`) = mid/side: side diperkuat/dilemahkan; jalan di speaker + headphone; mono-compatible bila width ≤ 1; BUKAN HRTF
- [ ] HRTF = filter per-telinga (ITD/ILD + pinna): headphone-only; butuh input mono atau proses per-kanal; BUKAN widener
- [ ] Jangan sebut widener sebagai "HRTF" / "binaural" di UI, doc, atau komentar
- [ ] HRTF butuh keputusan arsitektur dulu (mono dari mana — downmix vs upmix?) sebelum implementasi (Fase 3)

## 5. Preset solfeggio (frekuensi resonator)

- [ ] Daftar: 174, 285, 396, 417, 432, 528, 639, 741, 852, 963 Hz
- [ ] 432 Hz: OPEN — preset resonator (gampang) vs retune lagu ke A=432 (pitch shift, fitur lain, belum ada kodenya). Jangan bangun preset 432 sebelum arti ini diputuskan.
- [ ] Preset gabungan (opsional): "Tidur" = 432 Hz + Theta 6 Hz; "Fokus" = 528 Hz + Beta 20 Hz — beat EKSPLISIT di preset, bukan implisit

## 6. Keputusan (status)

- [x] Tetap native, bukan library luar (JamesDSP dsb) — diputuskan 2026-11-11
- [x] Rename UI → Solfeggio — diputuskan 2026-11-11
- [ ] Arah produk: psikoakustik / spasial / keduanya — BELUM
- [ ] Filosofi kontrol: Intensitas master + frekuensi/width terpisah, atau semua dipisah — BELUM
- [ ] Eksekusi: Fase 1 dulu vs lompat Fase 3 — BELUM
- [ ] 432 Hz: resonator vs retune — BELUM

## 7. Verifikasi device (per tahap)

- [ ] Solfeggio: ganti frekuensi preset → resonansi terdengar berubah (tanpa glitch — parameter dibaca per buffer, live switch)
- [ ] Brainwave: beat terdengar di headphone sesuai frekuensi yang dipilih; tidak ada efek di speaker
- [ ] Width: citra melebar tanpa merusak mono (putar ke mono: tidak boleh hilang/berubah drastis)
- [ ] Preset: ganti preset saat lagu jalan → karakter berubah langsung, tanpa restart stream
- [ ] Catatan: rename UI ini JS-only, tidak ikut build Dev run 42943243342 (head 633049d4) — dicek via Termux sync + Metro, bukan APK baru

## 8. Yang TIDAK dilakukan

- [ ] Ganti mesin DSP dengan library luar
- [ ] HRTF sebelum Fase 1
- [ ] Konvolusi sebelum audit fft
- [ ] Refactor nama internal Immersive → Solfeggio
