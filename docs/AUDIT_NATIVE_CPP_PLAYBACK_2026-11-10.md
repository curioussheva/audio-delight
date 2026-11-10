# Audit Native C++ — playback (2026-11-10)

Deep audit section playback, lanjutan dari audit manager+core
(`docs/AUDIT_NATIVE_CPP_MANAGER_CORE_2026-11-10.md`). Satu section per satu,
sesuai metode kerja csheva: **catat dulu, perbaiki belakangan** — dokumen ini
hanya temuan, belum ada satu baris kode pun yang diubah untuknya.

- **Scope:** `android/app/src/main/cpp/playback/` (22 file, 4.425 baris)
  + `decoder/DecoderWorker.{h,cpp}` (dimiliki PlaybackController) — total
  24 file.
- **Metode:** 4 track paralel read-only (A: PlaybackController, B: TrackQueue +
  state/type headers, C: PCMQueue/DecodedAudioQueue/FadeEngine/PlaybackClock,
  D: PrebufferManager/NativeEventEmitter/PlaybackMetrics/DecoderWorker).
  Setiap klaim kunci diverifikasi ulang oleh konsolidator (grep + baca kode)
  sebelum masuk dokumen ini; yang tidak lolos verifikasi tidak ditulis
  sebagai TER VERIFIKASI.
- **Hasil: 0 BLOCKER, 11 MAJOR, 16 minor/laten.** Dua temuan ditemukan
  independen oleh 2 track (P-M1 ekor terpotong, P-M4 race decoderWorker_).
- **Penomoran:** `P-Mn` = major playback, `p-mn` = minor playback — tidak
  melanjutkan nomor audit manager+core (B1, M1–M9 di sana).

## Ringkasan

1. **P-M1 — tiap track kehilangan ekornya saat auto-advance.** Decoder
   selesai membaca file → EOF langsung → `loadTrack()` → `pcmQueue_->clear()`
   membuang audio yang sudah di-decode tapi belum dimainkan (~13–20 dtk
   tipikal). Fungsi inti "memutar track sampai habis" gagal sistematis.
2. **P-M2 — pause/stop tidak menghentikan audio sampai queue habis.**
   `render()` membaca queue tanpa cek `playing_`; queue 60–90% penuh
   (~13–20 dtk) tetap di-drain ke speaker setelah pause.
3. **P-M3 — stop() tidak membatalkan auto-advance.** `loadTrack` yang sedang
   berjalan di advanceThread bisa menghidupkan lagi audio setelah stop.
4. **P-M4 — race `decoderWorker_`/`currentTrack_`** di `play()`/`pause()`/
   `seek()` + decode callback — perbaikan M3 hanya menutup jalur render.
5. **P-M5 — Repeat One + tombol Next = restart lagu yang sama** (Previous
   tetap mundur — asimetris, reachable dari UI).
6. **P-M6 — `TrackQueue::setRepeatMode()` menulis tanpa lock** (race dengan
   `advance()`/`retreat()`).
7. **P-M7 — `FadeEngine` mati total** — tidak ada fade in/out/crossfade di
   jalur mana pun; ganti track/pause/stop adalah hard cut.
8. **P-M8 — `PlaybackClock::durationFrames` tidak pernah di-set** →
   `progress()` selalu 0.0, `isNearEnd()` selalu true.
9. **P-M9 — playback rate (speed 0.5×–2.0×) tidak ada implementasi native
   sama sekali** — placebo terkonfirmasi sampai ke `render()`.
10. **P-M10 — error decoder hilang diam-diam.** `setErrorCallback` tidak
    pernah di-set; file korup/gagal decode → berhenti tanpa event ke JS, UI
    tetap "playing" tanpa suara.
11. **P-M11 — `PlaybackMetrics` yatim** — 1 dari ~14 writer terpasang,
    0 pembaca; ulangan pola AudioMetrics sebelum M5, tapi tanpa API live.
12. **Dead code besar:** `DecodedAudioQueue`, `PrebufferManager` (seluruh
    kelas + stub pengisi NOL), `FadeEngine`, hampir seluruh
    `SchedulerTypes.h` + `TransportState.h`, keluarga peeker/mutasi
    `TrackQueue`, sebagian besar `PlaybackState`.

## MAJOR

### P-M1 — EOF memotong ekor track: audio yang sudah di-decode tapi belum dimainkan langsung dibuang (TER VERIFIKASI; ditemukan 2 track independen)
- Rantai: `decoder/DecoderWorker.cpp:250-254` — `EndOfStream` →
  `eofCallback_()` → `break`, **langsung saat file habis di-decode, bukan
  saat queue habis dimainkan**. `playback/PlaybackController.cpp:697,700` —
  callback EOF emit ke JS + `scheduleAdvance()`. `:827-845` —
  `scheduleAdvance()` spawn thread → `advance()` → `loadTrack()`. `:191` —
  `loadTrack()` memanggil `pcmQueue_->clear()` → semua audio yang masih
  mengantre dibuang.
- Besarnya (diturunkan dari kode): kapasitas queue
  `PlaybackController.cpp:36` — `PCMQueue(1 << 21)` = 2.097.152 sampel =
  1.048.576 frame stereo ≈ **21,8 dtk @48 kHz** (komentar di kode sendiri:
  "21.8s buffer"). Decoder di-pause saat queue >90% (`:743`) dan di-resume
  saat <60% (`:408`) → steady-state queue berisi **60–90% = ~13–19,7 dtk**.
  Tiap pergantian track otomatis membuang ekor sepanjang isi queue saat itu.
- Konsistensi dengan logcat #7: `Decoder PAUSED (queue % full)` dengan
  `[total pauses=40]` dalam satu sesi → queue berulang kali mencapai 90%;
  reload di posisi 66,9 dtk → EOF 7,0 dtk kemudian → posisi render saat EOF
  ≈ 73,9 dtk, sementara decoder sudah 13–20 dtk di depan → durasi track itu
  ≈ 87–94 dtk. Besaran pasti per track butuh pembanding durasi vs posisi
  akhir (tidak ada di log); **mekanisme pemotongannya terverifikasi di kode**.
- Bukan BLOCKER karena tidak hang/crash — tapi fungsi inti gagal sistematis.
  Perbaikan: EOF jangan memicu advance sebelum queue habis (tunggu drain),
  atau advance tanpa `clear()` bila track sudah habis (pindah isi queue ke
  track baru tidak mungkin — yang benar adalah menunda `loadTrack` sampai
  queue terkuras, atau memutar sisa queue dulu).

### P-M2 — pause()/stop() tidak menghentikan audio sampai queue habis (TER VERIFIKASI)
- `playback/PlaybackController.cpp:369` — `render()` memanggil
  `pcmQueue_->read()` **tanpa syarat** (tidak dicek `playing_`).
  `core/AudioCallback.cpp:73-78` — `onAudioReady` memanggil `render()` tanpa
  gate playing. Yang di-gate `playing_` hanya majunya clock (`:491`), bukan
  keluarnya audio.
- Konsekuensi: saat user menekan pause, queue 60–90% (~13–19,7 dtk, lihat
  P-M1) tetap di-drain ke speaker. `pause()` (`:282-291`) hanya menghentikan
  producer (`decoderWorker_->pause()`), bukan consumer. `stop()` (`:293-303`)
  sama: clear queue di awal, tapi itu hanya membuang isi saat itu.
- Bukti logcat: tidak ada — user tidak menekan pause di logcat #7 (hanya
  `ReactHost onHostPause`, bukan transport pause). Temuan level kode; besar
  drain diturunkan dari kapasitas + threshold, belum diukur di device.

### P-M3 — stop() tidak membatalkan auto-advance: audio bisa menyala lagi setelah stop (TER VERIFIKASI)
- `playback/PlaybackController.cpp:293-303` — `stop()` set `playing_=false`,
  `stopDecoder()`, clear queue, reset clock — **tanpa** join/membatalkan
  `advanceThread_`, tanpa flag pembatalan. Bandingkan `shutdown()` (`:46-70`)
  yang **men-join** `advanceThread_` (`:54-57`).
- Skenario: EOF datang → `scheduleAdvance()` spawn thread → thread sedang
  `loadTrack()` (join decoder lama + FFmpeg open ~30 ms) → user menekan stop
  di jendela itu → `loadTrack` tetap selesai, `startDecoder` mengisi queue →
  `render()` (tanpa gate playing, lihat P-M2) memainkan track berikutnya
  walau `playing_=false`. Jendela sempit tapi nyata; tidak ada mekanisme
  pembatalan sama sekali.

