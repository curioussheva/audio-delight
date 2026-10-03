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
| Putar/pause/skip lagu | MVP | ADA | `features/player/` (24 file), 13 konsumen luar |
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
| Tiga mode: BitPerfect / DSP / Immersive | MVP | ADA | `cpp/modes/` (6 file), tiga kelas pipeline |
| **BitPerfect sebagai default** | MVP | ADA | `patch_default_bypass_dsp.py` - DSP di-bypass secara default |
| DSP chain (biquad, EQ, limiter) | MVP | ADA | `cpp/dsp/` (56 file), `DSPChain.cpp` |
| Convolution / spatial / headphone | P2 | SEBAGIAN | subdir `convolution/`, `spatial/`, `headphone/` ada di `dsp/`; tingkat keterhubungan belum diverifikasi |
| Ring buffer & metrics | MVP | ADA | `core/RingBuffer.h`, `core/AudioMetrics.cpp` |
| ASAN/NaN detection | P1 | SEBAGIAN | commit `debug(audio): NaN/Inf detection + cleanup for FLAC 24-bit`; alat ada, **bukan CI step** |

## 3. USB DAC

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Deteksi USB DAC | P1 | ADA | `cpp/usb/USBDeviceManager.cpp`, `java/.../USBDACModule.kt` |
| Sinkronisasi clock USB | P1 | SEBAGIAN | `cpp/usb/USBClockSync.cpp` ada; presisi belum diukur |
| Baca kapabilitas DAC | P1 | ADA | `cpp/usb/USBDACCapabilities.cpp` |
| Sesi stream USB | P1 | SEBAGIAN | `cpp/usb/USBStreamSession.cpp` |
| UI pemilih output | P1 | ADA | `features/player/components/OutputSettings.tsx`, `shared/hooks/useUSBDAC.ts` |

## 4. Library

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Scan MediaStore | MVP | ADA | `features/library/native/MediaStoreModule.ts`, `api/scanner.ts` |
| Album grid | MVP | ADA | `features/library/components/AlbumGrid.tsx` |
| Artist / Folder / Genre / FileType list | MVP | ADA | `ArtistList.tsx` | `FolderList.tsx` | `GenreList.tsx` | `FileTypeList.tsx` |
| Filter file | MVP | ADA | `FileFilterBar.tsx` |
| Pencarian | MVP | ADA | `src/app/search.tsx` |
| **Favorit** | MVP | ADA | `features/favorites/` (6 file); dipakai di `library.tsx`, `song/[id].tsx`, semua list component |

Catatan: `favorites` fitur sendiri (6 file, store + service + hook) **tapi tidak punya route/layar terpisah** - favorit muncul sebagai penanda di dalam library dan song detail.

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
| Render (Skia) | MVP | ADA | `features/visualizer/` (15 file), 8 konsumen luar |
| Mode analyzer terpisah | MVP | ADA | `src/app/(drawer)/(tabs)/analyzer.tsx`, `visualizer.tsx` |

## 8. Tema & Tampilan

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| 20 tema | MVP | ADA | `ALL_THEMES` - 20 entri, `ThemeId` 20, **cocok persis** |
| Pemilih tema (kategori) | MVP | ADA | `shared/components/ui/ThemePicker.tsx`, `THEME_CATEGORIES` 4 kategori |
| Persistensi tema | MVP | ADA | `ThemeContext.tsx`, AsyncStorage `@pristineaudio/theme_id` |
| Ikut tema sistem | MVP | ADA | `useColorScheme()` -> `light-elegant` / `emerald-noir` |
| Random / next theme | P1 | ADA | `getRandomTheme`, `nextTheme` di `ThemeContext` |
| Onboarding | MVP | ADA | `src/app/onboarding.tsx` |
| **Kontras AA di semua tema** | MVP | BELUM | **16 pasangan gagal 3:1** (garis border). Lihat `VISUAL_HEALTH.md` |
| **Spacing ter-token** | P1 | BELUM | **519 literal di 52 file** |

## 9. Settings & Distribusi

| Fitur | Scope | Status | Bukti |
|---|---|---|---|
| Layar settings | MVP | ADA | `src/app/(drawer)/settings.tsx` (28 literal spacing - terbanyak) |
| Store settings | MVP | ADA | `features/settings/store/settingsStore.ts` (1 file) |
| About | MVP | ADA | `src/app/(drawer)/about.tsx` |
| Build dev / preview / prod | MVP | ADA | `eas.json` 3 profile; `pnpm build:dev` dkk |
| Distribusi Play Store | P2 | BELUM | tidak ada konfigurasi `eas submit` di `package.json` |
| Update mandiri dalam app | P2 | BELUM | tidak ada kode update checker |

---

## Ringkasan jujur

**Yang kuat:** mesin audio native (193 file C++, 17 subdirektori) dengan tiga mode pemrosesan yang terpisah dengan benar, library dengan 39 file dan 5 tampilan berbeda, dan sistem 20 tema yang konsisten tanpa tema yatim.

**Yang lemah, dan ini yang menahan klaim "produk":**

1. **Test otomatis baru ada di lapisan tipis.** 98 test Jest di 6 suite - `LrcParser`, dsp, audio, dac, `BitDepthVerifier`, `ScanDiffEngine`. Dibuat 2026-10-03, sebelumnya nol. Tapi **C++ tetap nol test**, dan itu 193 file serta bagian terbesar risikonya. Typecheck tidak menyentuh satu baris C++ pun.
2. **Nol verifikasi device.** 193 file C++ yang tidak pernah dibuktikan berjalan di perangkat nyata oleh sesi ini.
3. **Riwayat rilis baru dimulai.** Versi `1.0.37`, git tag pertama `v1.0.37` dibuat 2026-10-03; sebelumnya nol tag. `CHANGELOG.md` merekonstruksi sebagian, bukan catatan asli.
4. **Utang visual terukur** - 519 literal spacing, 16 pasangan kontras gagal.
5. ~~**Satu file sampah** di route tree: `src/app/_layout.tsx (2)`.~~ - **dihapus 2026-10-03** (backup di `$TMPDIR`), setelah diverifikasi tidak ada yang mereferensikannya dan versinya sudah ketinggalan dua fix.
