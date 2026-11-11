# Audit Native C++ — Decoder (2026-11-11)

- **Tanggal:** 2026-11-11
- **Branch:** `fix/ffmpeg-disable-doc` (HEAD `a5febc3a`)
- **Ruang lingkup:** section `decoder/` — 18 file (`android/app/src/main/cpp/decoder/`, 8 `.cpp` + 10 `.h`, ~3.650 baris) + pemakai di `playback/PlaybackController.cpp`, `resampler/*`, sisi Kotlin (`NativePlaybackService.kt`, `NativePlaybackModule.kt`) dan TS (`src/specs/`, `src/shared/utils/cacheNaming.ts`).
- **Metode:** 4 track paralel read-only (A: FFmpegDecoder; B: DecoderWorker + AudioDecoder base; C: DecoderFactory + PCMDecoder + StreamResampler + DecoderUtils; D: ContentUriResolver + DecoderTypes/State + dead-code sweep + CMakeLists). Laporan per track di `~/workspace/audit-decoder-2026-11-11/TRACK_*.md` (bukan di repo). **Setiap klaim kunci diverifikasi ulang oleh asisten** dengan grep + baca langsung file sumber sebelum masuk dokumen ini; sitasi baris dari track sudah dicek ulang (beberapa meleset beberapa baris dan diperbaiki di sini).
- **Status:** read-only, **catat dulu** — tidak ada perbaikan di ronde ini. Tidak ada file kode yang diubah.

## Ringkasan

Section decoder sehat di jalur hidupnya untuk file yang selama ini dites (48 kHz stereo): `FFmpegDecoder` → `DecoderWorker` → `PlaybackController` bekerja, resolver native menutup celah deferred-resolve, lifecycle worker/thread sudah benar. Tapi ada **1 temuan besar yang hidup dan belum pernah kena device test** — dan 8 MAJOR lain di sekitarnya.

**Hasil: 0 BLOCKER, 9 MAJOR, 40 MINOR (setelah deduplikasi antar-track), dead code besar.**

| # | Temuan | Singkat |
|---|---|---|
| **D-M1** | Double resampling + heap OOB untuk file non-48 kHz / non-stereo | `FFmpegDecoder` sudah resample via swr (sinc), base class resample LAGI via linear dengan jumlah frame salah domain. 96 kHz → baca heap di luar buffer + SIGSEGV (terbukti harness ASAN); 44,1 kHz → tempo −8,8%; mono → tiap chunk terpotong separuh; 96 kHz di stream 96 kHz → 2× cepat. Laten karena semua track tes selama ini 48 kHz stereo. |
| **D-M2** | Track pertama non-48 kHz main di kecepatan salah | `startDecoder` baca `streamSampleRate()==0` → cfg default 48 kHz; stream baru dibuka sesudahnya di laju file; reopen M1 tidak trigger karena laju file == laju stream. |
| **D-M3** | `loadTrack()` konkuren dari thread JS + advance tanpa mutex | Dua worker bisa hidup bersamaan, dua producer ke PCMQueue SPSC. Jendela kecil, dampak besar. |
| **D-M4** | `~AudioDecoder` memanggil virtual murni `onClose()` | Terminate laten kalau decoder dihancurkan saat masih open; saat ini tertutup karena semua jalur close dulu. |
| **D-M5** | DecoderFactory + PCMDecoder mati total (0 pemakai) | ~590 baris dead weight yang tetap dikompilasi; controller membangun `FFmpegDecoder` langsung. |
| **D-M6** | PCMDecoder tak bisa buka AIFF; WAV non-PCM salah-decode; fmtSize ≠ 16 merusak parsing | Janji factory tidak pernah bisa dipenuhi; WAV float/ADPCM salah-decode diam-diam. |
| **D-M7** | PCMDecoder tanpa validasi header | `channels==0` → SIGFPE; `channels` raksasa → alokasi ~4 GB → `bad_alloc` → terminate. Laten (decoder mati). |
| **D-M8** | Tiga jalur resolve cache, penamaan tidak konsisten | Native + service pakai `audio_`, legacy module pakai `track_` + ext default `tmp` vs `cache`; module me-resolve SEMUA URI secara eager. Jalur `track_` dorman tapi terjangkau. |
| **D-M9** | Cache-hit palsu | Hit check hanya `exists() && length() > 0`; salinan tulis langsung ke target (tanpa temp + rename atomik) → file parsial dilayani sebagai hit. |

**Catatan verifikasi terpenting:** D-M1 ditemukan **independen oleh 3 track** (A, B, C) dari sudut berbeda, lalu diverifikasi ulang oleh asisten dari kode, dan Track B **mereproduksinya dengan harness standalone** (file produksi asli + ASAN): 96 kHz → ASAN `heap-buffer-overflow` + SIGSEGV tanpa ASAN; 192 kHz → SIGSEGV juga. Ini bukan dugaan.

**Koreksi atas audit lama (lihat §Koreksi):** klaim `AUDIT_2026-11-10.md` "resampler produksi = interpolasi linear" tidak tepat. Resampler produksi `FFmpegDecoder` adalah **sinc libswresample**; resampler linear ikut jalan di produksi sebagai resampler KEDUA untuk file non-48 kHz/non-stereo — dengan frame-count salah domain (D-M1). Dan `SincResampler` bukan hanya tidak dipakai — `process()`-nya stub yang fallback ke linear.

**Satu klaim track yang DITOLAK saat verifikasi:** Track D (D-M4) mengklaim "`needsResampling()` selalu false → `applyResampling()` tak pernah jalan". **Salah.** `inputFormat_` = laju file (mis. 96000), `outputFormat_` = default 48000 yang valid → untuk file non-48 kHz `needsResampling()` TRUE dan `applyResampling()` JALAN (inilah D-M1). Yang benar dari D-M4: `outputFormat_` tidak pernah diset ke nilai nyata, jadi `getOutputFormat()` selalu mengaku 48000/2 — bukan laju input maupun laju target. Temuan itu dilipat ke D-M1 sebagai catatan, bukan disajikan sebagai fakta terpisah.

---

## Temuan MAJOR

### D-M1 — Double resampling dengan frame-count salah domain: heap OOB read + audio rusak untuk file ≠ 48 kHz / ≠ stereo

**Rantai bukti (dibaca langsung, lalu direproduksi):**

1. `FFmpegDecoder::onDecode` me-resample via swr ke `config().targetSampleRate` dan mengisi `result.samples` dengan frame **output**, tapi `framesDecoded` dalam domain **input** — komentarnya sendiri mengakui ini (`decoder/FFmpegDecoder.cpp:333-335`):
   ```cpp
   // ✅ FIX: framesDecoded = input frames (44.1k), currentFrame_ = output frames (48k)
   result.framesDecoded += frame_->nb_samples;
   currentFrame_ += converted;
   ```
2. `AudioDecoder::decode()` lalu memanggil `applyResampling()` bila `needsResampling()` (`decoder/AudioDecoder.cpp:88-89`).
3. `needsResampling()` membandingkan format **input file** dengan `outputFormat_` (`decoder/AudioDecoder.cpp:160-165`). `outputFormat_` **selalu default 48000 Hz / 2 ch** (`DecoderTypes.h:39,41`): `refreshFormats()` hanya menimpa kalau tidak valid (`AudioDecoder.cpp:220-221` — tidak pernah terjadi karena default sudah valid), dan satu-satunya penulis lain `setTargetFormat()` punya **0 pemanggil** di seluruh `cpp/` (juga 0 di Kotlin/TS). Jadi untuk file 96 kHz, 44,1 kHz, atau mono, `needsResampling()` selalu true.
4. `applyResampling()` memberi resampler linear itu data yang salah domain (`decoder/AudioDecoder.cpp:233,241-242`):
   ```cpp
   resampler_->configure(inputFormat_.sampleRate,
                         outputFormat_.sampleRate,
                         inputFormat_.channels);
   input.pcm.frames = static_cast<int32_t>(result.framesDecoded); // domain INPUT
   input.pcm.data = result.samples.data();                        // frame domain OUTPUT
   ```
   `StreamResampler` membungkus `dsp::LinearResampler` (`StreamResampler.h:48`), yang membaca `input[index*mChannels+ch]` sampai `index < inputFrames-1` (`LinearResampler.cpp:104-107,124-131`) tanpa tahu ukuran buffer sebenarnya.
5. Pemanggilnya `DecoderWorker::workerLoop` → `decoder_->decode(chunkSize_)` (`DecoderWorker.cpp:223`); `cfg.targetSampleRate` diisi dari laju stream (`PlaybackController.cpp:889-892`).