### P-M4 — race: decoderWorker_/currentTrack_ dibaca tanpa decoderMutex_ di luar jalur render (TER VERIFIKASI; ditemukan 2 track independen)
- Perbaikan M3 (2026-11-10) hanya menutup `render()` + publish/move
  (`:392`, `:515` lock saat baca; `:777` publish di bawah lock; `:811`
  move-out di bawah lock). Yang masih membaca tanpa lock:
  - `play()` — `:242` (`!decoderWorker_ || track->uri != currentTrack_.uri`),
    `:263` (null check), `:274` (`decoderWorker_->resume()`).
  - `pause()` — `:287` (`decoderWorker_->pause()`).
  - `seek()` — `:306` (null check), `:315` (`pause()`), `:335` (`seek()`),
    `:337` (`resume()`).
  - `hasDecoder()` — `playback/PlaybackController.h:96-98`
    (`return decoderWorker_ != nullptr;`), dipanggil JNI.
  - Decode callback (thread decoder) — `:745`
    (`if (decoderWorker_ && !decoderWorker_->isPaused())`), tanpa
    `decoderMutex_` (callback ini hanya memegang `decodeMutex_` milik worker).
  - EOF callback (thread decoder) — `:672`
    (`const std::string uri = currentTrack_.uri;`) vs `loadTrack()` `:177`
    (`currentTrack_ = track;`, thread JS/advance) dan `play()` `:242`.
- Dampak: baca `unique_ptr`/`std::string` bersamaan dengan tulis/reset = UB
  strict (bisa crash saat realokasi string / torn pointer). Praktiknya
  jendela sempit; tidak ada crash di logcat #7. Mitigasi sebagian:
  pemindahan worker di `stopDecoder()` dipegang `unique_ptr` lokal sampai
  `stop()` selesai, jadi objek tidak hancur di tengah callback — yang racy
  adalah member `decoderWorker_`/`currentTrack_` itu sendiri.

### P-M5 — Repeat One + Next manual me-restart trek yang sama, bukan pindah ke trek berikut (TER VERIFIKASI)
- `playback/TrackQueue.cpp:224-225` — `advance()`:
  `case RepeatMode::One: return true;` tanpa mengubah `mCurrentIndex`.
- `playback/PlaybackController.cpp:104-133` — `next()` memanggil `advance()`
  lalu `loadTrack(*queue_->current())`. Karena `advance()` return `true`
  tanpa bergerak, `current()` = trek yang sama → `loadTrack` me-restart lagu
  yang sedang main.
- **Asimetri yang membuktikan ini bug, bukan desain:** `previous()` →
  `retreat()` (`TrackQueue.cpp:256-306`) mengurangi `mCurrentIndex` tanpa
  memeriksa repeat mode (hanya wrap di 0 untuk `All`). Jadi dengan Repeat
  One: Next = restart lagu yang sama, Previous = mundur ke lagu sebelumnya.
- **Reachable dari UI hari ini:** `skipToNext` (`useAudioPlayer.ts`) →
  `NativePlaybackService.next()` → JNI `nativeNext`
  (`jni/NativePlaybackModule.cpp:181`) → `controller->next()`.
- `advance()` dipakai bersama untuk dua keperluan berbeda — auto-advance EOF
  (`scheduleAdvance`, `:829-848`) dan manual next — dan semantik repeat-one
  yang benar hanya untuk EOF. Perbaikan: `next()` manual harus memaksa maju
  satu langkah apa pun repeat mode-nya (atau `advance()` diberi parameter
  `manual`).
- Catatan: `advance()` Repeat One untuk EOF sudah benar (reload trek yang
  sama = perilaku repeat-one yang diharapkan).

### P-M6 — TrackQueue::setRepeatMode() menulis mRepeatMode TANPA lock, race dengan advance()/retreat() (TER VERIFIKASI)
- `playback/TrackQueue.cpp:392-396` — `mRepeatMode = mode;` tanpa
  `lock_guard`. Bandingkan `setShuffleMode()` (`:303`) yang MENGUNCI.
- Pembaca di bawah lock: `advance()` (`:214`, membaca `mRepeatMode` di
  `switch` sambil memegang `mMutex`), `retreat()` (`:256`). Penulis tanpa
  lock: JNI thread (`nativeSetRepeatMode` → `controller->setRepeatMode` →
  `queue_->setRepeatMode`, `jni/NativePlaybackModule.cpp:196` +
  `PlaybackController.cpp:155-157`). Jalur lain: advanceThread
  (`scheduleAdvance` → `advance()`) vs JS thread (`setTracks`).
- Plain `enum class` read-vs-write tanpa sinkronisasi = data race (UB;
  praktis di arm64 hampir tidak pernah robek, tapi TSan akan menandainya).
  Perbaikan sebaris: tambah `lock_guard` seperti `setShuffleMode()`, atau
  jadikan `mRepeatMode` atomik.

### P-M7 — Fade tidak pernah terjadi: FadeEngine mati total, tidak ada fade di jalur render mana pun (TER VERIFIKASI)
- `FadeEngine` (generateCurve/applyFadeIn/applyFadeOut/crossfade/reset)
  punya **0 referensi** di luar file-nya sendiri; tidak ada satu pun
  `#include "FadeEngine.h"` di luar `playback/FadeEngine.{h,cpp}` (grep
  seluruh `cpp/`).
- `PlaybackController::render()` (`:352-533`) tidak pernah memanggil fade
  apa pun — tidak ada fade-out saat track berakhir, tidak ada fade-in saat
  track baru mulai, tidak ada fade saat pause/stop (`pause()` `:282-291`,
  `stop()` `:293-303` hanya `playing_=false` + `clear()`).
- Konfigurasi fadenya ikut mati: `TransitionConfig`
  (`playback/SchedulerTypes.h:36-55`, mode default Gapless,
  `crossfadeDurationFrames = 48000*2`, `fadeCurve = SCurve`) dan
  `SchedulerState`/`TransitionMode` — 0 pemakai di luar `SchedulerTypes.h`.
- Dampak: pergantian track/pause/stop adalah hard cut. Apakah terdengar
  klik/pop belum terukur di device (DUGAAN untuk audibilitas) — tapi secara
  kode tidak ada satu pun mekanisme yang mencegahnya. Perbaikan mengikuti pola
  audit P2: sambungkan `FadeEngine` ke `render()` (fade-out di akhir track +
  fade-in di awal) atau hapus kelasnya kalau memang diputuskan tidak pakai
  fade.

### P-M8 — PlaybackClock::durationFrames tidak pernah di-set → progress() selalu 0.0, isNearEnd() selalu true (TER VERIFIKASI)
- `setDurationFrames()` punya **0 caller** di seluruh `cpp/` (grep;
  satu-satunya penyebutan di luar `PlaybackClock.*` adalah komentar BUG di
  `PlaybackController.cpp:500-504`).
- Konsekuensi langsung: `PlaybackClock::progress()`
  (`playback/PlaybackClock.cpp:88-94`) selalu `0.0` (dur==0 → early return
  0.0); `isNearEnd()` (`:100-108`) selalu `true` karena `dur(0) <= pos` di
  semua kondisi.
- UI selamat karena ada fallback: `render()` (`:507-525`) memakai
  `decoderWorker_->getDuration()` kalau `framesDur==0`, dan `loadTrack()`
  (`:196-198`) mengisi durasi dari `track.durationMs` lewat
  `state_->setDuration()` — jadi durasi di UI berasal dari metadata/decoder,
  bukan dari clock. Status: bug nyata di API clock, dampak user saat ini
  nihil karena tidak ada pemanggil `progress()`/`isNearEnd()` (keduanya juga
  0 caller).

### P-M9 — Playback rate (speed 0.5×–2.0×) tidak ada implementasi native sama sekali — placebo terkonfirmasi sampai ke render() (TER VERIFIKASI)
- TS: `src/features/player/api/engine.ts:302-303` — `setPlaybackRate` hanya
  `console.log("setPlaybackRate not implemented yet", rate)`.
- JNI/Kotlin: tidak ada `setPlaybackRate` di `jni/` maupun
  `android/app/src/main/java` (grep).
- C++: `PlaybackState::setPlaybackRate()` (`playback/PlaybackState.h:214-222`)
  **0 caller**; `getPlaybackRate()` (`:206-213`) **0 caller** kecuali
  `snapshot()` (`:301-302`) — dan `snapshot()` sendiri **0 caller** di
  seluruh `cpp/`. Nilai `rate_` (default `1.0f`, `PlaybackState.h:37`) tidak
  pernah keluar dari `PlaybackState`.
- `PlaybackController::render()` (`:352-533`) tidak membaca rate di titik
  mana pun; tidak ada time-stretch/tempo/pitch di `cpp/` (grep
  `timeStretch|tempo|pitchShift` = 0; satu-satunya "rate" adalah resampler
  laju file→stream di `decoder/FFmpegDecoder.cpp:559` dan
  `resampler/SincResampler.cpp:58`, yang mengubah laju sample, bukan
  kecepatan putar).
