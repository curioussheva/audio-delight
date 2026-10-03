# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

> **Catatan 2026-10-03.** File ini **baru dibuat**. Sebelumnya PristineAudio tidak punya CHANGELOG sama sekali: versi `1.0.37` di `app.json` tanpa riwayat, dan **nol git tag** di repo. Isi di bawah disusun dari riwayat git commit (`git log --oneline`, 40 commit terakhir) dan **tidak lengkap** - ini merekonstruksi sebagian, bukan mencatat yang sebenarnya pernah dicatat.
>
> Riwayat lengkap tidak bisa direkonstruksi. Yang benar dilakukan: mulai mencatat dari versi berikutnya, dan tag versi sekarang (`v1.0.37`) supaya ada titik acuan. Lihat `ROADMAP.md` Fase 5 dan `RELEASE_PROCESS.md` bagian 1.

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
