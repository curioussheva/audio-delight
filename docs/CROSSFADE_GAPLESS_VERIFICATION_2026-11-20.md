# Crossfade + Verifikasi Gapless — 2026-11-20

Item 5 dari 8 usulan deep insight (§6). Yang dibangun: setting crossfade
0–12 dtk. Yang diverifikasi: klaim gapless decoder vs perilaku nyata di
batas lagu. Vonis jujur di bawah — **gapless TIDAK terbukti di kode**;
ada celah nyata yang harus diukur di device.

## 1. Yang ditemukan saat verifikasi (bukan asumsi laporan)

### 1.1 `FadeEngine::crossfade()` sudah ada — tapi dead code

`android/app/src/main/cpp/playback/FadeEngine.cpp` punya
`crossfade(out, in, output, ...)` yang benar (mix `out*gOut + in*gIn`,
guard anti-clipping bila kurva kosong, kurva Linear/Log/Exp/S-curve).
Tapi **nol pemanggil di seluruh `cpp/`** — grep `crossfade` hanya
ketemu definisi + header. Yang hidup hari ini:

- fade-in awal lagu: 300 ms (processing) / 10 ms anti-klik (bit-perfect);
- fade-out ekor lagu: 500 ms / 10 ms, dipicu `applyTrackFades()` saat
  `decoderFinished_` dan sisa antrean ≤ durasi kurva;
- fade-out pause: 15 ms (`pauseFade_`, PB6-W4).

Tidak ada setting crossfade di JS maupun native sebelum ronde ini.

### 1.2 `supportsGapless = true` adalah klaim tanpa pemakai

`FFmpegDecoder::getCapabilities()` (`decoder/FFmpegDecoder.cpp:708`)
mengembalikan `supportsGapless = true`, tapi `getCapabilities()` **tidak
punya pemanggil** di mana pun — tidak ada jalur kode yang membaca flag
itu, dan tidak ada pemangkasan encoder delay/priming di mana pun
(tidak ada penanganan `skip_samples`, priming swr hanya dibahas sebagai
ukuran buffer di `FFmpegDecoder.cpp:407`). Konsekuensi:

- **FLAC/WAV** (tanpa priming): sampel-akurat di tingkat decoder.
- **MP3**: priming encoder (~576 sampel) + padding akhir **tidak
  dipangkas** — tiap lagu MP3 membawa sedikit senyap bawaan di awal/
  akhir stream yang di-decode. Ini celah gapless yang nyata untuk
  format yang paling umum di library.

### 1.3 Pergantian lagu = auto-advance native, bukan JS

EOF decoder → `decoderFinished_ = true` → `scheduleAdvance()` →
`processAdvance()` **menunggu antrean PCM kosong (drain-wait)**
→ `loadTrack(next)` → event `track-ended` ke JS sesudahnya
(`PlaybackController.cpp`, `advanceWorkerLoop`). JS hanya sinkron UI
(`playerStore` listener `onPlaybackTrackEnded`); JS tidak pernah
memutus/menyambung audio. Jadi crossfade **harus** hidup di native —
ramp volume sisi JS tidak mungkin mengejar transisi ini.

### 1.4 Sumber jeda antar lagu (crossfade = 0, mode processing)

| # | Sumber | Besaran / sifat |
|---|--------|-----------------|
| A | **Load latency**: `loadTrack()` → `startDecoder()` (buka file + start worker) → chunk decode pertama. Selama itu antrean kosong dan `render()` mengisi **senyap**. | Puluhan–ratusan ms (belum diukur; butuh logcat/device). Tidak ada pre-roll / pre-decode lagu berikut. |
| B | **Fade-out 500 ms + fade-in 300 ms**: lembah loudness di batas lagu walau tanpa senyap A. | 0,8 dtk transisi yang terdengar sebagai jeda. |
| C | **Stream reopen**: `loadTrack()` sukses → `EngineManager` membuka ulang stream bila laju file berubah (M1). Album dengan laju campuran (44,1 ↔ 48 kHz) kena jeda tambahan. | Tergantung device/AAudio; belum diukur. |
| D | **Padding MP3** (lihat 1.2). | ~576 sampel awal + padding akhir per lagu MP3. |
| E | Repeat One / antrean habis: bukan jeda antar lagu (status Completed). | — |