- Jadi rantai speed putus di semua lapis: UI → stub TS → (tidak ada JNI) →
  setter mati → `render()` tidak tahu rate. Perbaikan butuh time-stretch
  nyata (mis. WSOLA) di `render()` + menyambungkan setter sampai JNI — bukan
  sekadar "menghidupkan" setter yang ada.

### P-M10 — DecoderWorker::setErrorCallback tidak pernah di-set → error decode berhenti diam-diam (TER VERIFIKASI)
- Grep `setErrorCallback` di seluruh `cpp/`: hanya definisi setter
  (`decoder/DecoderWorker.cpp:152`, `.h:77`) + `AudioStreamController.cpp:280`
  (callback Oboe, kelas lain). `startDecoder()` hanya memasang EOF
  (`playback/PlaybackController.cpp:657`) dan decode callback (`:703`).
- Akibat: `DecodeStatus::Error/FatalError` → `workerLoop` log + `break`
  (`decoder/DecoderWorker.cpp:256-260`), `errorCallback_` null sehingga
  dilewati. Controller tidak pernah tahu, tidak ada advance, tidak ada event
  ke JS. Queue terkuras → `render()` mengembalikan silence + underrun
  (tercatat M5) — UI tetap "playing" tanpa suara. Beda dengan EOF yang
  ditangani lengkap (callback + flood guard + advance).

### P-M11 — PlaybackMetrics / MetricsCollector: metrik write-only yatim, ulangan pola AudioMetrics sebelum M5 (TER VERIFIKASI)
- Writer: hanya **1 dari ~14** terpasang — `recordFrameRendered(frames)`
  (`playback/PlaybackController.cpp:527-528`, di `render()`). Grep
  `recordFrameDecoded/recordUnderrun/recordOverrun/recordDecodeLatency/
  recordRenderLatency/updateBufferDepth/updateQueueFill/updateQueueFrames/
  updateDSPLoad/updateCPUUsage/setAudioFormat/startSession/startTrack/reset`
  di luar `playback/PlaybackMetrics.*`: **0**.
- Reader: **0**. `PlaybackController::metrics()`
  (`playback/PlaybackController.h:94`, `:80` cpp) tidak punya caller;
  `snapshot()` tanpa ekspos JNI (grep `snapshot()` di luar
  `PlaybackMetrics.*` hanya menemukan `PlaybackState::snapshot`, kelas lain).
  `reset()`/`startSession()`/`startTrack()` 0 caller — jadi
  `sessionElapsedMs`/`trackElapsedMs` mengukur sejak konstruktor, bukan
  sesi/track.
- Akibat: semua field kecuali `totalFramesRendered` permanen 0
  (`underrunCount`, `overrunCount`, `xrunCount`, latensi EMA, queue fill,
  format, dsp/cpu load) — dan `totalFramesRendered` pun tidak dibaca siapa
  pun. Beda dengan AudioMetrics (M5): writer diisi DAN API live ke JS via
  JNI. PlaybackMetrics tidak punya keduanya — murni dead weight (objek + 1
  counter write per render).
- Catatan implementasi: EMA latensi load-compute-store non-atomik
  (`PlaybackMetrics.cpp`, `recordDecodeLatency`/`recordRenderLatency`) —
  berasumsi single-writer (terdokumentasi di header); tidak relevan selama
  writer-nya 0.

## Minor / laten

### p-m1 — removeTrack() tidak menyesuaikan mCurrentIndex saat trek SEBELUM current dihapus → current bergeser diam-diam (TER VERIFIKASI, laten — 0 caller)
- `playback/TrackQueue.cpp:87-110`: setelah `erase`, satu-satunya penyesuaian
  adalah clamp `if (mCurrentIndex >= mTracks.size() && !mTracks.empty())
  mCurrentIndex = size - 1`. Tidak ada `if (index < mCurrentIndex)
  --mCurrentIndex`.
- Bukti: antrean [A,B,C,D], current=1 (B). `removeTrack(0)` → [B,C,D],
  `mCurrentIndex` tetap 1 → `current()` kini C, bukan B. Lagu yang sedang
  main "berpindah" tanpa skip.
- **Laten:** grep `appendTrack|insertTrack|removeTrack` di seluruh `cpp/` →
  0 pemakai di luar `TrackQueue` sendiri. Satu-satunya mutasi antrean yang
  terjangkau hari ini adalah `setTracks` (penggantian penuh) + `jumpTo` +
  `next/previous`. Bug ini akan menggigit begitu ada fitur "hapus dari
  antrean" / "tambah ke antrean" dari JS.

### p-m2 — append/insert/removeTrack memanggil rebuildShuffle() yang mengacak ULANG seluruh urutan — current track berubah diam-diam saat shuffle ON (TER VERIFIKASI, laten — 0 caller)
- `playback/TrackQueue.cpp:59-67, 69-85, 87-110`: ketiganya diakhiri
  `rebuildShuffle()` (`:480-498`) yang membangun permutasi baru dari nol;
  `mCurrentIndex` tidak disentuh → menunjuk trek acak yang berbeda.
- Kontras dengan `setShuffleMode()` (`:303-384`) yang dengan hati-hati
  mempertahankan trek yang sedang diputar (plus komentar peringatan deadlock
  di sana). Mutasi antrean tidak punya perlindungan yang sama.
- **Laten:** 0 caller di luar `TrackQueue`.

### p-m3 — currentIndex() membaca mCurrentIndex tanpa lock (TER VERIFIKASI)
- Definisi `playback/TrackQueue.cpp:440-444` — `return mCurrentIndex;` tanpa
  `lock_guard`, padahal `mCurrentIndex` adalah `size_t` biasa (bukan atomik,
  `TrackQueue.h:147-148`).
- Pemakai: JNI `nativeGetCurrentTrackIndex`
  (`jni/NativePlaybackModule.cpp:138-144`) — thread JNI/UI — sementara
  `advance()` (advanceThread, di bawah `mMutex`) dan `setTracks` (JS thread,
  di bawah `mMutex`) menulisnya. Data race (UB, praktis benign di arm64
  satu-word).
- Sefamili (laten, 0 caller eksternal): `getShuffleMode()`
  (`TrackQueue.cpp:386-390`) dan `getRepeatMode()` (`:398-402`) juga tanpa
  lock; `hasNext()` (`:415-425`) dan `hasPrevious()` (`:427-431`) membaca
  `mTracks`/`mCurrentIndex`/`mShuffleOrder` tanpa lock — aman hari ini hanya
  karena satu-satunya pemanggilnya (`next()`/`previous()` const) memegang
  lock, dan kedua peeker itu sendiri mati (lihat Dead code).

### p-m4 — State machine PlaybackState hanya pernah mencapai Playing/Paused; Stopped/Buffering/Seeking/Completed/Error tidak pernah di-set (TER VERIFIKASI)
- Satu-satunya pemanggil `setStatus()`: `updatePlaybackState()`
  (`playback/PlaybackController.cpp:851-867`) — hanya `Playing` atau `Paused`
  berdasarkan `playing_`. `stop()` (`:293-303`) → `playing_=false` → status
  **Paused, bukan Stopped**.
- Antrean habis: `scheduleAdvance()` (`:829-848`) hanya log `"EOF: queue
  exhausted (repeat off)"` — tidak ada transisi ke `Completed`/`Stopped`;
  status tetap `Playing` dan posisi membeku di akhir trek.
- Grep `PlaybackStatus::` di luar header: hanya `Playing`
  (`EngineManager.cpp:589`, `PlaybackController.cpp:859`) dan `Paused`
  (`:860`). `Stopped` hanya nilai default awal (`PlaybackState.h:129-132`);
  `Buffering/Seeking/Completed/Error` 0 pemakaian di mana pun.
- Dampak: `nativeGetStatus` (`jni/NativePlaybackModule.cpp:126-129`) tidak
  pernah mengembalikan Stopped/Completed/Error; JS (`useAudioPlayer.ts`,
  polling `status === 1`) mengandalkan event track-ended untuk menutupi
  kekakuan ini — status native sendiri basi setelah trek terakhir habis.

### p-m5 — PlaybackState menyimpan repeat/shuffle yang tidak pernah disinkronkan dengan TrackQueue — dual source of truth, selalu default (TER VERIFIKASI, laten)
- `PlaybackState.h:146-186` punya `repeat_`/`shuffle_` atomik + getter/setter,
  tapi grep: 0 caller untuk `setRepeatMode/setShuffleMode/getRepeatMode/
  getShuffleMode` pada `state()`. `PlaybackController::setRepeatMode/
  setShuffle` (`PlaybackController.cpp:152-157`) hanya menulis ke
  `TrackQueue`.
- Akibat: `snapshot().repeat/shuffle` selalu `Off/Off` apa pun mode
  sebenarnya. Laten karena `snapshot()` sendiri 0 caller — tapi siapa pun
  yang membacanya kelak mendapat nilai salah.

