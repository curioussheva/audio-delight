# PristineAudio - Features

Breakdown per-fitur. **Scope** (fitur ini masuk rencana apa) dipisah dari **status implementasi** (sudah jalan atau belum), persis seperti `persona/docs/FEATURES.md`.

## Cara membaca tabel

| Kolom | Arti |
|---|---|
| **Fitur** | Kapabilitas yang terlihat pengguna |
| **Scope** | `MVP` | `P1` | `P2` - direncanakan di fase mana |
| **Status** | `ADA` ada & punya pemanggil nyata | `SEBAGIAN` | `BELUM` belum ada | `?` belum diverifikasi |
| **Bukti** | File/kode yang membuktikannya |

Aturan `[x]` = "**ada pemanggil nyata**", bukan "filenya ada". Semua status di bawah diverifikasi 2026-10-03 dengan menelusuri impor dari `src/app/` (route) ke `src/features/`.

**Ringkas: 9 fitur, semuanya punya konsumen luar.** Tidak ada fitur mati - tapi "punya konsumen" bukan "teruji di device", karena tidak satu pun pernah dijalankan di device oleh sesi ini.

---

## 1. Playback

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Putar/pause/skip lagu | MVP | ADA | `features/player/` (21 file) |
| Queue & track transition | MVP | ADA | `cpp/playback/TrackQueue.cpp`, `PlaybackController.cpp` |
| Shuffle & repeat | MVP | ADA | commit `fix(player): auto-next native-based + shuffle/repeat bridge` |
| Seek | MVP | ADA | `features/player/api/engine.ts`, `PlaybackClock.cpp` |
| Auto-next | MVP | ADA | commit `fix(player): auto-next native-based` |
| Foreground service (anti-kill) | MVP | ADA | commit `feat(playback): foreground service lengkap` |
| MediaSession / lock screen | MVP | ADA | commit `feat: sync MediaSession metadata & playback state dari JS` |
| Prebuffering | P1 | ADA | `cpp/playback/PrebufferManager.cpp` |
| Crossfade / fade | P2 | SEBAGIAN | `cpp/playback/FadeEngine.cpp` ada; **tidak diverifikasi** apakah tersambung ke UI |

## 2. Audio Engine (native)

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Dekode FLAC/WAV/MP3/AAC | MVP | ADA | `cpp/decoder/` (16 file): `FFmpegDecoder`, `PCMDecoder`, `DecoderFactory` |
| Resampling | MVP | ADA | `cpp/resampler/` (8 file), `StreamResampler.cpp` |
| Flow control (queue penuh/kosong) | MVP | ADA | commit `fix(audio): flow control pause/resume decoder on queue full/low` |
| Tiga mode: BitPerfect / DSP / Immersive | MVP | ADA | `core/AudioPipeline.cpp`, dipanggil `AudioCallback::applyPipeline()`; mode dibaca atomik tiap buffer → live switch. `cpp/modes/` dihapus, logikanya diadopsi (ADR-0001) |
| BitPerfect sebagai default | MVP | ADA | `AudioTypes.h` default `ProcessingMode::BitPerfect`; `processBitPerfect()` no-op total - nol gain, nol limiter |
| **Laju stream dari DAC/file (tidak hardcoded)** | MVP | ADA | `core/DeviceRateDetector.cpp` - baca `AudioManager.getDevices()`, pilih laju per-file |
| **AAudio utama, OpenSLES fallback** | MVP | ADA | `core/AudioStreamController.cpp` - AAudio dicoba dulu (punya mode exclusive) |
| Laju stream sampai ke decoder | MVP | ADA | `PlaybackController::setStreamSampleRate()` -> `DecodeConfig.targetSampleRate` |
| DSP chain (biquad, EQ, limiter) | MVP | ADA | `cpp/dsp/` (62 file). Config disalurkan `AudioPipeline::applyDSPConfig()` → `DSPChain::applyConfig()`; dibuktikan `scripts/test_dsp_wiring.cpp` (9/9) |
| EQ 10-band + bass boost | MVP | ADA | `AudioState` → `AudioCallback::updateParameters()` → `DSPConfig` → `EQNode::applyConfig` → `EQProcessor` |
| Convolution / spatial / headphone | P2 | BELUM | subdir ada; `ConvolverNode`+`FIRFilter` nyata tapi belum disambung, `HeadphoneCorrection`/`BinauralRenderer` masih stub - `docs/IDEAS.md` I-12 |
| Crossfeed / ToneControl / StateVariableFilter | P2 | BELUM | implementasi nyata, nol pemanggil - `docs/IDEAS.md` I-12 |
| Ring buffer & metrics | MVP | ADA | `core/RingBuffer.h`, `core/AudioMetrics.cpp` |
| ASAN/NaN detection | P1 | SEBAGIAN | commit `debug(audio): NaN/Inf detection + cleanup for FLAC 24-bit`; alat ada, **bukan CI step** |