**Bukti reproduksi** (harness Track B, `/tmp/test_double_resample.cpp`, file produksi asli `AudioDecoder.cpp` + `StreamResampler.cpp` + `LinearResampler.cpp` dengan fake decoder yang meniru `onDecode` baris demi baris):
- 96 kHz → stream 48 kHz: **ASAN `heap-buffer-overflow` READ** di `LinearResampler.cpp:123` ← `StreamResampler.cpp:86` ← `AudioDecoder.cpp:248` ← `AudioDecoder.cpp:89`; build tanpa ASAN: **SIGSEGV, exit 139**. Buffer `result.samples` 16.384 frame (reserve `maxFrames * 2`), resampler membaca sampai ~32.768 frame.
- 192 kHz → 48 kHz: **SIGSEGV juga** (rasio 4×, OOB lebih jauh).
- 96 kHz → stream 96 kHz (jalur bit-perfect M1): `outFrames` 17.280 → **8.640** — output diam-diam turun ke 48 kHz, padahal stream 96 kHz: audio dimainkan **2× cepat** + pitch naik 2×.
- 44,1 kHz → 48 kHz: resampler hanya membaca `framesDecoded` (16.128) dari 17.556 frame yang diproduksi `onDecode` → **~1.428 frame (~8%) terbuang tiap chunk** + interpolasi linear kedua (kualitas turun).
- Kontrol 48 kHz → 48 kHz: `needsResample=0`, 17.280 frame utuh — bersih.

**Dampak per jenis file (stream 48 kHz, chunk 16384 frame):**

| File | Yang terjadi |
|---|---|
| 96 kHz stereo | `framesDecoded` ≈ 2× `converted`. LinearResampler membaca sampai ~2× ukuran buffer → **heap out-of-bounds read** (UB, sampai ~128 KB melewati akhir vector per chunk) + separuh kedua tiap chunk = garbage heap. Jumlah frame output kebetulan benar (32768×48/96=16384), jadi tidak ketahuan dari hitungan — hanya dari isi audio. |
| 44,1 kHz stereo | Tidak OOB (`framesDecoded` ≈ 0,92× `converted`), tapi audio di-time-stretch 48000/44100 ≈ **1,088× (8,8% lebih lambat, nada ~8,8% lebih rendah)** + artefak interpolasi linear di atas hasil sinc. |
| Mono (48 kHz, 1 ch) | `swr` sudah upmix ke stereo; `applyResampling` jalan karena channel 1≠2, tapi dengan rate sama `mRequired=false` sehingga `process()` hanya menyalin — lalu `resampled` dibangun dari `framesDecoded × 1` float (`AudioDecoder.cpp:250-254`), padahal buffer stereo berisi `converted × 2` float → **tiap chunk terpotong separuh** (gaps + posisi drift). |
| 96 kHz di stream 96 kHz (jalur bit-perfect M1) | `swr` passthrough 96 kHz; linear "96→48" mengubahnya jadi data 48 kHz yang dimasukkan ke stream 96 kHz → **audio 2× cepat, nada 2× naik**. Bit-perfect rusak walau stream sudah dibuka di laju file. **Koreksi wording Track C:** yang benar 2× cepat, bukan "setengah kecepatan". |

**Kenapa tidak ketahuan:** semua track di logcat #7 dan #8 adalah 48 kHz stereo → `needsResampling()` false → jalur ini tidak pernah jalan di sesi tes November. Gejala Oktober ("garbage 1e32", "chipmunk") konsisten dengan bug ini, tapi itu **DUGAAN** — belum dibuktikan bahwa gejala itu berasal dari sini dan bukan dari starvation queue seperti diklaim komentar kode.

**Akar (B-M2):** `outputFormat_` tidak pernah di-set. `setTargetFormat` 0 pemakai repo-wide; `getOutputFormat()` juga 0 pemakai. Desain base mengasumsikan `setTargetFormat` dipanggil seseorang, tapi tidak ada yang memanggilnya. Akibat samping: `getOutputFormat()` selalu mengaku 48000/2 — bukan laju input (untuk file non-48 kHz) dan bukan laju target (untuk stream non-48 kHz).

**Arah perbaikan (bukan tugas audit):** (a) `FFmpegDecoder` melaporkan `framesDecoded` dalam domain OUTPUT (`converted`, bukan `nb_samples`) — tapi itu mengubah arti field yang juga dipakai log/posisi; atau (b) beri tahu base bahwa `onDecode` sudah mengembalikan target rate — mis. panggil `setTargetFormat()` dari `startDecoder`/factory dengan laju stream + 2 ch, atau buat `onDecode` mengembalikan sample native-rate dan biarkan base yang me-resample. Opsi (b) lebih sesuai desain base (buktinya `PCMDecoder` benar — lihat "Yang sehat": tanpa resampling internal, `framesDecoded` = frame native di buffer, jalur base-class resampler benar untuknya). Dan tetap harus diputuskan apakah resampling kedua itu memang diinginkan (seharusnya tidak: `swr` sinc sudah cukup). Perbaikan paling bersih menurut Track A: `setTargetFormat()` dari `PlaybackController::startDecoder` dengan laju stream + 2 ch — tapi itu saja tidak cukup kalau `framesDecoded` tetap domain input untuk kasus lain; kedua lapis perlu diputuskan bersamaan saat perbaikan.

**Cara verifikasi di device:** mainkan 1 file FLAC 96 kHz (atau MP3 44,1 kHz, atau file mono) di APK saat ini, dengarkan + kirim logcat. Perkiraan: 96 kHz = noise/garbage di separuh tiap chunk (dan berpotensi crash); 44,1 kHz = terdengar lebih lambat; mono = putus-putus. **Ini tes yang sama dengan tes M1 di daftar PR** (track 44,1/96 kHz) — tes itu kini membuktikan/membantah D-M1 sekaligus. Verifikasi level kode: log sementara di `applyResampling()` (`inputFormat`, `outputFormat`, `framesDecoded`, `samples.size()/channels`) saat membuka file 96 kHz — akan terlihat `framesDecoded` ≈ 2× isi buffer.

### D-M2 — Track pertama non-48 kHz dimainkan dengan kecepatan salah