### p-m6 — TrackInfo::operator== hanya membandingkan uri — antrean dengan URI duplikat membingungkan preservasi shuffle (TER VERIFIKASI, laten-rendah)
- `playback/PlaybackTypes.h:58-68`: `operator==` membandingkan hanya `uri`.
  `setShuffleMode()` (`TrackQueue.cpp:336-384`) memakai `std::find` dengan
  operator ini untuk mencari trek yang sedang main.
- Kalau antrean berisi URI yang sama dua kali (lagu yang sama ditambahkan
  2x), `find` mengembalikan kecocokan PERTAMA — bisa jadi instans yang salah
  yang dipertahankan saat toggle shuffle. Dampak rendah; dicatat karena
  preservasi shuffle adalah area yang sudah 2x diperbaiki (2026-10-06).

### p-m7 — activeQueue() dibangun ulang + disalin penuh di tiap pemanggilan (performa, bukan bug)
- `playback/TrackQueue.cpp:448-478`: return-by-value, O(n) copy per
  panggilan; `advance()` cabang All memanggilnya 2x, `current()` menyalin
  seluruh vektor hanya untuk mengembalikan 1 elemen. n ≤ ~200 (komentar di
  file), jadi terbatas — dicatat saja, bukan untuk diperbaiki sekarang.

### p-m8 — PCMQueue::beginWrite/beginRead tidak memeriksa wrap-around: potensi OOB kalau dipakai (TER VERIFIKASI di kode, tidak terpicu — 0 caller)
- `playback/PCMQueue.cpp:116-128`: `beginWrite()` hanya memeriksa
  `frames > free`, lalu mengembalikan `&buffer_[indexMask(w)]` tanpa
  memeriksa `start + frames <= capacity_`. Kalau `w` dekat ujung buffer dan
  `frames` melewati ujung, pemanggil yang menulis `frames` sample berurutan
  akan menulis melewati akhir `buffer_` (heap overflow).
- `beginRead()` (`:143-154`) punya masalah cerminan (baca melewati ujung →
  baca garbage/OOB read). `commitWrite()`/`commitRead()` (`:130-134`,
  `:156-160`) tidak memvalidasi `frames` terhadap reserve.
- Mitigasi hari ini: keempat method **0 caller** — jalur live hanya memakai
  `write()`/`read()` (copy path) yang menangani wrap dengan dua segmen
  `memcpy` secara benar (`PCMQueue.cpp:47-52`, `:90-95`). Catatan untuk siapa
  pun yang menghidupkan zero-copy path di masa depan: tambah cek
  `start + frames <= capacity_` atau kembalikan dua segmen.

### p-m9 — FadeEngine builders membagi nol saat durationFrames == 1 (TER VERIFIKASI di kode, tidak terpicu — 0 caller)
- `playback/FadeEngine.cpp:280-285` (dan pola sama di `buildLogarithmic`/
  `buildExponential`/`buildSCurve`): `denom = durationFrames_ - 1`; kalau
  `durationFrames_ == 1` maka `denom == 0.0f` dan `t = 0/0 = NaN` → gain NaN
  ke output. Guard yang ada hanya untuk `durationFrames_ == 0` (`:276-279`).
- Juga: `crossfade()` (`:205-213`) tidak memeriksa `empty()` seperti
  `applyFadeIn`/`applyFadeOut`; kalau kurva kosong, kedua gain = 1.0
  (`fadeInGainAt`/`fadeOutGainAt` mengembalikan 1.0 saat kurva kosong,
  `:68-72`, `:86-90`) sehingga output = jumlah kedua buffer (sampai 2x,
  clipping). Keduanya tidak terpicu karena `FadeEngine` mati (lihat P-M7) —
  perbaiki bersamaan kalau kelas ini dihidupkan, atau ikut terhapus kalau
  diputuskan mati.

### p-m10 — seek() memindahkan clock sebelum seek decoder berhasil + offset keyframe (DUGAAN untuk gagal seek; TER VERIFIKASI untuk urutan + keyframe)
- `playback/PlaybackController.cpp:333` — `clock_->seekToSeconds()` **sebelum**
  `:335` `decoderWorker_->seek()`. Kalau decoder seek gagal, clock sudah
  pindah tapi audio lanjut dari posisi lama → offset posisi persisten.
- `decoder/FFmpegDecoder.cpp:402-410` — `av_seek_frame(...,
  AVSEEK_FLAG_BACKWARD)` → audio mulai dari keyframe ≤ target, sementara
  clock tepat di target → offset persisten sampai akhir track (kecil untuk
  MP3, sampai hitungan detik untuk format keyframe jarang). Mekanisme sama
  membuat reopen memutar ulang audio dari keyframe (duplikasi beberapa detik).
- Catatan positif: `seekRate` sudah benar — memakai `streamSampleRate()`
  dengan fallback 48000 (komentar `:321-332` menjelaskan bug lama seek
  44.1 kHz).

### p-m11 — render() mengambil decoderMutex_ 2x per callback; fallback getDuration jalan tiap callback (hygiene, bukan stall)
- `playback/PlaybackController.cpp:392` (cek resume) dan `:515` (fallback
  durasi). Fallback jalan **setiap** callback karena
  `clock_->durationFrames()` selalu 0 — `setDurationFrames` **0 caller**
  (lihat P-M8). `FFmpegDecoder::getDurationSeconds()` sendiri murah
  (`decoder/FFmpegDecoder.cpp:487-492`, satu pembagian dari field tersimpan).
  Hanya hygiene perf audio thread, bukan stall.

### p-m12 — sleep 10 ms di loadTrack tidak menjamin in-flight render selesai
- `playback/PlaybackController.cpp:174-175` — `clearing_=true` +
  `sleep_for(10ms)`. Periode callback ~20 ms (960 frame @48 kHz), jadi render
  yang sudah lolos cek `clearing_` masih bisa copy slot basi selama 1
  callback. `stop()` (`:298`) dan `seek()` (`:317`) bahkan tidak memakai
  `clearing_` sama sekali. `PCMQueue::clear()` adalah satu atomic store
  (`playback/PCMQueue.cpp:144-149`) sehingga tidak ada korupsi counter —
  hanya data basi ≤1 callback.

### p-m13 — seek() tanpa log
- `seek()` (`playback/PlaybackController.cpp:305-340`) tidak punya satu pun
  `__android_log_print`, padahal `play`/`pause`/`stop`/`loadTrack` semua log.
  Seek tidak terlihat di logcat.

### p-m14 — underrun palsu saat loadTrack (noise untuk metrik M5)
- Saat `clearing_`, `render()` return 0
  (`playback/PlaybackController.cpp:364-366`), lalu
  `core/AudioCallback.cpp:82-84` mencatat underrun
  (`readSamples < requested`). Setiap ganti track menambah counter underrun
  padahal queue memang sengaja dikosongkan.

### p-m15 — nama menyesatkan: "Frames" padahal sampel
- `playback/PCMQueue.cpp:155-164` — `availableFrames()`/`capacityFrames()`
  mengembalikan hitungan **sampel** (counter monotonik sampel;
  `capacity_` = 2.097.152 sampel). Rasio 60%/90% tetap benar, dan
  `bufferedFrames()` (`PlaybackController.cpp:551`) diberikan ke
  `AudioMetrics::updateBufferedSamples(samples)` — unit konsisten di sana.
  Hanya penamaan; pemakai baru yang mengira frame akan salah 2x.

### p-m16 — Clock maju mengikuti frame yang dibaca queue, bukan frame yang benar-benar dimainkan hardware (TER VERIFIKASI di kode, drift DUGAAN)
- `render()` (`playback/PlaybackController.cpp:486-491`):
  `clock_->advanceFrames(readSamples / channels)` — hanya saat `playing_`,
  hanya sebesar yang berhasil dibaca dari queue.
- Saat underrun (short-read, sisa di-zero-fill `:463-469`), clock maju lebih
  lambat dari waktu nyata — posisi tertinggal dari wall-clock; ini sebagian
  menjelaskan nilai DIAG `speed` 0.65x–1.28x yang berfluktuasi di logcat
  (bukan kecepatan putar nyata, melainkan artefak delta posisi). Sebaliknya,
  xrun di level hardware (Oboe membuang frame) tidak terdeteksi clock sama
  sekali — tidak ada yang membandingkan dengan timestamp Oboe
  (`getTimestamp`).
- Sisi positif: guard `playing_` sudah benar (clock tidak maju saat paused,
  dan pembagian channel sudah benar — perbaikan 2026-10-10).

