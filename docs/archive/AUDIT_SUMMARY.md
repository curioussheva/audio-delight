# AUDIT SUMMARY — PristineAudio (audio-delight)

Ringkasan akhir audit second-opinion (ronde 1–17 + Batch 18), per 2026-11-16.
HEAD: `da2cdb09` (branch `fix/ffmpeg-disable-doc`).
Sumber: pesan akhir pengirim (Batch 18) + verifikasi independen terhadap kode
HEAD (`~/workspace/audit-batch18-2026-11-16/VERIFIKASI.md`, 48 sub-klaim:
BENAR 34, SEBAGIAN 10, SALAH 2, BELUM TERBUKTI 2).

Aturan baca: status "selesai" = terverifikasi di kode HEAD (bukan klaim).
Yang belum dibuktikan di device ditandai `[device]`.

## 1. Selesai dan terverifikasi

- **Konkurensi engine:** disconnect handler sekali pasang, `isRunning()` jujur,
  `onDeviceRemoved` lock-free, reopen dengan validasi device + fallback +
  idle-close, advance worker permanen + generation counter (`loadGen_`),
  EOF-idle, CAS di `PCMQueue`, seqlock + `PresetRead`.
- **Keselamatan numerik:** klem di `AudioState`, `designOk` + Q-form +
  koefisien `double` (BiquadFilter), FPCR flush-to-zero, sanitasi per node
  dan di callback.
- **Kebenaran DSP:** HighShelf (klem 0.49·sr wajib), smoothing EQ,
  widener bit-exact, Solfeggio aditif, tap Spatial berskala laju, exciter DC,
  koreksi headphone atomik (B15-H1).
- **Android:** service di command thread (`pristine-playback-cmd`), wake lock
  berbatas (60 mnt + re-arm 10 mnt), manifes dibersihkan, sampul tanpa
  balapan, 16 KB, FFmpeg wajib.
- **Antrean:** `startIndex` ter-plumbing 5 lapis (B17-P-b), shuffle,
  in-flight lock (B17-P-a), slice 50 lagu DIHAPUS (N1, `da2cdb09`).

## 2. Ronde perbaikan Batch 18 (2026-11-16, HEAD 723f4439 → da2cdb09)

| Commit | Item | Keterangan |
|---|---|---|
| `d2bcbd0e` | C4.2 + C4.1 | Timer basi `playSong`: Map `_playInFlightTimers` + `clearTimeout` di `finally`; komentar `setAudioMode` dibedakan (live vs reopen). Tanpa angka jeda. |
| `fcc05f62` | C2 | SolfeggioResonator: Q dipatok 4.0 (koefisien hanya saat frekuensi berubah); wet one-pole 0.002/sampel; bypass hanya setelah wet < 1e-4. Harness `test_solfeggio_sweep.cpp` 8/8. CATATAN: karakter di intensity 1.0 berubah (Q 8→4) — butuh verdict telinga `[device]`. |
| `330836cb` | C3.1/C3.2 | Teks bit-perfect jujur: mixer Android di fallback + fade lengkap (10 ms awal/akhir/seek/resume, 15 ms pause); "tanpa pemrosesan" → "tanpa DSP" di `modeInfo`/`equalizer`/`settings`. |
| `17480266` | C1 | Guard dedup `applyImmersiveCorrectionConfig()` (samakan jalur DSP). Potongan pengirim TIDAK dipakai (tidak sound — membuka kembali lubang B15-H1). Harness `test_immersive_correction.cpp` 9/9. |
| `da2cdb09` | N1 | Hapus slice `library.tsx:526-530`; antrean = seluruh daftar terfilter. `LAST_QUEUE_IDS` ~15 KB untuk 1195 lagu. |

Verifikasi ronde: tsc 0, jest 426/426. C2/C1 harness dijalankan ulang dari
file yang di-commit. Build dev menyusul (lihat §5).

