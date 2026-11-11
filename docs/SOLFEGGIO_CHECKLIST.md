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

- [x] KEPUTUSAN 2026-11-11: widening + HRTF urusan mode DSP, bukan Solfeggio — skip di Solfeggio kalau mahal. `SpatialFieldProcessor` yang sudah ada di rantai Solfeggio TETAP (murah, sudah jadi); yang tidak dibangun untuk Solfeggio = HRTF baru / widening baru. Kerja spasial lanjutan pindah ke mode DSP.

- [ ] Stereo widener (DSPChain `StereoWidener`, `SpatialFieldProcessor`) = mid/side: side diperkuat/dilemahkan; jalan di speaker + headphone; mono-compatible bila width ≤ 1; BUKAN HRTF
- [ ] HRTF = filter per-telinga (ITD/ILD + pinna): headphone-only; butuh input mono atau proses per-kanal; BUKAN widener
- [ ] Jangan sebut widener sebagai "HRTF" / "binaural" di UI, doc, atau komentar
- [ ] HRTF butuh keputusan arsitektur dulu (mono dari mana — downmix vs upmix?) sebelum implementasi (Fase 3)

## 5. Preset solfeggio (frekuensi resonator)

- [ ] Daftar: 174, 285, 396, 417, 432, 528, 639, 741, 852, 963 Hz
- [x] 432 Hz: DIPUTUSKAN 2026-11-11 — RETUNE (bukan preset resonator). Yang diharapkan user = lagu di-retune ke A=432. Desain: lihat §9 (Retune). Preset resonator 432 TIDAK dibangun.
- [ ] Preset gabungan (opsional): "Tidur" = 432 Hz + Theta 6 Hz; "Fokus" = 528 Hz + Beta 20 Hz — beat EKSPLISIT di preset, bukan implisit

## 6. Keputusan (status)

- [x] Tetap native, bukan library luar (JamesDSP dsb) — diputuskan 2026-11-11
- [x] Rename UI → Solfeggio — diputuskan 2026-11-11
- [x] Arah produk: PSIKOAKUSTIK — diputuskan 2026-11-11 (spasial tetap ada sebagai widening dasar; HRTF/widening lanjutan = urusan mode DSP)
- [x] Widening/HRTF → mode DSP, skip di Solfeggio kalau mahal — diputuskan 2026-11-11
- [ ] Filosofi kontrol: Intensitas master + frekuensi/width terpisah, atau semua dipisah — BELUM
- [ ] Eksekusi: Fase 1 dulu vs lompat Fase 3 — BELUM
- [x] 432 Hz: RETUNE — diputuskan 2026-11-11 (kejar retune, itu yang diharapkan user)

## 7. Verifikasi device (per tahap)

- [ ] Solfeggio: ganti frekuensi preset → resonansi terdengar berubah (tanpa glitch — parameter dibaca per buffer, live switch)
- [ ] Brainwave: beat terdengar di headphone sesuai frekuensi yang dipilih; tidak ada efek di speaker
- [ ] Width: citra melebar tanpa merusak mono (putar ke mono: tidak boleh hilang/berubah drastis)
- [ ] Preset: ganti preset saat lagu jalan → karakter berubah langsung, tanpa restart stream
- [ ] Catatan: rename UI ini JS-only, tidak ikut build Dev run 42943243342 (head 633049d4) — dicek via Termux sync + Metro, bukan APK baru

## 9. Retune A=432 (DIPUTUSKAN 2026-11-11 — dikejar)

- [x] Desain: **A. Phase vocoder DIPILIH csheva 2026-11-11** (B tape-style ditolak). Koreksi dari harness: yang benar DUA tahap (time-stretch sebesar S + resampler kubik step S); satu tahap skala-fase salah. Lihat rencana Fase R.
- [x] Implementasi PitchShifter + harness 12/12 + ASan bersih (commit 3396957a).
- [x] Wiring lengkap controller→JNI→Kotlin→TS + UI tuning di Settings (commit a5f0c887, tsc 0).
- [x] Build Dev run 42949761208 SUCCEEDED 2026-11-11 ~10:19 WIB (APK 224.073.730 byte, SHA256 747dda80..., .so 407.784 byte).
- [ ] Verifikasi device: dengar 432 (pitch turun, tempo tetap); bit-perfect mematikan tuning.
- [x] Rumah kontrol: level player (sibling kontrol speed di `PlaybackController::render`, bypass di rasio 1.0 = A=440); UI picker tuning di Settings (panel Solfeggio Fase 1 belum ada — picker ditaruh di Settings sebelah Playback Speed, sibling-nya); berlaku di mode DSP + Solfeggio, FORCED OFF di bit-perfect (gate native `setPitchAllowed`).
- [ ] Preset tuning: Standar A=440 / Verdi A=432 (−31,8 sen) / custom sen (±100 sen); rasio = 2^(sen/1200).
- [ ] Dependensi: harness standalone atas `FFTPlan` + `PitchShifter` baru (pola WSOLA 24/24); audit section fft boleh jalan paralel — pitch shifter tidak menunggu audit selesai, harness-nya yang membuktikan.
- [ ] Interaksi: speed (WSOLA, tempo) × retune (pitch) = kontrol ortogonal, independen — urutan: pitch dulu, baru tempo.

## 8. Yang TIDAK dilakukan

- [ ] Ganti mesin DSP dengan library luar
- [ ] HRTF sebelum Fase 1
- [ ] Konvolusi sebelum audit fft
- [ ] Refactor nama internal Immersive → Solfeggio
- [ ] Preset resonator 432 Hz (diganti retune — keputusan 2026-11-11)
- [ ] HRTF untuk mode Solfeggio (urusan mode DSP)