### p-m17 — PlaybackClock::reset() dan progress() bukan snapshot atomik walau diklaim begitu (TER VERIFIKASI di kode)
- `reset()` (`playback/PlaybackClock.cpp:105-110`) melakukan tiga `store`
  terpisah (position, duration, total); `progress()` (`:88-94`) melakukan dua
  `load` terpisah — pembaca bersamaan bisa melihat pasangan posisi/durasi
  dari dua "generasi" berbeda (mis. posisi track baru + durasi track lama).
  Komentar "snapshot consistent" di `PlaybackClock.h` (`progress()`) tidak
  dijamin oleh implementasi.
- Dampak praktis saat ini nihil: `duration` selalu 0 dan `progress()`
  0 caller. Perbaiki kalau clock dipakai untuk UI progres.

### p-m18 — Keamanan PCMQueue::clear() bergantung pada disiplin call-site, bukan pada tipe-nya (TER VERIFIKASI, invarian saat ini terjaga)
- `clear()` (`playback/PCMQueue.cpp:158-164`) satu store
  (`readCount_ = writeCount_`) — benar dan bebas race *jika* tidak ada
  producer yang sedang `write()`. Ketiga call-site menjaga ini: `loadTrack()`
  — `stopDecoder()` (`PlaybackController.cpp:173`) sebelum `clear()` (`:191`);
  `stop()` — `stopDecoder()` sebelum `clear()` (`:298`); `seek()` —
  `decoderWorker_->pause()` (`:315`) sebelum `clear()` (`:317`). `render()`
  juga menolak membaca saat `clearing_` (`:366-369`).
- Tapi tidak ada yang mencegah pemanggil masa depan memanggil `clear()` saat
  decoder sedang menulis — saat itu `write()` yang sudah terlanjur load `w`
  lama akan `store(w + toWrite)` sesudah clear dan membangkitkan kembali
  sample track lama yang baru dibuang. Ini perbaikan dari bug lama dua-store
  (didokumentasikan di `PCMQueue.h:9-45`), tapi tetap invarian implisit.
- Terkait: konstruktor `PCMQueue` tidak memvalidasi power-of-two
  (`PCMQueue.cpp:20-23`, `mask_ = capacity - 1`); kalau dibangun dengan
  kapasitas bukan power-of-two, `indexMask` menghasilkan indeks ≥ kapasitas
  → OOB. Saat ini dibangun dengan `1 << 21` (`PlaybackController.cpp:36`),
  jadi aman — tapi persyaratan "WAJIB power of 2" (komentar `:35`) tidak
  ditegakkan oleh tipe.

### p-m19 — DecoderWorker::start() bisa std::terminate bila dipanggil ulang pasca-EOF (laten, tidak terjangkau)
- `start()` hanya force-`stop()` bila `running_`
  (`decoder/DecoderWorker.cpp:44-52`); bila thread sudah selesai via EOF
  (`running_=false`, `workerThread_` masih joinable) lalu `start()` dipanggil
  lagi → `workerThread_ = std::thread(...)` (`:69`) di atas thread joinable →
  `std::terminate`. Satu-satunya caller `worker->start()` adalah
  `startDecoder()` (`playback/PlaybackController.cpp:759`) dengan worker baru
  tiap track — tidak terjangkau hari ini.

### p-m20 — NativeEventEmitter: global tanpa sinkronisasi + tanpa cek exception (laten)
- `g_jvm`/`g_moduleRef`/`g_methodId` polos
  (`playback/NativeEventEmitter.cpp:6-8`); `initModuleRef` melakukan
  `DeleteGlobalRef` + `NewGlobalRef` (`:16-19`) sementara `emitTrackEnded`
  dari thread decoder memakai ketiganya (`:34`, `:52`) — balapan saat module
  di-re-init di tengah playback. Tanpa `ExceptionCheck` setelah
  `CallVoidMethod` (`:52`); silent no-op tanpa log bila belum init (`:34`);
  global ref tidak pernah di-`Delete` (leak 1 ref seumur proses).

### p-m21 — render() :512 else if (decoderWorker_) baca tanpa lock (data race TSan)
- Pemakaian aman karena re-check di bawah lock (`:514-517`) — hanya balapan
  bacaannya yang tersisa, seperti situs `render()` lain sebelum 2026-10-09.

### p-m22 — DecoderWorker::pause() dari JS thread (pause/seek) memblokir di decodeMutex_ sampai chunk decode selesai
- By design (komentar Prioritas 4/6) dan terbatas pada satu chunk — bukan bug,
  hanya latensi seek/pause.

### p-m23 — stop() tidak reset fileSampleRate_/streamSampleRate_
- `playback/PlaybackController.cpp:293-303` — `stop()` clear queue + reset
  clock tapi membiarkan `fileSampleRate_`/`streamSampleRate_` basi ke siklus
  start berikutnya. Pola sama dengan m5 audit manager+core (di sana member
  manager); dampak rendah (`loadTrack` menimpa `fileSampleRate_`, `render`
  me-refresh stream rate).

### Bukan temuan — OBSERVASI (DUGAAN, jangan dijadikan klaim bug clock)
- Logcat #7: posisi DIAG tidak konsisten dengan model clock — posisi tidak
  reset di `loadTrack` auto-advance 19:56:20.122 (DIAG 72.223 ms pada +1,66
  dtk, padahal `clock_->reset()` di `:192`); turun 13 dtk tanpa
  `loadTrack`/`seek` (19:57:36 → 19:57:44); speed 0,24x–2,97x.
- Model kode tidak bisa menghasilkan pola itu: reset di `loadTrack` (`:192`),
  maju hanya dari `readSamples` (`:491`, maks ~1x realtime), `seekToSeconds`
  eksak. Kemungkinan: sampling DIAG/JS tidak andal, atau seek user yang tidak
  ter-log (p-m13), atau cache posisi sisi JS. **Jangan jadikan ini klaim bug
  clock** sebelum ada bukti native langsung (log `readSamples`/nilai clock
  per callback).

## Dead code (semua TER VERIFIKASI 0 caller via grep seluruh cpp/ + src/ + jni/ + Kotlin)

**Kelas utuh mati:**
- `DecodedAudioQueue` + `PCMChunk` + `PCMChunkHeader`
  (`playback/DecodedAudioQueue.{h,cpp}`) — 0 referensi di luar file sendiri,
  tidak ada yang `#include`. Subsistem chunk-queue yang tidak dipakai siapa
  pun; jalur live memakai `PCMQueue` langsung via callback decoder
  (`PlaybackController.cpp:706`). Tetap ikut ter-compile (CMake glob).
- `FadeEngine` (`playback/FadeEngine.{h,cpp}`) — 0 referensi, tidak ada yang
  `#include` (lihat P-M7).
- `PrebufferManager` (`playback/PrebufferManager.{h,cpp}`) — 0 referensi di
  luar file sendiri. Semua method (`startPrebuffer`/`cancel`/`state`/
  `isReady`/`progress`/`takePrebuffer`) tidak pernah dipanggil; tidak ada
  member di `PlaybackController`/`EngineManager` untuknya.
- `TransitionConfig`, `TransitionMode`, `SchedulerState`,
  `TransitionEvent`, `PrebufferRequestedEvent`, `TransitionRequestedEvent`
  (`playback/SchedulerTypes.h`) — 0 pemakai di luar file itu sendiri. Yang
  hidup dari header ini: hanya `FadeCurve` (dipakai `FadeEngine.h:21,74-75` +
  `FadeEngine.cpp:24-36` — dan FadeEngine sendiri mati). Header ini hanya
  di-include `FadeEngine.h:3`. Kandidat: pangkas header ke `FadeCurve` saja,
  atau hapus file bila `FadeCurve` dipindah.
- `TransportState.h` — alias `using TransportState =
  playback::PlaybackStatus;` = **0 pemakai** di seluruh tree. File mati
  seutuhnya.

**PrebufferManager lebih dari mati — isinya stub:**
- `decodeLoop()` tidak pernah memanggil `decoder->open()`/`read()` — ada blok
  `TODO:` (`playback/PrebufferManager.cpp:186-188`), lalu mengisi `pcmData`
  dengan **0.0f** (`:224`) — keheningan murni. `getOutputFormat()` (`:252`)
  dipanggil pada decoder yang tidak pernah di-open → mengembalikan default;
  komentar "FIX: Query actual format" di atasnya vakum. Kalau kelas ini
  dihubungkan, track berikutnya = hening, plus alokasi `pcmData` tak terbatas
  oleh `maxFrames` (satu track 5 menit ≈ 115 MB float).
- `SchedulerTypes.h:40` `prebufferFrames` — hanya deklarasi, tidak pernah
  dibaca.

**Method mati di kelas yang hidup:**
- `TrackQueue` — keluarga peeker (hanya saling memanggil satu sama lain):
  `next() const` (`:161`), `previous() const` (`:176`), `peek()` (`:191`),
  `hasNext()` (`:415`), `hasPrevious()` (`:427`). Satu-satunya jejak
  `queue_->next()` adalah komentar di `PlaybackController.cpp:109` yang
  menjelaskan kenapa `next()` TIDAK boleh memakainya (bug 2026-10-10, sudah
  diperbaiki dengan `advance()`).
