# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

> **Catatan 2026-10-03.** File ini **baru dibuat**. Sebelumnya PristineAudio tidak punya CHANGELOG sama sekali: versi `1.0.37` di `app.json` tanpa riwayat, dan **nol git tag** di repo. Isi di bawah disusun dari riwayat git commit (`git log --oneline`, 40 commit terakhir) dan **tidak lengkap** - ini merekonstruksi sebagian, bukan mencatat yang sebenarnya pernah dicatat.
>
> Riwayat lengkap tidak bisa direkonstruksi. Yang benar dilakukan: mulai mencatat dari versi berikutnya, dan tag versi sekarang (`v1.0.37`) supaya ada titik acuan. Lihat `ROADMAP.md` Fase 5 dan `RELEASE_PROCESS.md` bagian 1.

---

## [Unreleased] - 2026-10-03

### Added

- **Test otomatis pertama** - Jest + ts-jest, **98 test di 6 suite** untuk logika murni TS:
  `LrcParser` (11), `dsp` (19), `audio` (15), `dac` (13), `BitDepthVerifier` (23),
  `ScanDiffEngine` (17). Script `pnpm test`, `test:watch`, `test:coverage`.
  Konfigurasi di `src/__tests__/` (bukan di samping modul - lihat `TESTING.md`
  bagian 5 untuk alasannya).
- **`v1.0.37`** - git tag pertama repo ini, titik acuan sebelum standarisasi dokumentasi.
- **Dokumentasi terindeks** - 13 file di `docs/` + README root + AGENTS.md, menggantikan
  11 dokumen roadmap/todolist yang tumpang tindih (533 KB). Lihat commit dokumentasi.
- `computeDiff()` dan `isDeletionPlausible()` di `ScanDiffEngine` - logika diff
  diekstrak jadi fungsi murni yang bisa diuji dan dipakai kedua jalur scan.

### Fixed

- **Tap play setelah app restart gagal.** Setelah aplikasi di-restart, user
  tap tombol play di mini-player/lock screen → `native play() returned false`
  dalam 212ms, UI reset ke berhenti; harus tap dua kali. Native queue
  sengaja tidak di-restore saat boot (lazy, resolve `content://` mahal),
  tapi re-sync hanya ada di `playSong()`, bukan `setIsPlaying()` — padahal
  tombol play lewat `togglePlay()` → `setIsPlaying()`. Sekarang
  `setIsPlaying(true)` memeriksa `getQueueSize()` (sync) dulu; kalau 0 dan
  ada currentSong, lakukan `setQueue()` → `play()` → seek ke posisi
  tersimpan. Ditemukan dari logcat device 2026-10-07.

- **KEHILANGAN DATA: satu kegagalan query MediaStore menghapus SELURUH library.**
  `MediaStore.queryAudioFiles()` menangkap error lalu `return []`; array kosong
  tidak bisa dibedakan dari "device tidak punya file audio". `ScanDiffEngine`
  menyimpulkan semua lagu di database terhapus dan memanggil `deleteSongsByUris`
  dengan seluruh library - playlist, favorit, dan riwayat ikut hilang.
  Pemicunya hal biasa: izin dicabut, MediaStore sibuk, OOM.
  Diperbaiki: query melempar error, `isDeletionPlausible()` menahan penghapusan
  massal, dan `processQuickDiff` kini memakai transaction untuk penulisan.
- **Deteksi "FLAC palsu" salah skala.** `estimateRealBitDepth` membandingkan
  `(DR - 1.76) / 6.02` - sudah bernilai satuan bit - dengan ambang `18`/`26`.
  Ambang 18 menuntut DR >= 110 dB untuk diakui 24-bit, sehingga file 24/96 asli
  diklasifikasi 16-bit. Ambang diperbaiki jadi `16`/`24`. Ambang lama juga tidak
  pernah bisa menghasilkan 32-bit (butuh DR 158 dB, di atas maksimum teoretis).
- **`BitDepthVerifier` memakai `sampleRate` hardcoded 44100**, sehingga penalti
  "upsample detector" (`sampleRate > 48000`) tidak pernah aktif dan file hi-res
  hasil upsample dari CD tidak terdeteksi. Sekarang mengambil dari lagu/analisis.
- **`formatDuration(Infinity)` mengembalikan `"Infinity:NaN"`.** Penjaga lama
  `if (!seconds || isNaN(seconds))` tidak menangkap `Infinity` (truthy, dan
  `isNaN(Infinity)` = `false`). Sekarang `!Number.isFinite(seconds) || seconds <= 0`,
  yang sekaligus menangani nilai negatif. Ditemukan oleh test.