Stream **tidak** di-restart bila laju sama — Oboe tetap jalan,
`render()` tetap mengisi buffer. Jadi jeda dominan = A + B (+ D untuk
MP3), bukan teardown stream.

### 1.5 Vonis gapless

**TIDAK terbukti gapless di kode.** Decoder mengklaim gapless, tapi
rantai playback tidak: tidak ada pre-roll lagu berikut, tidak ada
pemangkasan priming MP3, dan transisi selalu melewati drain antrean
kosong + `loadTrack()`. Album live/konsep akan terdengar putus
(celah A + lembah B), paling terasa di MP3 (+ D). Klaim
`supportsGapless` sebaiknya tidak ditampilkan ke user sampai A–D
ditutup.

## 2. Yang dibangun ronde ini (dan batasnya)

Setting **Crossfade 0–12 dtk** (default 0 = mati = perilaku lama):

- **JS**: `src/features/crossfade/crossfade.ts` (clamp/label murni) +
  `src/features/crossfade/store/crossfadeStore.ts` (persist
  `crossfade-storage`, dorong ke native) + slider di Settings → Audio
  (commit saat jari dilepas, bukan tiap geser).
- **Bridge**: `NativeDSPModule.setCrossfadeSeconds(seconds, sessionId)`
  (spec TS → Kotlin `@ReactMethod` → JNI
  `setNativeCrossfadeSeconds` → `EngineManager::setCrossfadeSeconds`
  → `PlaybackController::setCrossfadeSeconds`, clamp 0..12).
- **Native**: `PlaybackController::loadTrack(track, autoAdvance=false)`.
  Bila load berasal dari `processAdvance()` (EOF) dan setting > 0,
  kurva **fade-out processing = setting** (via
  `FadeEngine::secondsToFrames`, clamp 12 dtk, aman overflow uint32);
  fade-in tetap 300 ms. Logcat: `loadTrack: crossfade %.1f dtk`.
- **Restore**: `restoreToNative()` dipanggil `equalizerStore.initialize`
  (di luar gate EQ — crossfade hidup di controller, bukan rantai DSP)
  + entri di `applyAllEffectsToNative`.

### Batasan yang dicatat jujur (bukan crossfade overlap)

1. **Bukan overlap dua decoder.** Satu decoder + satu antrean PCM:
   lagu lama memudar selama D dtk, lalu jeda muat (A), lalu lagu baru
   mulai. Yang dihilangkan = potongan mendadak + lembah 500 ms; yang
   tersisa = jeda muat A (+ C/D). Crossfade overlap sejati butuh
   decoder + antrean kedua yang di-mix di `render()` — pekerjaan
   besar di hot path audio, di luar ronde ini.
2. **Hanya auto-advance.** Next/prev manual memotong antrean lama
   seketika (tidak ada ekor yang bisa di-fade); fade-in tetap 300 ms.
3. **Fade-in tidak ikut D.** Fade-in D dtk akan menghukum resume
   (`play()` me-reset `framesSinceLoad_`), seek, dan next manual
   dengan ramp multi-detik. Jadi D hanya mengatur fade-out.
4. **Bit-perfect mengabaikan setting.** Fade di sana tetap 10 ms
   anti-klik — fade detik-detik adalah processing. UI mengatakannya.
5. **Lagu lebih pendek dari D**: fade-out menjangkau seluruh lagu
   (sama seperti perilaku 500 ms pada lagu < 500 ms hari ini).
6. **Tidak mengubah**: pause fade (15 ms), ReplayGain, Convolver,
   HRTF, widener, atau DecoderWorker (tidak disentuh).

## 3. Bukti yang ada (tanpa device)

- Host test `scripts/test_crossfade.cpp` (g++): `secondsToFrames`
  (0/5/12 dtk, clamp, tanpa overflow), kurva S-curve (ujung 1→0 /
  0→1, monoton, komplemen = 1, tengah = 0,5), `crossfade()` mix
  (Linear 4 frame, guard kurva kosong), durasi 0/1 frame identitas.
- Jest: `crossfade.test.ts` (clamp/label) +
  `crossfadeStore.test.ts` (default 0, clamp 20→12, push native
  dengan sessionId, restore, session -1 tanpa throw).