- `TrackQueue` — mutasi antrean: `appendTrack` (`:59`), `insertTrack`
  (`:69`), `removeTrack` (`:87`), `clear` (`:111`). Satu-satunya mutasi yang
  hidup: `setTracks` (via JNI `nativeSetQueue`).
- `TrackQueue` — query: `getShuffleMode()` (`:387`), `getRepeatMode()`
  (`:399`), `size()` (`:433`), `isEmpty()` (`:408`). Hidup: `currentIndex()`
  (1 caller JNI), `tracks()` (1 caller — hanya baris log error di
  `PlaybackController.cpp:235`), `activeTracks()` (dipakai JNI
  `nativeGetQueueSize`/`nativeGetQueue`/`nativeGetCurrentTrackIndex`),
  `current()`, `advance()`, `retreat()`, `jumpTo()`.
- `PlaybackState` (`playback/PlaybackState.h`): `snapshot()` (maka struct
  `PlaybackSnapshot` juga mati — hanya dipakai `snapshot()`),
  `setQueueInfo()`, `setBuffering()`, `isBuffering()`, `setPlaybackRate()`,
  `getPlaybackRate()`, `getRepeatMode()`, `setRepeatMode()`,
  `getShuffleMode()`, `setShuffleMode()`, `getCurrentTrack()`,
  `clearCurrentTrack()`. Yang hidup: `getStatus`/`setStatus`,
  `getPosition`/`setPosition`/`setDuration`, `setCurrentTrack` (ditulis
  `updatePlaybackState`, tidak pernah dibaca — `currentTrack_` write-only).
  Catatan: `getPosition()` hidup (JNI `:123` + `EngineManager.cpp:587`).
- `PCMQueue::beginWrite`/`commitWrite`/`beginRead`/`commitRead`
  (`playback/PCMQueue.{h,cpp}`) — 0 caller; jalur live hanya
  `write()`/`read()`. `PCMQueue::freeFrames()` — 0 caller (yang dihapus
  2026-11-10 adalah `AudioBufferController::freeFrames`, beda kelas).
- `PlaybackClock::positionSeconds()`, `durationSeconds()`, `progress()`,
  `isNearEnd()`, `totalFramesRendered()`, `setDurationFrames()`
  (`playback/PlaybackClock.{h,cpp}`) — 0 caller. Yang hidup: `advanceFrames`,
  `seekToFrame`/`seekToSeconds`, `positionFrames`, `durationFrames` (baca;
  selalu 0), `reset`.
- `PlaybackState::setPlaybackRate`/`getPlaybackRate` dan
  `PlaybackState::snapshot()` — 0 caller (lihat P-M9).
- `PlaybackMetrics`: semua writer kecuali `recordFrameRendered`;
  `reset()`/`startSession()`/`startTrack()`/`snapshot()`; accessor
  `PlaybackController::metrics()`; field `xrunCount` dkk tak pernah terisi
  (lihat P-M11).
- `DecoderWorker` (0 caller di luar `decoder/DecoderWorker.*`):
  `setChunkSize`, `getState()`, `isRunning()`, `getFormat()`, `getPosition()`
  (via worker), `currentUri_` (hanya ditulis di `start()`, tidak pernah
  dibaca), `setErrorCallback` (setter tanpa pemanggil — juga P-M10). Yang
  HIDUP: `start`/`stop`/`pause`/`resume`/`seek`/`isPaused`/`getDuration`
  (dipakai `render()` `:517`) — plus setter decode/EOF callback.
- `PlaybackController`: `stopping_` (hanya ditulis di `shutdown()`, tidak
  pernah dibaca), aksesor `clock()`/`pcmQueue()` (0 caller di luar
  controller), `metrics()` (0 caller — lihat P-M11).
- Variabel lokal `ratio` di `startDecoder()`
  (`playback/PlaybackController.cpp:618,623`) — di-assign 1 lalu
  `(void)ratio`, tidak dipakai. Drift komentar: komentar bilang `chunkFrames
  = 4096 * max(1, round(...))` tapi kode hardcode `16384` (`:624`); komentar
  `initialize()` bilang `2^19` padahal kode `1 << 21` (`:36`) — yang terakhir
  sudah dicatat sebagai m12 di audit manager+core.

## Yang sehat (TER VERIFIKASI)

- **Antrean penuh didukung penuh di native, tanpa pemotongan di jalur mana
  pun.** `nativeSetQueue` (`jni/NativePlaybackModule.cpp:226-290`) meloop
  seluruh array, `setTracks` (`TrackQueue.cpp:18-57`) menyimpan semuanya +
  reset indeks 0 + perbaikan shuffle-pertama (2026-10-06). `jumpTo`
  (`:283-297`) memvalidasi batas; `next()`/`previous()` controller memakai
  `advance()`/`retreat()` (perbaikan 2026-10-10 atas bug peeker).
  Auto-advance EOF (`scheduleAdvance`, `PlaybackController.cpp:829-848`)
  berjalan di thread terpisah — tidak self-join, tidak use-after-free —
  dengan guard anti-flood 500 ms untuk trek korup (`:659-691`).
- **Repeat All/One di EOF benar:** `advance()` (`TrackQueue.cpp:214-254`) —
  `One` me-reload trek yang sama, `All` wrap 0 di ujung, `Off` return false +
  log "queue exhausted". `retreat()` (`:256-281`) wrap ke ujung saat `All`
  (fix 2026-10-10).
- **Shuffle aman dari bug lama:** `setShuffleMode()` (`:303-384`)
  mempertahankan trek yang sedang main di kedua arah toggle (dengan
  peringatan deadlock yang benar — tidak memanggil `current()` di bawah
  lock); `activeQueue()` (`:448-478`) membuang cache `thread_local` yang dulu
  race antar-thread (fix 2026-10-06) dan mem-guard indeks basi; `setTracks`
  menukar trek index 0 ke posisi 0 saat shuffle ON.
- **Thread-safety TrackQueue pada umumnya benar:** `mMutex` di
  `setTracks/append/insert/remove/clear/tracks/activeTracks/current/next/
  previous/peek/advance/retreat/jumpTo/setShuffleMode/isEmpty/size`.
  `PlaybackState` memakai atomik + `trackMutex_` terpisah dengan benar.
- **Tidak ada off-by-one di navigasi yang terjangkau:** `advance()` memeriksa
  `mCurrentIndex + 1 >= size` sebelum increment; `jumpTo` menolak
  `index >= size`; `current()` mengembalikan `nullopt` saat antrean kosong;
  `peek()` memeriksa batas (meski mati). `removeTrack` meng-clamp indeks saat
  antrean menyusut (kecuali drift p-m1).
- **PCMQueue sehat dan klaim lamanya benar:** `read()` (`PCMQueue.cpp:66-101`)
  dan `write()` (`:29-56`) hanya atomic load/store + `memcpy`, tanpa mutex,
  tanpa alokasi; begitu juga `availableFrames()`/`freeFrames()` (`:167-178`).
  Memory ordering benar untuk SPSC: producer load `readCount` dengan acquire
  + store `writeCount` dengan release; consumer sebaliknya. `safeDiff`
  mencegah underflow kalau counter sempat menyilang. Perbaikan bug lama
  2026-10-05 masih utuh: counter monotonik tunggal + `clear()` satu store
  menutup jendela race dua-store yang dulu menghasilkan sample 6.6e35/NaN
  saat ganti track. Kapasitas `1 << 21` sample (power-of-two, sesuai syarat
  bitmask). Queue penuh → `write()` kembalikan parsial/0 tanpa tulis liar
  (`:40-44`) + decode callback mencatat DATA DROP tiap ke-20 dan
  `recordOverrun()` ke metrik (`PlaybackController.cpp:712-730`) + decoder
  pause di 90% (`:740-752`); kosong → `read()` kembalikan short count dan
  `render()` zero-fill sisanya (`:463-469`) + underrun kini tercatat lewat
  return value `render()` (M5, 2026-11-10). SPSC dijaga: satu-satunya producer
  adalah decode callback (`:706`), satu-satunya consumer `render()` (`:369`).
- **Perbaikan M3 bertahan:** `stopDecoder()` pindah worker keluar di bawah
  lock lalu `stop()` di luar lock (`:811` + setelahnya); `startDecoder()`
  bangun + `start()` di luar lock, publish di bawah lock (`:759`, `:777`);
  `render()` hanya membaca `decoderWorker_` di bawah `decoderMutex_` (`:392`,
  `:515`).