## 3. USB DAC

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| **Baca daftar device output (termasuk DAC USB)** | **MVP** | **ADA** | `devices/AudioDeviceManager.cpp` - dibangun ulang 2026-10-05; sebelumnya stub |
| **Deteksi DAC dicolok saat app berjalan** | **MVP** | **ADA** | `AudioDeviceCallback` di `NativeDeviceModule.kt` -> `nativeOnDeviceAdded/Removed` |
| **Laju yang didukung per device** | **MVP** | **ADA** | `AudioDeviceManager::refreshDevices()` -> `supportedSampleRates` |
| Deteksi USB DAC | P1 | SEBAGIAN | `devices/AudioDeviceManager.cpp` (`cpp/usb/` dihapus 2026-10-07; jalur utama lewat `AudioDeviceManager`) |
| Sinkronisasi clock USB | P1 | SEBAGIAN | `devices/AudioDeviceManager.cpp`; presisi belum diukur |
| Baca kapabilitas DAC | P1 | SEBAGIAN | `devices/AudioDeviceManager.cpp` |
| Sesi stream USB | P1 | SEBAGIAN | `devices/AudioDeviceManager.cpp` |
| UI pemilih output | P1 | SEBAGIAN | `OutputSettings.tsx` ada; `getDevices()` baru 2026-10-05 benar-benar memanggil JNI; fallback fabrikasi getDevices dihapus 2026-11-18 (F8), default honored 1→0 (F9) |
| Terapkan device pilihan ke stream | P1 | **BELUM** | `setActiveDevice()` mencatat + validasi; `Oboe setDeviceId()` belum diterapkan |

## 4. Library

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Scan MediaStore | MVP | ADA | `features/library/native/MediaStoreModule.ts`, `api/scanner.ts` |
| Album grid | MVP | ADA | `features/library/components/AlbumGrid.tsx` |
| Artist / Folder / Genre / FileType list | MVP | ADA | `ArtistList.tsx` | `FolderList.tsx` | `GenreList.tsx` | `FileTypeList.tsx` |
| Filter file | MVP | ADA | filter inline di library.tsx (filterType all/lossless/hi-res + filter pencarian); FileFilterBar.tsx + FilterModal dihapus 2026-11-18 |
| Pencarian | MVP | ADA | `src/app/(drawer)/search.tsx` |
| Scan awal (quickscan) | MVP | ADA | fresh install wajib quickscan minimal (`initialScan.ts`) |
| Auto Enriching (default ON) | MVP | ADA | gerbang start otomatis worker enrichment (`autoEnrichingGuard.ts`); OFF = antrean hanya terkuras lewat aksi manual |
| Auto Discovery (default OFF) + Rescan Library | MVP | ADA | deteksi perubahan (quickDiff + BackgroundScanTask, interval 240 mnt); Rescan = full scan manual via `runMediaStoreDiff` |
| **Favorit** | MVP | ADA | `features/favorites/` (6 file); dipakai di `library.tsx`, `song/[id].tsx`, semua list component |

Catatan: `favorites` fitur sendiri (6 file, store + service + hook) **tapi tidak punya route/layar terpisah** - favorit muncul sebagai penanda di dalam library dan song detail.

Pacing worker enrichment: jeda antar item 1000 ms (dulu 350 ms) + jeda saat lagu diputar (poll 2 dtk) — enrichmentPacing.ts.

## 5. Playlist

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Buat/lihat playlist | MVP | ADA | `features/playlist/` (7 file), `src/app/(drawer)/playlist.tsx` |
| Drag-reorder | P1 | SEBAGIAN | dependensi `react-native-draggable-flatlist` terpasang; pemakaian belum diverifikasi |
| Persistensi playlist | MVP | ADA | `features/playlist/api/service.ts`, via `shared/lib/sqlite.ts` |