- `tsc` 0 + full jest (lihat laporan ronde; baseline 93 suite /
  1103 tes).
- `scripts/check_jni_pairs.py` + `scripts/check_codegen_spec.py`
  untuk pasangan JNI/Kotlin + spec TurboModule.
- **BELUM ADA bukti kompilasi NDK** (VM ini tanpa java/gradle/NDK)
  dan **BELUM ADA bukti device** — butuh CI build (Dev/Preview)
  + tes dengar (lihat §4).

## 4. Protokol tes device (untuk csheva)

Butuh **REBUILD** (perubahan native C++/Kotlin/JNI) — Metro reload
tidak cukup. Pakai APK Dev/Preview terbaru dari HEAD ronde ini.

1. **Setting muncul**: Settings → Audio → "Crossfade — Transisi
   Antar Lagu", slider 0–12 dtk, label "Mati" / "5 dtk".
2. **Album live, crossfade 0** (mode DSP): dengar batas lagu —
   catat apakah ada putus/senyap dan kira-kira berapa lama.
   Bandingkan FLAC vs MP3 dari album yang sama (MP3 cenderung
   lebih terasa putusnya karena padding).
3. **Album live, crossfade 5 dtk** (mode DSP): ekor lagu lama
   harus memudar 5 dtk sebelum batas; lagu baru mulai penuh
   (fade-in singkat). Masih ada jeda singkat saat muat — catat
   apakah terasa.
4. **Next manual** (crossfade 5 dtk): lagu baru harus mulai
   langsung (tanpa ramp 5 dtk) — kalau ada ramp panjang, itu bug.
5. **Resume/seek** (crossfade 5 dtk): tidak ada ramp panjang
   sesudah resume/seek.
6. **Bit-perfect** (crossfade 5 dtk): tidak ada fade panjang —
   transisi sama seperti crossfade 0.
7. **Logcat** (bila sempat): cari `crossfade %.1f dtk` saat
   auto-advance — membuktikan nilai sampai ke native.

## 5. Kerja lanjutan (bukan ronde ini)

- Pre-decode / pre-roll lagu berikut (tutup celah A) — butuh decoder
  kedua atau penjadwalan load lebih awal.
- Pangkas priming/padding MP3 (tutup celah D) — baca `skip_samples`
  / metadata gapless FFmpeg.
- Crossfade overlap sejati (dua decoder + mix di `render()`).
- Ukur load latency A di device (log timestamp drain-kosong →
  chunk pertama) untuk angka, bukan perkiraan.

## 6. ADDENDUM — implementasi selesai 2026-11-20 (HEAD b26247346)

Butir §5 nomor 1 (pre-roll) dan nomor 2 (trim priming/padding) SUDAH
dikerjakan ronde ini — bukan lagi "kerja lanjutan". Detail lengkap di
`~/workspace/audit-chain-2026-11-18/gapless-implementation-report.md`.

- **Trim (celah D tertutup):** `decoder/GaplessInfo.h` (parser
  Xing/LAME + iTunSMPB), `FFmpegDecoder.cpp` (side-data
  `AV_FRAME_DATA_SKIP_SAMPLES` menang atas Xing; start-trim domain
  output + end-trim; flush swr di EOF). Host test
  `scripts/test_gapless.cpp`: 8 kasus, semua lulus.
- **Pre-roll (celah A tertutup):** `PlaybackController.cpp`
  `maybeStartPreroll()` (:2047) + `tryGaplessHandoff()` (:2155) —
  decoder track berikut disiapkan saat ekor tinggal ~2 dtk, output
  masuk antrean yang sama; handoff tanpa clear antrean / tanpa
  reopen stream. `TrackQueue::peekNext()` baru.
- **Seam (celah B):** `applyTrackFades()` — gapless ON + crossfade 0
  memakai kurva anti-klik 10 ms di semua mode (bukan fade-out 500 ms
  / fade-in 300 ms). Crossfade > 0 menang atas gapless.
- **Setting:** toggle Settings §1e (default ON), store
  `src/features/gapless/` (persist "gapless-storage"), bridge
  `setGaplessEnabled` (spec → Kotlin → JNI → EngineManager).
- **Belum terbukti:** kompilasi NDK (butuh Dev build CI — belum
  ditrigger) + tes dengar di device (seam album bersambung).