- **Hook M1 konsisten:** listener dipanggil di akhir `loadTrack`, hanya saat
  sukses (`:211-213`), di luar lock apa pun; guard `mReopening` di
  `onTrackLoaded` mencegah reopen-di-dalam-reopen (manager+core); saat engine
  belum running, handler early-return sehingga preload
  `getControllerAndStartEngine` tidak memicu reopen.
- **Plumbing M5 konsisten:** overrun dicatat di decode callback saat DATA
  DROP, underrun via nilai balik `render()` di `AudioCallback`,
  `bufferedFrames()` dalam satuan sampel sesuai `updateBufferedSamples`.
- **Zero-fill terverifikasi:** shortfall `pcmQueue_->read()` diisi 0 di
  `render()` (`:457`, setelah NaN-cleanup); path `clearing_` mengisi seluruh
  buffer (`:364`). Tidak ada path data basi/duplikat di `render()`: counter
  monotonik `PCMQueue` membuat `read()` mengembalikan tiap sampel tepat
  sekali; `clear()` satu atomic store.
- **NaN/Inf + guard magnitudo** (`:~440-480`, ambang 2.0) dengan log WARN
  hanya saat ada NaN; log per-5000 render; tidak ada alokasi/I/O/log per
  callback di jalur panas (kecuali 2 akuisisi lock p-m11).
- **Clock:** maju hanya saat `playing_` (`:491`) + bagi channel (perbaikan
  bug A/B/C 2026-10-10); posisi di-sync ke state tiap callback (`:496-499`);
  `PlaybackClock` atomik; `seekToSeconds` eksak di domain laju stream.
- **DecoderWorker lifecycle:** destruktor memanggil `stop()` (join +
  `decoder_->close()`); `start()` force-stop + log bila sudah running
  (`:44-52`); `stop()` idempotent (flag + `notify_all` + cek `joinable`);
  pause/resume via atomik + `condition_variable`; `decodeMutex_` rekursif
  menangani re-entry backpressure dari dalam callback (terdokumentasi di
  header); prioritas thread `-16` (AUDIO) via `setpriority` dengan warning
  bila gagal (`decoder/DecoderWorker.cpp:196-198`); `workerLoop` keluar bersih
  di EOF/error/stop.
- **EOF callback tidak memanggil `loadTrack()` di thread decoder** (komentar
  + `scheduleAdvance()` ke thread terpisah, `:641-657,700`) — menghindari
  self-join + use-after-free yang didokumentasikan. **Destructor/shutdown
  ordering benar**: `stopDecoder()` → join `advanceThread_` → reset resource
  (`:46-60`); `loadTrack()` guard `initialized_`.
- **EOF flood guard** 500 ms di bawah `eofMutex_` (`:675-693`) — mencegah
  storm ratusan event/detik untuk file korup/0-byte (gejala 2026-10-06
  terdokumentasi).
- **`DecodedAudioQueue` sendiri (sebagai kode) benar:** mutex di semua method,
  `push` menolak saat penuh tanpa block (`DecodedAudioQueue.cpp:10-24`),
  `pop`/`peek` aman saat kosong — hanya saja tidak dipakai siapa pun.
- **`FadeEngine` sebagai kode juga benar** (kurva Linear/Log/Exp/SCurve
  terhitung benar; `applyFade*` tanpa alokasi, hanya perkalian;
  `fadeInGainAt`/`fadeOutGainAt` clamp indeks) — kecuali edge
  `durationFrames == 1` (p-m9) dan `crossfade` tanpa cek `empty()` (p-m9).
  Sayang: kode yang benar tapi mati.
- **Emitter:** logika attach-bila-perlu + detach-bila-kita-yang-attach benar
  (`NativeEventEmitter.cpp:40-56`); method ID di-cache sekali (`:22-26`);
  guard early-return bila belum init (`:34`); Kotlin `onNativeTrackEnded`
  null-safe + `try/catch` di bridge.
- **MetricsCollector internal:** atomik, tanpa lock di hot path; asumsi
  single-writer EMA terdokumentasi.

## Catatan lintas-track (temuan JS yang dikonfirmasi / dibantah dari sisi native)