## 3. Koreksi terhadap pengirim (dicatat supaya tidak terulang)

- `reach.py` TIDAK ada di pesan Batch 12 — yang ada hanya output + deskripsi
  metode. Jangan suruh simpan file yang tidak ada isinya.
- Potongan perbaikan C1 tidak sound (lihat §2, baris C1).
- Snippet C2 punya typo kritis `y2 = y1; y0;` (harus `y1 = y0;`).
- Angka "float DF-I Q 4–8 aman, kesalahan ~0,005%" BELUM TERBUKTI — item
  parkir I1-double jangan ditutup sebelum harness numerik ada.
- Jeda reopen bit-perfect "~100–500 ms" BELUM TERBUKTI — jangan tulis angka
  ke UI/komentar sebelum diukur di device.
- Validasi P1 di APK 43703184569 BELUM TERJADI menurut catatan (daftar tes
  masih terbuka di PR §C7) — bukan bukti penutup.
- Default mode BUKAN keputusan terbuka — sudah DSP (`AudioState.h:669`).

## 4. Perlu keputusan (terbuka)

- Jalur bit-perfect resmi Android 14 (`setPreferredMixerAttributes`, USB-only;
  riset Batch 13 W3 selesai; rekomendasi HDMI non-exclusive sementara).
- Limiter lookahead + preamp otomatis EQ.
- C3.3: gate laju/jalur pada label bit-perfect (duplikat M3 — butuh keputusan
  definisi/label + keadaan "tidak dapat diverifikasi" untuk file tanpa laju).

## 5. Parkir sadar (jangan dikerjakan tanpa putusan)

- **D1 `DecoderWorker` — FORBIDDEN** (sejak Batch 7). Jangan kerjakan patch
  lost-wakeup-nya.
- S1 identitas stream di `onErrorAfterClose` (C-K1, P1).
- Fallback OpenSLES mengabaikan `deviceId` (masih ada di HEAD).
- Aliasing exciter di 44,1/48 kHz (Batch 15 I2: oversampling 2× tidak
  dikerjakan).
- Stub `BinauralRenderer` / `FFTResonanceAnalyzer` (inventaris dead-code).
- Fade-in terkonsumsi senyap setelah seek (`framesSinceLoad_`, Batch 10 W2 —
  fix yang benar: gate pada `readSamples`/`outputSamples > 0`).
- Dead-code: inventaris di PR §C7 — dikumpulkan dulu, dianalisis belakangan,
  tidak ada yang dihapus tanpa putusan.

## 6. Risiko residual (hanya bisa dibuktikan di perangkat)

- Durasi reopen + ANR notifikasi di FLAC hi-res `[device]`.
- Klik saat toggle koreksi headphone atau ganti mode `[device]`.
- Perilaku exclusive vs HDMI/USB nyata `[device]`.
- Keselarasan 16 KB `libRNQuickSQLite` pada APK final `[device]`.
- Verdict telinga C2 (karakter Solfeggio intensity 1.0, Q 8→4) + I1/I2/I3/M5
  yang masih tertunda `[device]`.

## 7. Tes device ronde Batch 18 (APK dari HEAD da2cdb09)

- Tap ulang lagu yang sama < 20 detik → tidak ada dua `playSong` bersamaan.
- Geser slider intensitas Solfeggio 0→1→0 → tanpa zipper/klik; dengar
  karakter di intensity 1.0 (Q 8→4) vs sebelumnya.
- Toggle koreksi headphone di mode Immersive → tanpa klik; preset gagal
  tidak mematikan koreksi yang sedang jalan.
- Label bit-perfect: baca note aktif + fallback (mixer Android + fade);
  keluar/masuk bit-perfect → reopen terasa, tanpa angka jeda di UI.
- Tap lagu → Previous bisa mundur penuh; tap lagu di ujung daftar dengan
  Repeat Off → berhenti di lagu terakhir.