**Bukti (terverifikasi dari kode + komentar kode sendiri):** `startDecoder()` mengisi `cfg.targetSampleRate` dari `streamSampleRate()` (`playback/PlaybackController.cpp:889-892`); saat stream belum dibuka, nilainya 0 sehingga `cfg` tetap default 48000. Urutan play pertama (terkonfirmasi logcat #8): `loadTrack` → `startDecoder: targetSampleRate=48000 (stream=0)` → baru `EngineManager::start` membuka stream di laju file (`EngineManager.cpp:148,152-166` — `start()` memilih laju stream DARI laju file via `resolveRequestedRate()` + `pickBestRateFor()`). Untuk track pertama 96 kHz: decoder memproduksi 48 kHz, stream 96 kHz → render mengonsumsi 2× lebih cepat dari produksi (queue underrun + zero-fill) dan posisi meleset 2×.

Reopen M1 tidak menyelamatkan: `onTrackLoaded` membandingkan laju **file** (96 kHz) vs laju **stream** (96 kHz) — sama, jadi tidak reopen; yang tidak dibandingkan adalah laju **target decoder** (48 kHz). Lebih tepatnya, `onTrackLoaded` bahkan tidak sampai ke perbandingan itu untuk track pertama: `EngineManager.cpp:669-670` — "Stream belum berjalan: start() berikutnya sudah memakai laju file lewat resolveRequestedRate(). Tidak ada yang perlu dibuka ulang." Jadi tidak ada `loadTrack` kedua yang akan membuat ulang decoder dengan target yang benar.

**Dampak:** hanya track pertama setelah stream tertutup (cold start, atau setelah `stop()`/`shutdown()`); track berikutnya sudah benar karena stream terbuka dan `streamSampleRate()` terisi. Verifikasi: cold start → langsung mainkan track 96 kHz sebagai lagu pertama, dengarkan dan cek `startDecoder: targetSampleRate=` di logcat.

### D-M3 — `loadTrack()` konkuren dari thread JS + advance tanpa mutex

**Bukti (terverifikasi):** `loadTrack()` (`playback/PlaybackController.cpp:193-300`) tidak mengambil mutex apa pun di sepanjang badannya — satu-satunya lock di sana adalah tulis `currentTrack_` di bawah `decoderMutex_` (sementara `play()` di `:333-338` mendokumentasikan TOCTOU ini dan menjelaskan lock TIDAK dipegang melewati `loadTrack()` karena akan mengembalikan masalah M3). Pemanggilnya di dua thread: `next()`/`previous()`/`play()` (thread JS, `:133`, `:150`, `:358`) dan `scheduleAdvance()` (advance thread, `:1227`, `loadTrack(*nextTrack)`). `cancelPendingAdvance()` menutup jendela saat advance masih drain-wait (dicek tiap 20 ms + sekali setelah loop), tapi **tidak ada** perlindungan antara cek-batal terakhir advance thread dan `loadTrack()`-nya, maupun selama skip-loop. Bila `loadTrack` JS masuk di jendela itu, dua `startDecoder()` berjalan bersamaan pada worker berbeda: publikasi `decoderWorker_` di bawah lock (last-writer-wins), tapi kedua thread decoder sempat hidup bersamaan dan keduanya menulis ke `PCMQueue` yang SPSC (single-producer) — plus track yang berbunyi bisa berbeda dari indeks queue (UI mismatch).

**Dampak:** jendela kecil (puluhan ms per auto-advance, butuh input user tepat di momen itu) tapi dampaknya besar (korupsi queue SPSC, track salah). Perbaikan: serialisasi `loadTrack()` (mutex) atau generation counter. Catatan: ini batas controller, bukan bug `DecoderWorker` — guard p-m19 melindungi double-start pada objek yang *sama*, dan tiap `startDecoder` membuat worker baru, jadi `start()` ganda pada satu objek tidak terjangkau.

### D-M4 — `~AudioDecoder` memanggil virtual murni `onClose()` (terminate laten)

**Bukti (terverifikasi):** `decoder/AudioDecoder.cpp:13-16` — `~AudioDecoder() { close(); }`, dan `close()` memanggil `onClose()` bila `isOpen_` (`:49`). `onClose()` adalah pure virtual (`decoder/AudioDecoder.h:141`). Saat destruktor base berjalan, bagian derived sudah dihancurkan dan vtable sudah kembali ke base — memanggil virtual murni = **`pure virtual method called` + terminate**. **Terdemonstrasi langsung** oleh Track B: harness repro pertama mati persis begitu sebelum `d.close()` ditambahkan.

**Kenapa belum meledak:** semua jalur destruksi saat ini menutup dulu — `DecoderWorker::stop()` (`decoder/DecoderWorker.cpp:79-95`) memanggil `decoder_->close()` setelah join sebelum worker dihancurkan, dan `~DecoderWorker()` memanggil `stop()`. Jadi ini jebakan laten: jalur baru apa pun yang menghancurkan decoder terbuka (mis. factory gagal, early return tanpa close) langsung terminate. Perbaikan: jangan panggil virtual dari destruktor base (hapus `close()` dari `~AudioDecoder`, atau jadikan `onClose()` non-pure dengan default kosong).

### D-M5 — DecoderFactory + PCMDecoder mati total (0 pemakai eksternal)

**Bukti (dua track sepakat + verifikasi grep):** `PlaybackController::startDecoder` membangun decoder langsung, tanpa factory — `playback/PlaybackController.cpp:918-919`:
```cpp
auto decoder = std::make_unique<decoder::FFmpegDecoder>();
auto worker = std::make_shared<decoder::DecoderWorker>(std::move(decoder));
```
Grep `DecoderFactory` di seluruh `cpp/` + `java/` + `src/` → hanya definisi di `decoder/DecoderFactory.{h,cpp}`. Grep `PCMDecoder` → hanya `DecoderFactory.cpp:51,57` (factory memakainya untuk wav/aiff) + definisinya sendiri. `createDecoder`, `createDecoderForFormat`, `isFormatSupported`, `getSupportedFormats`, `registerDecoder`: semuanya 0 pemanggil. `CMakeLists.txt:73` memakai `file(GLOB_RECURSE ALL_SRCS ...)` — keempat file mati ini tetap dikompilasi ke dalam `libpristine-audio.so`.

**Dampak:** `DecoderFactory.{h,cpp}` + `PCMDecoder.{h,cpp}` (~590 baris) adalah dead weight yang tetap dikompilasi dan menyesatkan: registry factory mengklaim `wav`/`aiff` → `PCMDecoder` (`decoder/DecoderFactory.cpp:47-58`), padahal file WAV yang diputar hari ini ditangani `FFmpegDecoder`. **Landmine laten:** kalau factory suatu hari dihidupkan, track WAV dengan `content://` URI akan GAGAL dibuka — `PCMDecoder::onOpen` melakukan `std::fopen(uri.c_str(), "rb")` langsung tanpa `ContentUriResolver::resolve` (berbeda dari `FFmpegDecoder::onOpen` yang me-resolve dulu). Dan `DecoderFactory::createDecoderForFormat` mengembalikan `nullptr` untuk format tak dikenal tanpa log apa pun (`decoder/DecoderFactory.cpp:74-86`) — pemanggil yang tidak memeriksa akan crash di dereference.

### D-M6 — PCMDecoder tidak bisa membuka AIFF yang dijanjikan factory; WAV non-PCM salah-decode; fmtSize ≠ 16 merusak parsing

**Bukti:**
- Factory mendaftarkan `"aiff"` → `PCMDecoder` (`decoder/DecoderFactory.cpp:53-58`), tapi `parseWavHeader` menolak apa pun yang bukan RIFF/WAVE (`decoder/PCMDecoder.cpp:257-268`): file AIFF diawali `"FORM"`/`"AIFF"` → `onOpen` selalu gagal. Janji factory tidak pernah bisa dipenuhi.
- `header.audioFormat` **tidak pernah diperiksa** — satu-satunya validasi adalah `bitsPerSample` 16/24/32 (`decoder/PCMDecoder.cpp:278-299`). WAV float (format 3, 32-bit float) dibaca sebagai integer S32 → `convertToFloat` me-reinterpret bit float sebagai int32 → audio sampah tanpa penolakan. Sama untuk ADPCM (2), a-law (6), μ-law (7), MP3-dalam-WAV (85).
- `fmtSize` dibaca tapi tidak dipakai untuk melompati byte ekstra. `parseWavHeader` membaca struct 36 byte lalu langsung mencari chunk berikutnya. Kalau `fmtSize` 18 (cbSize) atau 40 (WAVEFORMATEXTENSIBLE — umum untuk WAV 24-bit/multichannel dari DAW), walker membaca ID chunk dari tengah ekstensi fmt → chunk `data` tidak ketemu → `dataSize_ == 0` → `return false` (`decoder/PCMDecoder.cpp:335-336`). WAV yang sah ditolak.
- `getCapabilities()` mengklaim `"pcm"` (`decoder/PCMDecoder.cpp`, `supportedFormats = {"wav", "aiff", "pcm"}`), tapi factory tidak mendaftarkan `"pcm"`, dan `parseWavHeader` butuh magic RIFF — raw PCM tanpa header tidak akan pernah terbuka.

**Dampak:** laten (D-M5 — decoder mati), tapi jalur WAV/PCM mentah praktis hanya menerima WAV PCM 16-bit, `fmtSize` tepat 16, dan menolak/menyalahartikan sisanya — diam-diam (return false tanpa pesan error yang menjelaskan sebabnya, kecuali "PCM file not open" di `onDecode`). Perbaikan: `fseek(file_, fmtSize - 16, SEEK_CUR)` bila `fmtSize > 16`; tolak `audioFormat != 1` (PCM).

### D-M7 — PCMDecoder tidak memvalidasi header: div-by-zero dan alokasi raksasa dari header korup

**Bukti (terverifikasi):** `parseWavHeader` tidak memeriksa `channels` atau `sampleRate` sebelum dipakai sebagai pembagi:
- `decoder/PCMDecoder.cpp:339-341`: `totalFrames_ = dataSize_ / format_.bytesPerFrame();` — `bytesPerFrame() = channels * bytesPerSample()` (`decoder/DecoderTypes.h:93`). Kalau header korup mengklaim `channels == 0` → **pembagian dengan nol (SIGFPE → proses mati)**.
- `decoder/PCMDecoder.cpp:112`: `bytesRead / bytesPerFrame` di `onDecode` — pembagi nol yang sama di jalur decode.
- `decoder/PCMDecoder.cpp:87-92`: `std::vector<uint8_t> raw(maxFrames * bytesPerFrame);` dialokasi **per panggilan** `onDecode` — header dengan `channels` besar (mis. 1000+) × `maxFrames` 16384 → alokasi puluhan–ratusan MB per chunk; `channels` maksimal uint16_t (65535) × 4 byte × 16384 frame ≈ 4 GB → `std::bad_alloc` tak tertangkap di thread decoder → `std::terminate` (tidak ada try/catch di `workerLoop`, lihat d-m16).
- Kalau `sampleRate == 0`: `getPositionSeconds`/`getDurationSeconds` aman (guard `== 0`), tapi `applyResampling` akan memanggil `StreamResampler::configure(0, 48000, ...)` → `LinearResampler::getOutputFramesForInput` membagi dengan `mInputRate == 0` → UB.

**Dampak:** laten (decoder tidak terjangkau — D-M5), tapi ini crash deterministik dari satu file WAV korup kalau jalur ini pernah dihidupkan. Validasi murah: tolak `channels == 0 || channels > 8`, `sampleRate == 0 || sampleRate > 384000`, `bitsPerSample` di luar {8,16,24,32}.

### D-M8 — Tiga jalur resolve cache, penamaan tidak konsisten (`track_` vs `audio_`)

**Bukti (terverifikasi):**
- Native — `decoder/ContentUriResolver.cpp:263`: `audio_%d.%s`
- Kotlin service — `android/app/src/main/java/com/pristineaudio/playback/NativePlaybackService.kt:435`: `audio_${uriString.hashCode()}.$ext`
- Kotlin legacy module — `android/app/src/main/java/com/pristineaudio/audio/NativePlaybackModule.kt:270`: `track_${uriString.hashCode()}.$ext`, dengan ext default berbeda: module memakai `?: "tmp"` (`NativePlaybackModule.kt:274`), service dan native memakai `"cache"`.

**Dampak:** satu URI yang sama menghasilkan DUA file cache (`audio_<hash>.mpeg` dan `track_<hash>.tmp`) kalau pernah lewat jalur module. Lebih parah: `NativePlaybackModule.setQueue` me-resolve SEMUA URI secara eager (loop di `NativePlaybackModule.kt:187`), berlawanan dengan desain lazy/deferred (service hanya resolve 5 pertama, `MAX_PRE_RESOLVE = 5`, `NativePlaybackService.kt:19`; sisanya deferred ke resolver native). Test anti-regresi `src/__tests__/shared/utils/cacheNaming.test.ts` hanya mengunci penamaan `audio_` + hash — jalur `track_` tidak tercakup. **Status jalur `track_` hari ini:** dorman tapi terjangkau. Spec TurboModule mendeklarasikannya (`src/specs/NativePlaybackModule.ts:16`: `setQueue(uris: string[]): void`), tetapi **tidak ada satu pun file JS yang mengimpor `specs/NativePlaybackModule`** (grep `NativePlaybackModule` di `src/` → hanya `diagnostics.ts` yang memakainya sebagai fallback untuk `getStatus`/`getPosition`/`getCurrentTrack`, bukan `setQueue`; `engine.ts:286` memanggil `NativePlaybackService.setQueue`). Jadi bug ini tidak hidup hari ini — tetapi satu panggilan JS di masa depan ke `NativePlaybackModule.setQueue` langsung mengaktifkannya, dan tidak ada test yang akan menangkapnya. (Catatan: cleanup service `NativePlaybackService.kt:294` menghapus `audio_*` DAN `track_*` — pembersihan tahu ada dua nama, tapi penamaan tetap divergen.)

### D-M9 — Cache-hit check tidak membuktikan file lengkap; file parsial dilayani sebagai hit

**Bukti (terverifikasi pada mekanisme):**
- Hit check — `decoder/ContentUriResolver.cpp:276-283`: hanya `exists() && length() > 0`.
- Salinan native tidak atomik — `decoder/ContentUriResolver.cpp:339`: `fopen(target, "wb")` membuat/meng-truncate target SEGERA; kalau proses mati antara fopen dan fclose, file parsial tertinggal. `std::remove` di `:344` hanya berjalan kalau proses masih hidup dan fwrite gagal (write pendek DIBERSIHKAN — jadi lubangnya hanya kill/crash di tengah salinan).
- Salinan Kotlin juga tidak atomik — `NativePlaybackService.kt:440-460` (`file.outputStream().use { output -> input.copyTo(output) }`) dan `NativePlaybackModule.kt:274-280` menulis langsung ke target. Exception di tengah `copyTo` (provider mati, I/O error) meninggalkan file parsial yang lolos hit check di KEDUA jalur.

**Dampak:** track yang salinannya pernah gagal akan dilayani sebagai "hit" berupa file terpotong — FFmpeg membuka file truncated → decode error / track terpotong / gagal buka — tanpa jejak bahwa sumber masalahnya adalah cache, bukan file aslinya. Komentar kode yang mengklaim "file cache tidak pernah setengah jadi kalau proses mati di tengah salinan" adalah **SALAH** (menurut Track D; mekanismenya terverifikasi di atas). Skenario pemicu nyata: (a) copy Kotlin throw di tengah jalan → file parsial → resolve berikutnya (native atau Kotlin) menganggapnya hit; (b) resolve native dari advance thread beradu dengan copy Kotlin dari JS thread untuk URI yang sama (dua thread berbeda; controller hanya menserialisasi loadTrack, bukan copy Kotlin). **Mitigasi yang sudah ada:** `clearCache` menghapus SEMUA file cache tiap cold boot (`NativePlaybackService.kt:287-308`, dipanggil dari `src/app/_layout.tsx:135-143`), jadi jendela bug ini hanya dalam satu sesi — tetapi dalam sesi itu bugnya nyata. **Arah perbaikan:** tulis ke file temp lalu `rename()` atomik, atau simpan + verifikasi panjang yang diharapkan.

---

## Temuan MINOR (40, setelah deduplikasi antar-track)

Nomor `d-m` baru untuk dokumen ini; kolom "Track" merujuk ke temuan asal (A/B/C/D) supaya bisa dilacak ke laporan per track.

| # | Temuan | Lokasi | Track |
|---|---|---|---|
| d-m1 | `getDurationSeconds()` tanpa guard `AV_NOPTS_VALUE` → ≈ −9,2e12 dtk kalau durasi tak diketahui; tertahan karena kedua call site `PlaybackController` memeriksa `> 0.0` | `FFmpegDecoder.cpp:501-506` | A-m1, B-m8 |
| d-m2 | `currentFrame_` dibaca/ditulis 2 thread tanpa sinkronisasi; saat ini **tidak terjangkau** (satu-satunya pemanggil `worker->getPosition()` adalah `seek`, setelah `pause()`). Perbaikan: `std::atomic<uint64_t>` | `FFmpegDecoder.cpp:512-528`, `DecoderWorker.cpp:161-164` | A-m2, B-m7 |
| d-m3 | `swr_convert` return negatif didiamkan → frame dibuang, kegagalan persisten menyamar jadi EOF | `FFmpegDecoder.cpp:261-277` | A-m3 |
| d-m4 | Tidak ada flush NULL saat EOF: ekor delay codec (MP3 ~12 ms, AAC ~21 ms) hilang tiap track; cabang `AVERROR_EOF` (:189-192) juga membuang sample yang sudah terkumpul (praktis tak terjangkau tanpa flush) | `FFmpegDecoder.cpp:139-192` | A-m4 |
| d-m5 | Error baca demux disamarkan jadi `EndOfStream`; P-M10 tidak menyala untuk ini (tapi EOF tetap advance) | `FFmpegDecoder.cpp:158-164` | A-m5, D-m5 |
| d-m6 | Status akhir menimpa status loop: error baca setelah sebagian frame jadi `Success` | `FFmpegDecoder.cpp:379-384` | A-m6 |
| d-m7 | `avcodec_send_packet` EAGAIN tidak dibedakan dari error fatal; kalau terpicu, track di-skip sebagai "korup" via P-M10. Probabilitas **DUGAAN** (rendah untuk decoder audio) | `FFmpegDecoder.cpp:171-177` | A-m7 |
| d-m8 | `onSeek` tidak me-flush `swr`: ~1–3 ms audio pra-seek bocor ke output pasca-seek | `FFmpegDecoder.cpp:393-435` | A-m8 |
| d-m9 | Posisi pasca-seek = posisi yang diminta, bukan keyframe; offset menetap, ≤ ~1 frame untuk MP3/FLAC/AAC. Sudah didokumentasikan jujur di kode (koreksi `cur_dts` benar) | `FFmpegDecoder.cpp:429-433` | A-m9 |
| d-m10 | `convertSampleFormat` tak kenal format planar: AAC (FLTP) → `Unknown`. Dampak saat ini nol (tidak ada pemakai `sampleFormat`) | `FFmpegDecoder.cpp:652-660` | A-m10 |
| d-m11 | Scan NaN/magnitudo ganda yang redundan: loop kedua sepenuhnya tercakup loop pertama | `FFmpegDecoder.cpp:280-326` | A-m11 |
| d-m12 | Dead code `FFmpegDecoder`: `decodeFrame()` dideklarasi tak pernah didefinisikan/dipanggil; member `inputFormat_`, `durationFrames_`, `packetBuffer_` tak terpakai; `DecodeConfig.targetChannels` dan parameter `hint` di `onOpen` diabaikan | `FFmpegDecoder.h:83,100-105` | A-m12, B-m9, D-m8 |
| d-m13 | `isSeekable()`/`getCapabilities()` mengklaim berlebihan (seek selalu true, `supportedFormats` hanya 7 entri); `getCapabilities()` 0 pemanggil | `FFmpegDecoder.cpp:≈530` | A-m13 |
| d-m14 | `reserve(maxFrames * 2)` bisa overflow `uint32_t` + `bad_alloc` tak tertangkap; `maxFrames == 0` → `EndOfStream` palsu. Laten (`chunkFrames` praktiknya 16384) | `FFmpegDecoder.cpp:139-145` | A-m14 |
| d-m15 | `onSeek` tanpa validasi input (NaN → UB di cast ke `int64_t`); keterjangkauan **DUGAAN** | `FFmpegDecoder.cpp:393-411` | A-m15 |
| d-m16 | `workerLoop` tanpa try/catch: exception = `std::terminate`. Pemicu konkret: D-M7 varian channels raksasa | `DecoderWorker.cpp:196-275` | B-m1 |
| d-m17 | `DecodeStatus::NotSupported` tidak ditangani di `workerLoop` → infinite loop diam-diam bila suatu decoder mengembalikannya (hari ini tidak ada yang mengembalikan) | `DecoderWorker.cpp:236-264` | B-m2 |
| d-m18 | Cabang `NeedMoreData` mati + `sleep_for(2ms)`-nya berada **di dalam** scope `decodeMutex_` | `DecoderWorker.cpp:260-263` | B-m3 |
| d-m19 | Static counter log non-atomik + kumulatif lintas track (`loopCount`, `totalNan`, `totalOut`, `resampleLogCount`, `decodeLogCount`) — praktis aman (satu worker hidup), nilainya menyesatkan | `DecoderWorker.cpp:226`, `FFmpegDecoder.cpp:319,340,353,371` | B-m4, D-m13 |
| d-m20 | `FFmpegDecoder` Error tanpa `errorMessage` (worker log `Error: ` kosong; P-M10 tetap skip, diagnostiknya kosong) | `FFmpegDecoder.cpp:175,195` | B-m5 |
| d-m21 | `seek()`/`seekToFrame()` membersihkan `eof_` bahkan saat gagal; `PCMDecoder::isSeekable()` return `true` hardcoded bahkan saat file tertutup | `AudioDecoder.cpp:113,136`, `PCMDecoder.cpp:190-192` | B-m6, D-m14 |
| d-m22 | `hasError()`/`lastError_` tidak konsisten dengan state: `decode()` menyetel state `Error` pada `FatalError` tanpa mengisi `lastError_`. Tidak ada pemakai di luar base | `AudioDecoder.cpp:83-86,196-203` | B-m11 |
| d-m23 | `start()` mengabaikan hasil `seek(startPosition)` — seek awal gagal → worker jalan dari posisi 0 diam-diam. Mati dalam praktik (`startDecoder` selalu `start(uri, 0.0)`) | `DecoderWorker.cpp:68-70` | B-m12 |
| d-m24 | Callback EOF jalan di bawah `decodeMutex_`; callback controller memanggil `scheduleAdvance()` yang me-`join` advance thread sebelumnya. Dalam urutan normal join itu instan — catatan arsitektur, bukan bug hidup | `DecoderWorker.cpp:221-243` | B-m13 |
| d-m25 | `pause()` block satu chunk decode (p-m22, by design — **diukur**: tipikal sub-ms s.d. beberapa ms, menimpa thread JS bukan audio thread). Aman, tidak perlu diubah | `DecoderWorker.cpp:95-110` | B-m14 |
| d-m26 | `LinearResampler` di-reset tiap chunk: `applyResampling` memanggil `configure()` di setiap chunk → fase 0 tiap chunk (diskontinuitas di batas chunk + sisa fraksional terbuang). Hanya relevan kalau resampling benar-benar jalan (D-M1) | `AudioDecoder.cpp:233-238`, `LinearResampler.cpp:35,42-44` | C-m1 |
| d-m27 | `needsResampling()` mencampur laju dan channel; konversi channel tidak pernah terjadi — output tetap ber-channel input. File mono 48 kHz: resampler dikonfigurasi `channels=1` membaca buffer stereo-interleaved seolah mono (lihat juga D-M1 kasus mono) | `AudioDecoder.cpp:160-165,233-238` | C-m2 |
| d-m28 | Output `StreamResampler` meminjam buffer internal (`output.pcm.data = mOutputBuffer.data()`) — jebakan untuk pemakai berikutnya; aman hari ini karena `applyResampling` langsung menyalin | `StreamResampler.cpp:94` | C-m3 |
| d-m29 | `DecoderUtils` mati total (7 fungsi, 0 pemanggil) + diduplikasi `PCMDecoder::convertToFloat` (skala + sign-extension 24-bit yang sama). Isi util sendiri benar | `DecoderUtils.{h,cpp}`, `PCMDecoder.cpp` | C-m4 |
| d-m30 | Deteksi format factory hanya dari ekstensi, tanpa sniffing dan tanpa log; `content://` tanpa ekstensi → `nullptr` tanpa log | `DecoderFactory.cpp:111-137` | C-m5 |
| d-m31 | `SincResampler` adalah stub yang fallback ke linear (`SincResampler.cpp:82-88`); `createResampler` 0 pemanggil. **Jawaban M2 (audit lama):** resampler produksi memang linear di jalur base — dan "Sinc" tidak hanya tidak dipakai, isinya pun linear | `SincResampler.cpp:42-88`, `AudioResampler.cpp:56-68` | C-m6 |
| d-m32 | `ContentUriResolver::isReady()` 0 caller; urutan init sudah aman tanpa guard ini | `ContentUriResolver.{h,cpp}` | D-m1 |
| d-m33 | `DecoderWorker::setErrorCallback` tidak pernah di-set controller (kanal error generik tak terhubung; aman karena null-guarded; error start/seek tetap sampai lewat return value → P-M10 skip) | `DecoderWorker.cpp:149` | D-m2 |
| d-m34 | Hash cache 32-bit tanpa verifikasi isi (tabrakan = file audio yang SALAH dilayani diam-diam); divergensi non-ASCII native (UTF-8) vs Java (UTF-16) **DUGAAN**, test hanya ASCII | `ContentUriResolver.cpp:263` | D-m3 |
| d-m35 | `resolve()` tanpa mutex; dua resolve bersamaan untuk URI sama bisa merusak file (jalur normal aman karena controller menserialisasi `loadTrack`; celahnya advance thread vs copy Kotlin) | `ContentUriResolver.cpp:155` | D-m4 |
| d-m36 | `seekToFrame` beda domain antar decoder (FFmpeg = output, PCM = input); laten, 0 caller | `FFmpegDecoder.cpp:441`, `PCMDecoder.cpp:161-185` | D-m6 |
| d-m37 | State machine decoder ditulis tapi tidak dibaca siapa pun (`Draining`/`Flushing` mati, `AtomicDecoderState` 0 caller); berfungsi sebagai log internal semata | `DecoderState.h`, `AudioDecoder.cpp` | D-m9 |
| d-m38 | Dua celah JNI kecil: `PushLocalFrame` unchecked (`:75`); `GetMethodID(toString)` failure path tidak clear exception (`:114`). Keduanya praktis tidak tercapai | `ContentUriResolver.cpp:75,114` | D-m10 |
| d-m39 | Cache tanpa batas dalam satu sesi (~150 MB–1 GB worst case 50 track); pembersihan hanya di cold boot | `NativePlaybackService.kt:287-308` | D-m11 |
| d-m40 | Build tanpa prebuilt FFmpeg gagal di link time, bukan degrade: `CMakeLists.txt:140` meng-exclude `FFmpegDecoder.cpp` (hanya WARNING) tapi `PlaybackController.cpp:4,919` mereferensikannya tanpa `#ifdef` | `CMakeLists.txt:140` | D-m12 |

---

## DUGAAN (bukan fakta — perlu verifikasi device / log)

| # | Dugaan | Cara verifikasi |
|---|---|---|
| Dg-1 | Gejala Oktober ("garbage 1e32", "chipmunk") berasal dari D-M1, bukan dari starvation queue seperti diklaim komentar kode | Mainkan file 96 kHz / 44,1 kHz; bandingkan gejala dengan log Oktober |
| Dg-2 | File 44,1 kHz terdengar patah (D-M1 kasus 44,1 kHz: ~8% frame terbuang per chunk) | Mainkan MP3 44,1 kHz, dengarkan (gap/klik tiap ~0,34 dtk?), kirim logcat |
| Dg-3 | Race `loadTrack` konkuren (D-M3) pernah terpicu | Stress test: tekan Next berulang tepat saat track habis (jendela drain-wait → advance); atau TSAN bila tersedia |
| Dg-4 | Track pertama 96 kHz benar 2× cepat (D-M2) | Cold start → langsung mainkan track 96 kHz sebagai lagu pertama, dengarkan + cek `startDecoder: targetSampleRate=` di logcat |
| Dg-5 | `avcodec_send_packet` EAGAIN pernah terpicu (d-m7) | Log sementara nilai kembali `send_packet` saat memutar file panjang |
| Dg-6 | `onSeek` NaN terjangkau dari JS (d-m15) | Grep jalur `seek()` JS → JNI → controller untuk satu nilai non-finite/negatif |
| Dg-7 | Hash cache non-ASCII divergen native vs Java (d-m34) | Bandingkan hash native vs `String.hashCode()` untuk URI berkarakter non-ASCII |

---

## Dead code (terverifikasi 0 pemakai)

Metode verifikasi umum Track D: `grep -rn "<simbol>" android/app/src/main/cpp android/app/src/main/java src/` (dan untuk simbol C++, grep nama mentah + nama qualified). Pengecualian yang diperiksa secara khusus: **virtual/override** (semua virtual `AudioDecoder` diperiksa dari sisi pemanggil base-pointer — yang hidup hanya `open/seek/close/decode/config/getPositionSeconds/getDurationSeconds` + override yang dipanggil base class); **factory** (`DecoderFactory` satu-satunya pemakai `PCMDecoder`; factory sendiri 0 pemakai eksternal); **nama dinamis/JNI** (simbol decoder tidak diekspos lewat JNI — grep di `cpp/jni/` kosong; Kotlin/TS tidak bisa menamai simbol C++; pengecualian `ContentUriResolver::init` dari `jni/OnLoad.cpp:69` — hidup); **test** (tidak ada test C++; test TS `cacheNaming.test.ts` hanya mengunci penamaan `audio_`).

| Simbol | File |
|---|---|
| `DecoderFactory` (seluruh class: `createDecoder`, `createDecoderForFormat`, `registerDecoder`, `getSupportedExtensions`) | `decoder/DecoderFactory.{h,cpp}` |
| `PCMDecoder` (seluruh class) | `decoder/PCMDecoder.{h,cpp}` |
| `DecoderUtils` (7 fungsi: `s16ToFloat`, `s24ToFloat`, `s32ToFloat`, `interleavedStereoToPlanar`, `planarStereoToInterleaved`, `zeroBuffer`, `applyGain`) | `decoder/DecoderUtils.{h,cpp}` |
| `StreamResampler::reset`, `StreamResampler::required` | `decoder/StreamResampler.{h,cpp}` |
| `ContentUriResolver::isReady` | `decoder/ContentUriResolver.{h,cpp}` |
| `DecoderWorker::setErrorCallback`, `setChunkSize`, `getState`, `isRunning`, `getFormat`, `currentUri_` | `decoder/DecoderWorker.{h,cpp}` |
| `AudioDecoder::getState`, `getLastError`, `setEof`, `clearError`, `getOutputFormat`, `getInputFormat`, `getPositionFrames`, `seekToFrame`, `setTargetFormat`, `getCapabilities`, `isEof`, `hasError` | `decoder/AudioDecoder.{h,cpp}` |
| `FFmpegDecoder::decodeFrame`, `durationFrames_`, `packetBuffer_`, `inputFormat_` | `decoder/FFmpegDecoder.h` |
| `PCMDecoder::currentByteOffset` | `decoder/PCMDecoder.h` |
| `SampleFormat::S24P32`, `AudioFormat::bitrate`, `DecodeConfig::targetChannels/readAheadChunks/fastSeek/maxConsecutiveErrors/continueOnError`, `DecodeStatus::NotSupported`, `DecodeResult::isEof`, `AudioMetadata`, `SeekMode`, `SeekRequest`, `StreamInfo` | `decoder/DecoderTypes.h` |
| `DecoderState::Draining`, `DecoderState::Flushing`, `AtomicDecoderState::is/canDecode/canSeek/hasError/waitFor` | `decoder/DecoderState.h` |
| `NativePlaybackService::resolveUri` (on-demand, spec + `@ReactMethod`) | `playback/NativePlaybackService.kt:274`, `src/specs/NativePlaybackService.ts:54` |
| `DecodeResult::framePosition`, `framesDecoded` | `decoder/DecoderTypes.h` — hanya ditulis (`FFmpegDecoder::onDecode`, `DecoderWorker::workerLoop`) dan dibaca oleh `applyResampling` (D-M1); callback controller (`PlaybackController.cpp:1040-1043`) hanya memakai `result.samples` |
| `PCMView`, `DecodedChunk`, `DecodeStatus::NeedMoreData` | `decoder/DecoderTypes.h` — hanya dipakai jalur `applyResampling` (D-M1) / cabang handler yang tidak pernah diproduksi |

Catatan penghapusan: menghapus simbol-simbol di atas aman diverifikasi oleh build — tidak ada pemanggil, jadi tidak ada yang akan patah di compile time. Pengecualian yang harus dicek manual sebelum hapus: `DecoderUtils::applyGain` vs `pristine::simd::applyGain` (namespace berbeda, keduanya mati — hapus keduanya atau satukan); `DecodeStatus::NeedMoreData` (cabang handler di workerLoop boleh dipertahankan sebagai defensif, atau dihapus bersama enum-nya).

---

## Inkonsistensi antar-decoder (kontrak `AudioDecoder`)

| Aspek | `FFmpegDecoder` | `PCMDecoder` | Akibat |
|---|---|---|---|
| Domain `currentFrame_` / `getPositionFrames()` | **Output** (laju target): `currentFrame_ += converted` | **Input** (laju file): `currentFrame_ += framesRead` | Kontrak tidak konsisten. `getPositionFrames()` saat ini 0 pemanggil, jadi belum berdampak — tapi siapa pun yang memakai `getPositionFrames()` untuk seek/clock akan salah untuk salah satu decoder. |
| `getPositionSeconds()` | `currentFrame_ / targetSampleRate` | `currentFrame_ / sampleRate` file | Keduanya benar dalam detik — konsisten, selama pembaginya sesuai domain masing-masing. |
| `getDurationSeconds()` | Durasi container (`formatCtx_->duration`) — estimasi untuk VBR | `totalFrames_ / sampleRate` dari ukuran chunk `data` — eksak untuk PCM | Beda sumber; untuk MP3 VBR durasi container bisa meleset dari jumlah frame ter-decode. |
| `onSeek` / `onSeekToFrame` | Frame = domain output; `onSeekToFrame` konversi frame→detik→`onSeek` | Frame = domain input; `onSeekToFrame` clamp ke `totalFrames_` lalu `fseek` | Keduanya akurat per frame (PCMDecoder eksak per sampel; FFmpeg mundur ke keyframe — sudah dikoreksi di p-m10). Tapi `seekToFrame` base class tidak menyatakan domainnya — pemanggil tidak bisa tahu frame itu laju yang mana. |
| EOF | `onDecode` mengembalikan `EndOfStream` untuk **semua** `av_read_frame < 0` — termasuk I/O error, bukan hanya EOF | `EndOfStream` hanya kalau `fread` mengembalikan 0 (EOF bersih) | Error baca file FFmpeg disamarkan jadi EOF (track "selesai" padahal gagal baca). Lintas-track: P-M10 men-skip file korup lewat kanal error terpisah, jadi dampaknya kecil. |
| Error | `Error` untuk gagal kirim/terima paket; `FatalError` hanya kalau file tidak terbuka | `FatalError` `"PCM file not open"` kalau `!file_` | Base class hanya memetakan `EndOfStream` dan `FatalError` ke state (`AudioDecoder.cpp:80-98`); `Error` diteruskan mentah — `DecoderWorker` memperlakukan keduanya sama (break + callback), jadi konsisten di praktik. |
| `isSeekable()` | `formatCtx_ != nullptr` | selalu `true` (bahkan sebelum open — tapi `onSeek` memeriksa `!file_`) | Tidak berdampak. |
| Resample | Sudah resample sendiri via swr ke target rate — **lalu di-resample lagi** oleh base class (D-M1) | Tidak resample sendiri — base class satu-satunya resampler (benar secara desain) | Dua decoder membutuhkan perlakuan base class yang berbeda; base class tidak membedakan. |

**Bisakah controller membedakan perilaku keduanya?** Tidak — controller hanya memegang `AudioDecoder*` dan tidak pernah memeriksa tipe/format output aktual. Satu-satunya yang membedakan adalah `getInputFormat()` vs `getOutputFormat()`, dan `getOutputFormat()` tidak pernah diset dari laju stream (D-M1).

---

## Yang sehat (terverifikasi)

- **Accounting domain frame benar di `FFmpegDecoder`** (`FFmpegDecoder.cpp:334-338`): `framesDecoded` domain input, `currentFrame_` domain output, exit condition loop memakai counter output lokal `outputFramesThisCall` — sesuai komentar perbaikan 2026-10-06 dan konsisten dengan pemakaian `getPositionSeconds()` (domain output) di `seek()` P-M8.
- **Resampler produksi = sinc, bukan linear** (`FFmpegDecoder.cpp:602-604`): `filter_size=128`, `cutoff=0.97`, `linear_interp=0` (interpolasi linear **nonaktif** — jalur FIR default libswresample). Dither hanya saat resampling (`SWR_DITHER_TRIANGULAR_HIGHPASS`, 0.5) dan `SWR_DITHER_NONE` saat passthrough — masuk akal karena output selalu float.
- **Guard overflow `swr_convert` tiga lapis benar** (`:236-276`): margin +4096 frame, `scratchBuffer_` 4× kapasitas dengan `temp` diambil setelah `resize`, clamp `converted > outSamples`. Akar SIGSEGV 96 kHz 2026-10-09 ditutup di lapis ini.
- **Guard magnitudo sebelum queue** (loop pertama, `:280-300`): NaN/Inf/|v|>2.0 di-nol-kan sebelum `insert` — penempatan benar. **Tidak ada gain di decoder** (`:309`): PCM keluar utuh dari `swr` — bit-perfect tidak dirusak di lapis ini.
- **`cleanup()` aman double-call** (`:622-642`): semua `av_*_free` / `avformat_close_input` men-NULL-kan pointer; dipanggil dari dtor, `onClose`, awal `onOpen`, dan **semua** jalur gagal `onOpen`. Tidak ada leak/double-free yang ditemukan di jalur-jalur itu. **Disiplin `av_packet_unref`** (`:166-168, :177-180`): paket non-audio dan paket pasca-`send_packet` (sukses/gagal) selalu di-unref.
- **Kegagalan `onSeek` atomik** (`:393-411`): `av_seek_frame` gagal → `return false` sebelum `flush` dan sebelum `currentFrame_` ditulis; state decoder tidak berubah. **Koreksi `cur_dts` benar**: `onSeek` tidak lagi menyentuh field internal `AVStream`; komentar di kode menjelaskan kenapa dan apa konsekuensinya (d-m9).
- **Threading lifecycle sehat**: worker di-join sebelum `open`/`close`/destroy (`DecoderWorker::start`/`stop`, pola M3 `PlaybackController`); `onOpen`/`cleanup` tidak pernah jalan bersamaan dengan `onDecode`. `formatLogged_` per-instance (bukan static) sudah benar.
- **Guard durasi di call site**: kedua pemakai `getDuration()` memeriksa `> 0.0` (`PlaybackController` `loadTrack` dan self-heal `render`), sehingga d-m1 tidak bocor ke UI hari ini. **`DecodeResult` default `Success`** dan **`DecodeConfig` default waras** (48 kHz/2 ch/4096); `chunkFrames` 16384 dari `PlaybackController::startDecoder` sudah memperhitungkan downsample 4:1.
- **p-m19 `start()` menutup double-start sekuensial** (`DecoderWorker.cpp:48-54`): guard `running_ || joinable() → stop()` dulu; `stop()` idempotent, join aman, `decoder_->close()` setelah join (`:79-95`); destruktor memanggil `stop()` (`:33-35`). Double-start pada objek yang sama tidak terjangkau (tiap `startDecoder` membuat worker baru).
- **Pause/resume via `pauseCv_`**: predikat `!paused_ || stopRequested_` (`DecoderWorker.cpp:201-209`); `resume()`/`stop()` notify (`:81`, `:114-115`). Stop saat paused keluar bersih.
- **Pemisahan callback error (P-M10)**: hanya cabang Error/FatalError `workerLoop` memanggil `decodeErrorCallback_` (`:247-259`); error start (`:59`, `:64`) dan seek (`:134`) hanya lewat `errorCallback_` — seek gagal tidak bocor jadi skip-track (terverifikasi dari kedua sisi: worker dan `PlaybackController.cpp:1019-1027`).
- **Flood guard EOF 500 ms**: masih ada dan benar (`PlaybackController.cpp:955-999`) — kunci (uri, waktu) di bawah `eofMutex_`; URI berbeda dalam <500 ms tidak ikut ter-skip; callback error decode sengaja tanpa guard (satu error per worker, loop break).
- **`weak_ptr` di decode callback** (`PlaybackController.cpp:1028-1038`): pause backpressure hanya menyasar worker pemilik data; `lock()` gagal → cabang dilewati. Ambang konsisten: pause >90% (callback), resume <60% (render), keduanya terhadap `availableSamples()/capacitySamples()`.
- **Satu critical section decode+callback**: `decodeMutex_` rekursif — callback yang memanggil `pause()` dari thread yang sama tidak deadlock; `pause()` dari thread lain menunggu chunk selesai (d-m25).
- **Urutan `seek()` controller**: pause → clearing_ + `waitForRenderIdle` → clear → decoder seek → clock dari `getPosition()` hanya bila sukses (`PlaybackController.cpp:461-548`); `worker->seek()` mengambil `decodeMutex_` (`DecoderWorker.cpp:129-137`).
- **Ownership**: decoder `unique_ptr` di worker, worker `shared_ptr` di controller + snapshot; `stopDecoder()` memindah keluar di bawah lock lalu `stop()` di luar lock; tidak ditemukan jalur UAF (callback EOF dijadwalkan ke thread advance, bukan `loadTrack` langsung — komentar di `PlaybackController.cpp:920-935` akurat).
- **Jalur keluar `workerLoop`**: Success/EOF/Error/FatalError semua `break` bersih; `running_=false` di akhir (`:272`); sleep 50 µs per iterasi negligible (chunk 16.384 frame ≈ 341 ms audio).
- **`PCMDecoder` konsisten domain**: tanpa resampling internal, `framesDecoded` = frame native di buffer — jalur base-class resampler **benar** untuknya (kontras dengan `FFmpegDecoder`, D-M1). Posisi dan seek konsisten dalam domain file.
- **Posisi `FFmpegDecoder` konsisten internal**: `currentFrame_` domain output, `getPositionSeconds()` membagi `targetSampleRate` (`FFmpegDecoder.cpp:512-524`); `onSeek` menulis domain yang sama (`:431-433`).
- **`DecodeConfig`**: `startDecoder` mengisi `targetSampleRate` + `chunkFrames` 16384 (`PlaybackController.cpp:889-914`); ctor worker fallback ke 4096 bila `chunkFrames == 0` (`DecoderWorker.cpp:23-30`). **Prioritas thread**: `setpriority(-16, AUDIO)` (`DecoderWorker.cpp:183-195`) dengan log bila gagal.
- **Matematika `LinearResampler` sendiri benar** (dalam isolasi): interpolasi linear standar, `mRatio = in/out`, sisa fraksional dibawa antar `process()`, estimasi `getOutputFramesForInput` memakai `ceil` (batas atas yang aman), dan baca `input[index]`/`input[index+1]` terjaga karena loop berhenti saat `index >= inputFrames - 1`. Yang rusak adalah **pemakaiannya** (reset tiap chunk, jumlah frame salah, double-resample) — bukan rumusnya.
- **Alur `AudioDecoder::decode()` benar secara struktur:** `EndOfStream` dikembalikan dini tanpa resampling; `FatalError` memetakan ke state Error; `open()` memanggil `refreshFormats()` setelah `onOpen`; lifecycle `open()`/`close()`/`isOpen_` konsisten.
- **Passthrough `StreamResampler` benar:** kalau `!mRequired`, `output = input` tanpa salinan — tidak ada overhead untuk file 48 kHz stereo.
- **Parsing WAV `PCMDecoder` untuk kasus standar benar:** melewati chunk tak dikenal sampai menemukan `"data"`, konversi 16/24/32-bit ke float tepat (skala + sign-extension 24-bit), seek di-clamp ke `totalFrames_`, frame parsial di akhir file dipotong bersih, dan posisi/durasi konsisten dalam domain file.
- **Registry `DecoderFactory` rapi sebagai pola:** lowercase ekstensi (case-insensitive) benar; `registerDecoder` + `createDecoderForFormat` bersih — masalahnya bukan implementasi, melainkan tidak ada yang memakai dan janjinya (AIFF, PCM mentah) tidak dipenuhi implementasi.
- **Konversi `DecoderUtils` benar** (skala + sign-extension + layout stereo) — hanya saja mati dan diduplikasi.
- **Tidak ada leak yang ditemukan** di track ini: `PCMDecoder::onClose` menutup `FILE*`; `StreamResampler` tidak memiliki kepemilikan yang bocor; `DecoderFactory` hanya menyimpan `std::function`.
- **Alur resolve native lengkap dan benar di jalur hidupnya** (`ContentUriResolver.cpp:155-360`): non-`content://` dikembalikan apa adanya; `content://` → `getType` untuk ekstensi → hit check → `openInputStream` → baca penuh ke memori → tulis ke cache → kembalikan path cache. Gagal di titik mana pun → `""`, dan `FFmpegDecoder::onOpen` memperlakukan `""` sebagai gagal buka — tidak ada fallback diam-diam ke URI mentah. **Tidak ada path traversal**: target selalu `cacheDir + "/audio_<int32>.<ext>"`; ekstensi diambil dari subtype MIME setelah `/` terakhir (tidak bisa mengandung `/`).
- **Konsistensi native ↔ Kotlin service untuk jalur hidup**: `audio_<javaStringHashCode>.<ext>` identik di `ContentUriResolver.cpp:263` dan `NativePlaybackService.kt:435`; test `src/__tests__/shared/utils/cacheNaming.test.ts` mengunci hash terhadap nilai Java nyata. **Pembatas eager vs lazy sudah tepat**: service me-resolve maksimal 5 URI pertama (`MAX_PRE_RESOLVE`); sisanya deferred ke resolver native. **Pembersihan cache tiap cold boot berfungsi** (`clearCache`, `NativePlaybackService.kt:287-308`).
- **Build: semua 18 file decoder terkompilasi, tidak ada orphan.** `CMakeLists.txt:73-88` memakai `file(GLOB_RECURSE ... "decoder/*.cpp")` — kedelapan `.cpp` decoder tercakup; ketujuh file JNI yang didaftar eksplisit (`CMakeLists.txt:90-98`) semuanya ada di disk. `StreamResampler::process` aman untuk input kosong (`LinearResampler::process` return lebih awal untuk `inputFrames <= 1` / buffer null).

---

## Koreksi atas audit lama

**2026-11-11 — KOREKSI klaim `AUDIT_2026-11-10.md` "resampler produksi = interpolasi linear" (M2 Track 2).** Yang benar: resampler produksi `FFmpegDecoder` adalah **sinc libswresample** (`linear_interp=0`, `filter_size=128`, `cutoff=0.97`, `FFmpegDecoder.cpp:602-604`). Resampler **linear ikut jalan di produksi** sebagai resampler KEDUA untuk file non-48 kHz/non-stereo — di atas hasil sinc, dengan frame-count salah domain (D-M1 di atas). Untuk file 48 kHz stereo, tidak ada resampling kedua sama sekali. Dan `SincResampler` bukan hanya tidak dipakai — `process()`-nya stub yang fallback ke linear (`SincResampler.cpp:82-88`), jadi kalau suatu hari kualitas resample mau dinaikkan, `SincResampler` harus ditulis ulang, bukan "diaktifkan". (Koreksi yang sama dicatat di `docs/AUDIT_2026-11-10.md` sebagai catatan bertanggal, bukan penghapusan diam-diam.)

**2026-11-11 — KOREKSI atas laporan Track D (D-M4).** Klaim "lapisan resampling base-class mati; `needsResampling()` selalu false" **salah** — dibuktikan tiga track lain + verifikasi asisten: untuk file non-48 kHz, `needsResampling()` TRUE dan `applyResampling()` JALAN (D-M1). Penyebab salah baca Track D: `refreshFormats()` hanya menimpa `outputFormat_` kalau tidak valid, dan Track D mengasumsikan default `AudioFormat` tidak valid — padahal default 48000/2 **valid** (`isValid()` = rate>0 && channels>0), jadi `outputFormat_` selalu 48000/2, bukan sama dengan `inputFormat_`. Yang benar dari D-M4: `outputFormat_` tidak pernah diset ke nilai nyata, jadi `getOutputFormat()` selalu mengaku 48000/2. Dicatat di sini supaya kesalahan ini tidak diwariskan ke perbaikan.

**2026-11-11 — KOREKSI wording Track C atas D-M1 kasus bit-perfect.** Track C menulis file 96 kHz di stream 96 kHz "jalan setengah kecepatan". Yang benar (terbukti harness Track B: outFrames 17.280 → 8.640): audio jalan **2× terlalu cepat** (durasi separuh), karena output 48 kHz dimasukkan ke stream 96 kHz.

---

## Verifikasi device (yang bisa membuktikan/membantah temuan ini)

- **D-M1 + D-M2 (paling berdampak):** mainkan 1 file 44,1 kHz dan 1 file 96 kHz di APK saat ini (a5febc3a). Perkiraan: 96 kHz = noise/garbage di separuh tiap chunk (berpotensi crash); 44,1 kHz = terdengar ~8,8% lebih lambat; track pertama 96 kHz setelah cold start = 2× cepat. Bukti: logcat (`startDecoder: targetSampleRate=` vs laju stream, `onTrackLoaded`) + dengarkan. **Ini tes yang sama dengan tes M1 di daftar PR** (`~/workspace/your_files/PR-audio-delight.md`) — tes itu kini membuktikan/membantah D-M1 sekaligus.
- **D-M3:** stress test — tekan Next berulang tepat saat track habis (jendela drain-wait → advance); atau TSAN bila tersedia.
- **D-M9:** bunuh app di tengah salinan cache (sulit dipicu sengaja); alternatif: cari file cache yang ukurannya jauh lebih kecil dari file asli di tengah sesi lalu mainkan track itu.
- **D-M8:** tidak perlu device test — dorman; cukup hapus/satukan jalur `track_` atau kunci dengan test.

---

## Perbaikan 2026-11-11 — BELUM DIKERJAKAN (catat dulu)

Sesuai metode kerja: temuan dicatat dulu, csheva memilih apa yang diperbaiki dan urutannya. Kandidat perbaikan berikutnya yang paling berdampak menurut audit ini: **D-M1** (satu file 96 kHz bisa crash app; dan tes M1 yang sudah lama tertunda adalah tes yang membuktikannya).

---

## Perbaikan 2026-11-11 — DIKERJAKAN (csheva: "perbaiki semua 9 major")

Semua 9 MAJOR diperbaiki dalam 7 commit terpisah (D-M5+D-M6+D-M7 satu commit karena ketiganya mati bersama file yang sama), lalu SATU build Dev gabungan di akhir. Tidak ada file JS/TS yang berubah (murni native C++ + Kotlin).

| Temuan | Commit | Perbaikan |
|---|---|---|
| D-M1 double resampling + heap OOB | `7e6fd5a6` | `AudioDecoder::needsResampling()` dijadikan virtual; `FFmpegDecoder` override → `false` (swr sudah output target rate + stereo, base tidak boleh resample lagi). `startDecoder()` memanggil `setTargetFormat()` (target rate swr + 2 ch) supaya `getOutputFormat()` jujur. Komentar invarian di `FFmpegDecoder.cpp:333` (framesDecoded SENGAJA domain input; applyResampling tidak boleh jalan untuk decoder ini). `framesDecoded` TIDAK diubah domainnya (akuntansi 2026-10-06 dipertahankan). |
| D-M2 track pertama non-48 kHz 2× cepat | `05e2c77c` | `startDecoder()`: `cfg.targetSampleRate` = laju stream bila valid, else laju file (`track.sampleRate`), else default 48000. Target dicatat di `decoderTargetRate_`; `EngineManager::start()` setelah stream terbuka memanggil `reloadIfDecoderRateMismatch(actualRate)` — muat ulang track kalau decoder dibuat dengan target berbeda (kasus perangkat tidak mendukung laju file). `start()` melepas `mMutex` dulu (pola B1) supaya reload → `onTrackLoaded` → `reopen` tidak deadlock. |
| D-M3 loadTrack konkuren | `7d885550` | `loadTrackMutex_` (`std::recursive_mutex`) dipegang sepanjang `loadTrack()`. Recursive karena nesting `loadTrack → listener → onTrackLoaded → reopen → loadTrack` di thread yang sama. `cancelPendingAdvance()` dipindah ke SEBELUM ambil lock, supaya flag batal terlihat advance thread sebelum thread manual ter-block di mutex. |
| D-M4 `~AudioDecoder` virtual murni | `85d52b85` | `close()` dihapus dari `~AudioDecoder()` (virtual dispatch saat destruksi base = terminate). `onClose()` tetap pure virtual (subclass baru wajib implementasi). Terverifikasi harness standalone: decoder dihancurkan saat open tanpa `close()` eksplisit → tidak terminate. |
| D-M5 + D-M6 + D-M7 factory/PCMDecoder mati + rusak | `3bbd1267` | `git rm` `DecoderFactory.{h,cpp}` + `PCMDecoder.{h,cpp}` (−752 baris; 0 pemakai terverifikasi grep ulang sebelum hapus; CMakeLists glob — tidak perlu diubah). D-M6 (AIFF/WAV/fmtSize) dan D-M7 (SIGFPE `channels==0`, alokasi 4 GB) mati bersama file-nya. Komentar D-M4 di `AudioDecoder.cpp` disesuaikan (tidak lagi merujuk `PCMDecoder::~PCMDecoder`). |
| D-M8 penamaan cache 3 jalur | `bffef97e` | Legacy `NativePlaybackModule.resolveContentUri`: `track_` → `audio_`, ext default `"tmp"` → `"cache"` (sama dengan service + native). Cleanup service yang menghapus `audio_*` DAN `track_*` dibiarkan — berguna membersihkan file `track_` sisa instalasi lama. Sisa: `setQueue` modul masih resolve eager semua URI (dorman; bukan jalur hidup). |
| D-M9 cache-hit palsu | `217f59bf` | Tulis ke file temp + `rename()` atomik di ketiga jalur: native `ContentUriResolver.cpp` (nama temp unik per panggilan via counter atomik — menutup juga d-m35), `NativePlaybackService.resolveContentUriToPath` dan `NativePlaybackModule.resolveContentUri` (nama temp unik via `nanoTime()`). Komentar native yang salah ("file cache tidak pernah setengah jadi") diperbaiki. Sisa file `.tmp` dari proses mati dibersihkan cold boot (`clearCache`) dan tidak pernah lolos hit check (nama tidak cocok pola `audio_*`). |

**Build gabungan:** Dev run **42924533963 SUCCEEDED** (~25 mnt, head SHA `1db962bc` terverifikasi). **APK: 224.054.106 byte (~214 MB), SHA256 `d35579bd7f45da034bb5ef6ce20a6596ccd1cfc8092a2490c46ac69d747aea0d`**, `unzip -t` "No errors detected", `assets/index.android.bundle` 5.368.636 byte (tak berubah — 0 file JS/TS di ronde ini, sesuai ekspektasi), `lib/arm64-v8a/libpristine-audio.so` 396.192 byte (sebelumnya 395.408, +784 byte — konsisten dengan kode native baru D-M1 s.d. D-M9), `lib/x86_64/libpristine-audio.so` 408.624 byte. Artifact retensi 7 hari. Verifikasi device masih menunggu csheva install + tes.

**Residual yang sengaja tidak dikerjakan (tetap minor):** d-m1…d-m40 (lihat tabel minor di atas) — belum dipilih. Dua yang paling layak berikutnya bila csheva mau: d-m4 (flush NULL saat EOF — ekor delay codec ~10–20 ms hilang tiap track) dan d-m31 (SincResampler stub — kalau kualitas resample mau dinaikkan, harus ditulis ulang).