## 6. Equalizer

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| UI equalizer | MVP | ADA | `src/app/(drawer)/(tabs)/equalizer.tsx`, `features/equalizer/components/` |
| Preset | MVP | ADA | `features/equalizer/constants/` |
| Store EQ | MVP | ADA | `features/equalizer/store/` |
| Terapkan ke engine | MVP | ADA | `features/player/api/engine.ts` mengimpor equalizer |

## 7. Visualizer

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Analisis FFT | MVP | ADA | `cpp/fft/` (11 file), `NativeVisualizerBridge` |
| Render (Skia) | MVP | ADA | `features/visualizer/` (10 file); komponen kini AnalyzerSpectrum.tsx + ParametricSpectrumView.tsx |
| Mode analyzer terpisah | MVP | ADA | `src/app/(drawer)/(tabs)/analyzer.tsx` saja (tab Visualizer dihapus 2026-11-13; `SpectrumAnalyzer.tsx` + `SpectogramView.tsx` dihapus 2026-11-18) |

## 8. Tema & Tampilan

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| 24 tema | MVP | ADA | `ALL_THEMES` - 24 entri, `ThemeId` 24, **cocok persis** |
| Pemilih tema (kategori) | MVP | ADA | `shared/components/ui/ThemePicker.tsx`, `THEME_CATEGORIES` 4 kategori |
| Persistensi tema | MVP | ADA | `ThemeContext.tsx`, AsyncStorage `@pristineaudio/theme_id` |
| Ikut tema sistem | MVP | ADA | `useColorScheme()` -> light: pristine-hearth / dark: pristine-ember |
| Random / next theme | P1 | ADA | `getRandomTheme`, `nextTheme` di `ThemeContext` |
| Onboarding | MVP | ADA | `src/app/onboarding.tsx` |
| **Kontras AA di semua tema** | MVP | ADA | **0 pasangan gagal** (diperbaiki 2026-10-04 dan 2026-10-10; lihat `VISUAL_HEALTH.md`) |
| **Spacing ter-token** | P1 | BELUM | **519 literal di 52 file** (angka 2026-10-03; ukur ulang — token BASE_SPACING kini 11, termasuk s10/s12/s20) |

## 9. Settings & Distribusi

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Layar settings | MVP | ADA | `src/app/(drawer)/settings.tsx` |
| Store settings | MVP | ADA | `features/settings/store/settingsStore.ts` (1 file) |
| About | MVP | ADA | `src/app/(drawer)/about.tsx` |
| Build dev / preview / prod | MVP | ADA | `eas.json` 3 profile; `pnpm build:dev` dkk |
| Distribusi Play Store | P2 | BELUM | tidak ada konfigurasi `eas submit` di `package.json` |
| Update mandiri dalam app | P2 | BELUM | tidak ada kode update checker |

---

## Ringkasan jujur

**Yang kuat:** mesin audio native (160 file C++ sumber, 13 subdirektori tingkat atas) dengan tiga mode pemrosesan yang terpisah dengan benar, library dengan 42 file dan 7 tab (Songs, Albums, Artists, Genres, Folders, Playlists, Formats), dan sistem 24 tema yang konsisten tanpa tema yatim.

**Yang lemah, dan ini yang menahan klaim "produk":**

1. **Test otomatis baru ada di lapisan tipis.** 921 test Jest di 77 suite - `LrcParser`, dsp, audio, dac, `BitDepthVerifier`, `ScanDiffEngine`. Dibuat 2026-10-03, sebelumnya nol. Tapi **C++ 28 harness di scripts/test_*.cpp** (logika murni host-side), dan itu 160 file serta bagian terbesar risikonya. Typecheck tidak menyentuh satu baris C++ pun.
2. **Verifikasi device berjalan sejak Okt–Nov 2026 di POCO M6 csheva** (logcat #9–#31, preview APK); yang belum terverifikasi device ditandai [device] di `archive/AUDIT_SUMMARY.md`.
3. **Riwayat rilis baru dimulai.** Versi `1.0.37`, git tag pertama `v1.0.37` dibuat 2026-10-03; sebelumnya nol tag. `CHANGELOG.md` merekonstruksi sebagian, bukan catatan asli.
4. **Utang visual terukur** - Spacing: 521 literal (2026-10-03, ukur ulang); kontras: 0 gagal.
5. ~~**Satu file sampah** di route tree: `src/app/_layout.tsx (2)`.~~ - **dihapus 2026-10-03** (backup di `$TMPDIR`), setelah diverifikasi tidak ada yang mereferensikannya dan versinya sudah ketinggalan dua fix.