- **File 96 kHz terdengar "cacat" (glitch periodik + UI desync).** Dianalisis
  dari logcat 2026-10-06 12:09 (FLAC 96 kHz Enya "Dark Sky Island"):
  13.733 sample NaN/garbage HANYA di trek 96 kHz (0 di trek 48 kHz),
  pola 26 sample tiap ~170 ms. `SAMPLE min=-1.12e18` = bit pattern malloc
  garbage — float VALID yang lolos dari `isnan()`/`isinf()`.
  Root cause: `chunkSize_` decoder hardcoded 4096; FLAC 96 kHz hanya
  menghasilkan ~2238 output frame per `decode()` (2:1 downsample), jadi
  saat queue penuh throughput turun ke ~24.8k fps < 48k realtime →
  PCMQueue underrun. Fix: `chunkFrames` 4096→16384, backpressure
  pause 80%→90% / resume 40%→60%, guard magnitudo ±2.0 di decoder dan render.
  Bug terkait: `getPositionSeconds()`/`onSeek()` domain salah (posisi 2x
  cepat untuk 96 kHz, 1.088x untuk 44.1 kHz — cocok speed 1.08x di log),
  `kGain 0.89f` (-1 dB) menghianati bit-perfect, `setDurationFrames()`
  tak pernah dipanggil, `formatLogged` static global. Lihat
  `docs/TROUBLESHOOTING.md` dan `scripts/test_domain_96k.cpp` (14 assertion).

### Removed

- **`src/app/_layout.tsx (2)`** - file duplikat di route tree, diabaikan router,
  tidak pernah dibundel. Diverifikasi tidak ada yang mereferensikan, dan isinya
  sudah ketinggalan dua fix (`clearCache`, reset stuck scan) dibanding versi aktif.
  Backup di `$TMPDIR/_layout.debug-backup.tsx`.

---

## [1.0.37] - Tidak bertanggal (state repo per 2026-10-03)

**Direkonstruksi dari git log. Rentang commit: `d09825ac0` ke belakang.**

### Added

- Foreground service lengkap untuk playback - mencegah app dibunuh OS (`66b3d91d8`)
- Sinkronisasi MediaSession metadata & playback state dari JS (`8e5c8116e`)
- Auto-next berbasis native + shuffle/repeat bridge (`a7a1015c0`)
- Slider position watcher + shuffle selector + auto-next v3 (`c02953d60`)

### Fixed

- Track-change hang - reset state, guard decoder, force stop (`92225fe1a`)
- 3 bug: playSong dedupe, speed glitch, quick diff spam (`0d2a7a7b6`)
- `PlaybackController.play()` reload track saat queue berubah (`399c1ed5f`)
- Race condition di PCMQueue clear (`d62a29121`)
- Self-deadlock dari callback - recursive_mutex untuk decode/seek/pause (`9a4bfdc31`)
- Domain-mismatch decode loop, SPSC seek race, decoder mutex protection (`96ceeb10a`)
- NaN residual pada >48kHz - filter_size konstan 128 (`0e0fbffd8`)
- Ganti `-ffast-math` dengan `-fno-fast-math` untuk penanganan NaN (`bebf42955`)
- Root cause: default DSP di-bypass (BitPerfect mode) (`5f39323c3`)
- Tambah `android/log.h` yang hilang di `AudioStreamController` (`44551f378`)
- 15 TypeScript error + perbaikan performa (`94ada2841`)

### Changed

- Cleanup fase 1: `.bak` + orphan + dead code (`727240b50`, merge `d09825ac0`)
- Lazy URI resolve + full restore player state (`04a541c97`)
- Scratch buffer + priority + tanpa alokasi per-frame di decoder (`cbc0f11be`, `1b592151b`)
- Thread priority AUDIO + kurangi log spam (`10e931387`)

### Performance

- `-O2` di build Debug (5x speedup decoder) (`f2c8b73c8`)

### Dibuang

- `react-native-track-player` - sudah tidak ada di `package.json` (`pristine-audio`)
- `fft/`, `PlaybackManager.cpp/.h` - diklaim dead code di dokumen lama; `PlaybackManager` sudah terhapus

---

## [0.1.0] - 2026-04-26 (perkiraan, dari mtime file)

Versi paling awal yang bisa diperkirakan dari timestamp file: struktur native C++/Kotlin, sistem tema dengan 4 tema inline + 8 file tema terpisah, expo-router dengan drawer + tabs.

---

## Cara mengisi file ini ke depan

Diisi **saat cut release**, bukan per-commit. Per-commit sudah ada di `git log`; CHANGELOG mencatat apa yang berubah **bagi pengguna**, dikelompokkan per rilis.

```markdown
## [1.0.38] - 2026-10-XX

### Added
- ...

### Fixed
- ...

### Changed
- ...
```

Setiap bagian ditulis dari sudut pandang pengguna. "Ganti `-ffast-math`" adalah catatan commit, bukan catatan rilis; "perbaiki distorsi pada file FLAC 24-bit di atas 48 kHz" adalah catatan rilis.