- **Search antrean 1-lagu = murni JS, native sehat.** `loadSong`
  (`src/features/player/api/useAudioPlayer.ts:125`) mengirim
  `setQueue([song.uri], …)` 1 elemen; Kotlin
  (`NativePlaybackModule.kt:173-183`) dan JNI
  (`NativePlaybackModule.cpp:226-290`) meneruskan SEMUA URI tanpa pemotongan;
  `TrackQueue::setTracks` menyimpan semuanya; auto-advance EOF antar-trek
  terverifikasi di device (logcat #7: EOF→loadTrack 4–5 ms). Perbaikan ada di
  JS, bukan di C++.
- **Speed placebo terkonfirmasi end-to-end** (P-M9): UI → stub TS → tidak ada
  JNI → setter mati → `render()` tidak tahu rate.
- **Delay track-ended ~2 dtk ke JS BUKAN dari kode ini (TER VERIFIKASI).**
  Emit sinkron di EOF callback (`PlaybackController.cpp:697`) sebelum
  `scheduleAdvance()` (`:700`); tidak ada Handler/post/antrean di sini. Kotlin
  `onNativeTrackEnded` langsung teruskan ke
  `PlaybackNativeBridge.emitTrackEnded(uri)`
  (`NativePlaybackModule.kt:74-78`), yang langsung
  `RCTDeviceEventEmitter.emit("onPlaybackTrackEnded", uri)`
  (`PlaybackNativeBridge.kt:165-175`) — tanpa post ke main thread, tanpa
  delay. Listener JS log langsung saat terima
  (`playerStore.ts:246-252`). Jadi gap 1,95 dtk (native EOF 19:56:20.118 → log
  JS 19:56:22.073) berasal dari bridge/JS thread (di luar file audit; butuh
  profiling JS). Konsekuensi yang terverifikasi: audio sudah pindah track
  ~2 dtk sebelum UI tahu — ditangani JS via `syncFromNative()` (komentar di
  `playerStore.ts` mengakui event bisa datang terlambat).
- **EOF→loadTrack 4–5 ms di logcat BUKAN jaminan gapless** (p-m11 + P-M1):
  4–5 ms itu hanya latensi penjadwalan `scheduleAdvance`. Jeda nyata sampai
  sampel pertama track baru = durasi `loadTrack` (~30 ms: join decoder +
  sleep 10 ms + FFmpeg open ~15–20 ms + decode pertama), selama itu `render()`
  mengeluarkan silence (underrun). Ditambah P-M1 — ekor lama memang dibuang,
  jadi "gap" bukan soal jeda antar track.

## Perbaikan 2026-11-10 — DIKERJAKAN (csheva: "execute all, hasil inspeksi hampir akurat dengan kondisi riil app")

Lima belas commit di `fix/ffmpeg-disable-doc`, satu build Dev gabungan di akhir.
Verifikasi kompilasi hanya lewat build GitHub (VM Muse tidak punya NDK).

| # | Commit | Isi |
|---|---|---|
| P-M6 | `0c788b98` | `TrackQueue::setRepeatMode()` kini mengunci `mMutex`; getter `getShuffleMode()` / `getRepeatMode()` / `currentIndex()` dibaca di bawah lock (p-m3, `mMutex` dijadikan `mutable`). |
| P-M4 | `f1145fc3` | `decoderWorker_` `unique_ptr` → `shared_ptr`; helper `snapshotWorker()` (salin di bawah lock singkat, pakai tanpa lock); play()/pause()/seek() + callback decode/EOF + `updatePlaybackState()` + `hasDecoder()` + render() memakai snapshot (TOCTOU tertutup; lock tidak pernah dipegang melewati `loadTrack` — invarian M3). Decode callback menangkap `weak_ptr` ke worker pemiliknya (p-m21). |
| P-M5 | `c7183ec7` | Baru `TrackQueue::advanceManual()` (selalu maju; bungkus di ujung kalau repeat ≠ Off); `PlaybackController::next()` memakainya. `advance()` (EOF) tidak berubah. `TrackInfo::operator==` kini membandingkan uri + durationMs + sampleRate (p-m6). |
| P-M1 | `5b4400e6` | `scheduleAdvance(uri)` kini MENUNGGU queue drain (poll `availableSamples()==0` tiap 20 ms) sebelum advance/loadTrack; `advanceCancelled_` + `cancelPendingAdvance()` (dipanggil loadTrack/stop/shutdown); `emitTrackEnded` PINDAH dari EOF callback ke setelah advance benar-benar terjadi (dan cabang queue-habis) — event berarti audio track itu SUDAH habis terdengar. `decoderFinished_` baru; status Completed saat antrean habis (p-m4). |
| P-M3 | `bc87e3e8` | `stop()` membatalkan + join `advanceThread_` + `stopDecoder()` + clear queue/clock + reset laju file/stream (p-m23) + status Stopped eksplisit (p-m4 — `updatePlaybackState()` sengaja TIDAK dipanggil di `stop()` karena akan menimpa Stopped dengan Paused). |
| P-M2 | `9b65bfaf` | `render()` dapat gate `playing_` tepat setelah cabang `clearing_` — saat paused/stopped, buffer diisi senyap dan return `requestedSamples` (audio berhenti seketika, bukan drain ~19 dtk). Cabang `clearing_` juga return `requestedSamples` (p-m14 — membunuh underrun palsu tiap ganti track). Rename Frames→Samples (`availableSamples`, `capacitySamples`, `freeSamples`, `bufferedSamples()`) di PCMQueue + PlaybackController + AudioCallback (p-m15; `AudioBufferController::availableFrames` kelas lain, dibiarkan). |
| P-M8 | `7edf6b3f` | `loadTrack()` mengisi `clock_->setDurationFrames()` dari durasi decoder (atau `track.durationMs`); render() self-heal kalau masih 0 (p-m11 — fallback decoder tidak lagi jalan tiap callback). Baru `PlaybackClock::snapshotPositionAndDuration()` (satu mutex, p-m17). Method clock mati dihapus: positionSeconds, durationSeconds, progress, isNearEnd, totalFramesRendered, positionFrames, durationFrames + member `totalFramesRendered_`. |
| p-m10 | `738bb841` (+ koreksi `cur_dts` di commit perbaikan build, lihat di bawah tabel) | `seek()` diurutkan ulang: pause → clear → seek DECODER dulu → clock diset HANYA kalau berhasil, dari `worker->getPosition()`. Gagal: log + resume + return false, clock tidak tersentuh. `onSeekToFrame` mendelegasikan ke `onSeek`. Log target/hasil/aktual (p-m13). **KOREKSI 2026-11-10: `onSeek()` TIDAK lagi memakai `stream->cur_dts` sebagai posisi aktual pasca-seek — field itu tidak ada di AVStream publik FFmpeg 6.1.2 (dipakai repo ini) dan build Dev 42832521358 gagal kompilasi di dua baris itu. `currentFrame_` kembali ditulis dari posisi yang diminta (perilaku lama); urutan seek di controller — bagian p-m10 yang penting — tidak berubah.** |
| p-m12 | `03ed155c` | `RenderActiveGuard` RAII + `renderActive_` + `waitForRenderIdle()` (poll 1 ms, timeout 100 ms + WARN); loadTrack/stop/seek memakai clearing_ + wait sebelum clear. `sleep_for(10ms)` lama di loadTrack dihapus. |
| P-M7 | `1ca6ef99` | FadeEngine disambungkan ke render: fade-in SCurve 300 ms (loadTrack/seek/resume) + fade-out SCurve 500 ms di ekor — hanya saat `decoderFinished_` (tanpa flag ini fade-out salah memotong tengah track). Kurva dibuat loadTrack() (bukan audio thread — alokasi vector), dibaca render() hanya saat clearing_ false, dilindungi `waitForRenderIdle`. p-m9: `generateCurve()` durasi ≤1 frame kini isi kurva identitas (bukan NaN dari 0/0); `crossfade()` no-op kalau kurva kosong (sebelumnya output = jumlah kedua buffer, sampai 2x/clipping). |
| P-M9 | `6ced021f` | Baru `PlaybackRateProcessor` (WSOLA): Hann 1024, hop sintesis 512, hop analisis 512×rate, pencarian offset ±256 frame via cross-correlation mono + aturan 95%-terdekat-nominal + pakai nominal bila korelasinya ≥80% maks. Rate 1.0 = bypass (nol overhead, jalur bit-perfect utuh). render(): baca `frames×rate` dari queue → prosesor → tarik `frames` output; clock maju mengikuti frame INPUT (posisi track). Perubahan laju diterapkan render() di audio thread (atomic float saja yang lintas thread); loadTrack/seek/stop reset prosesor di dalam jendela clearing_. Wiring lengkap JNI → Kotlin module/service/bridge → spec → engine.ts (stub diganti panggilan nyata) → playerStore (setPlaybackSpeed + terapkan speed tersimpan saat play). Fade-out dihitung dalam frame OUTPUT. Test mandiri `scripts/test_rate_processor.cpp`: 24/24 lulus — durasi ≈ input/rate (1.0x: 0.996, 0.5x: 0.911, 1.5x: 1.040, 2.0x: 0.986), pitch terjaga (ZCR ~880/s), tanpa NaN. Dua bug ketemu saat ngetes: hop awal terbalik (Hs/rate) + bias korelasi → laju meleset & hang di 2.0x (best=0, loop tak berujung); window ditempatkan saat input menipis (advance 13–80) → durasi menggelembung — kini tunggu push berikutnya bila advance nominal tidak muat. tsc 0, Jest 192/192. |
| P-M10 | `42772ef5` | Baru `DecoderWorker::setDecodeErrorCallback` — hanya cabang Error/FatalError workerLoop (dipisah dari `setErrorCallback` umum yang juga menyala untuk start/seek; seek gagal TIDAK boleh skip track). startDecoder memasangnya: log + `decoderFinished_=true` + `scheduleAdvance` (audio yang sudah ter-decode tetap dimainkan sampai habis via drain-wait). `scheduleAdvance` kini loop melewati track yang gagal dimuat (batas = ukuran queue — melindungi Repeat One); kalau semua gagal/antrean habis → Completed + emit. |
| P-M11 | `dfe41126` | Hapus `PlaybackMetrics.{h,cpp}` (0 reader, tanpa JNI; satu-satunya writer hidup cuma `recordFrameRendered`). Controller: hapus member `metrics_`, accessor `metrics()`, make_shared, reset, dan pemanggilan di render(). `setMetrics(AudioMetrics*)`/`metricsEngine_` TIDAK disentuh — itu metrik engine yang hidup (M5). −565 baris. |
| Dead code | `0f933be8` | Hapus file `DecodedAudioQueue.{h,cpp}`, `PrebufferManager.{h,cpp}` (stub), `TransportState.h`; `SchedulerTypes.h` dipangkas ke `FadeCurve`; TrackQueue: hapus peeker next/previous/peek/hasNext/hasPrevious + mutator appendTrack/insertTrack/removeTrack/clear (menutup p-m1/p-m2 laten); PlaybackState: hanya status + posisi (hapus snapshot, setQueueInfo, buffering, rate, repeat/shuffle, current-track + member-nya; sinkronisasi track di `updatePlaybackState` dihapus — write-only); PCMQueue: hapus zero-copy API + member-nya (menutup p-m8); DecoderWorker: hapus setChunkSize, getState, isRunning, getFormat, currentUri_ (`getPosition()` DIPERTAHANKAN — dipakai seek()); PlaybackController: hapus `stopping_`, accessor clock()/pcmQueue(), lokal `ratio` mati; perbaiki komentar drift (chunkFrames selalu 16384; initialize() 2^19 → 2^21). Semua penghapusan diverifikasi grep 0 pemakai SEBELUM dihapus. −1.265 baris. |
| p-m18/19/20 | `9275b3f9` | p-m18: PCMQueue `epoch_` — write() menangkap epoch di awal, buang publish kalau clear() menaikkan epoch selama copy; ctor membulatkan kapasitas ke power of two berikutnya (sisa jendela 1–2 instruksi dicatat jujur). p-m19: `DecoderWorker::start()` stop() dulu bila `running_ || workerThread_.joinable()` (thread selesai tapi belum di-join + start ulang = `std::terminate`). p-m20: `NativeEventEmitter` — `g_jvm`/`g_moduleRef`/`g_methodId` di bawah mutex (emit menyalin ke lokal di bawah lock); `ExceptionCheck` + Describe + Clear setelah `CallVoidMethod`; null-check `NewStringUTF` (OOM). |

**Status verifikasi:** perbaikan di atas terverifikasi di level kode (grep 0 caller
sebelum hapus; WSOLA terverifikasi test mandiri 24/24; tsc 0, Jest 192/192).
Bukti jalan di device **belum ada** — menunggu build Dev + tes device (pause harus
langsung diam; track harus main sampai ekor penuh; Repeat One + Next harus pindah;
file korup harus di-skip; kontrol speed harus benar-benar mengubah tempo).

## Yang belum dikerjakan

Residual yang SENGAJA tidak dikerjakan di ronde ini (sesuai framing audit):
**p-m7** (`activeQueue()` full-copy per panggilan — dicatat saja),
**p-m16** (clock maju per frame-dibaca, bukan frame hardware — drift hanya DUGAAN),
**p-m22** (`DecoderWorker::pause()` block di `decodeMutex_` sampai chunk selesai —
by design).

Section C++ berikutnya yang belum diaudit: decoder, dsp, resampler+fft,
devices/jni/realtime/visualizer/utils (urutan di `NATIVE_CPP_MAP.md`).
