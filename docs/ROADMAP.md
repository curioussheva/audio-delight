# PristineAudio - Roadmap

**Satu-satunya roadmap.** Menggantikan 6 dokumen perencanaan yang tumpang tindih (`roadmap.md`, `new-arch-roadmap.md`, `native-bridge-roadmap.md`, `plan-consolidation-debugging.md`, `ConsolidationV2.md`, `todo.md` - sekarang di `archive/`).

Semua status diverifikasi 2026-10-03 langsung ke kode.

---

## Cara membaca status

| Tanda | Arti |
|---|---|
| `[x]` | Selesai - **ada pemanggil nyata**, bukan sekadar file/tipe-nya ada |
| `[~]` | Sebagian - logikanya ada tapi belum tersambung, atau cuma cangkang UI |
| `[ ]` | Belum mulai |
| `[!]` | Terblokir oleh item lain |

> **Aturan yang berlaku sejak dokumen ini dibuat:** sebuah item ditandai `[x]` hanya kalau ada kode yang benar-benar **memanggilnya**. Status yang tidak bisa diverifikasi ditandai `?` *belum diverifikasi*, bukan diasumsikan selesai.

---

## Fase 0 - Fondasi (selesai)

- [x] Struktur `src/features/<fitur>/{api,components,hooks,store}` - 9 fitur
- [x] Mesin audio native - `cpp/` 193 file, 17 subdirektori
- [x] Tiga mode pemrosesan (`BitPerfect` | `DSP` | `Immersive`) di `cpp/modes/`
- [x] BitPerfect sebagai default - `patch_default_bypass_dsp.py`
- [x] 20 tema tanpa tema yatim (`ALL_THEMES` cocok persis dengan `ThemeId`)
- [x] expo-router: drawer + 4 tab + player + onboarding
- [x] Migrasi lepas dari `react-native-track-player` - dependensinya **sudah tidak ada** di `package.json`

## Fase 1 - Verifikasi device (PRIORITAS TERTINGGI)

**Kenapa ini nomor satu:** 193 file C++ dan 33 file Kotlin tidak pernah dibuktikan berjalan. Semua klaim "berfungsi" di `FEATURES.md` adalah klaim statis. Selama ini belum ditutup, menambah fitur baru hanya menumpuk klaim yang belum dibuktikan - persis pola yang sudah menimpa persona (`persona/docs/COMPETITIVE_LANDSCAPE.md` bagian 4).

- [ ] Build APK dan pasang di device - `pnpm build:dev` atau trigger `build-dev.yml`
- [ ] Verifikasi playback dasar: play/pause/seek/next/prev dengan file nyata
- [ ] Verifikasi tiga mode: apakah BitPerfect benar-benar melewati DSP (bukan hanya konstan defaultnya berubah)
- [ ] Verifikasi kualitas audio: bandingkan output BitPerfect vs DSP secara subjektif
- [ ] Verifikasi USB DAC: deteksi device, pemilihan output, apakah audio keluar dari DAC
- [ ] Verifikasi scan library: apakah MediaStore mengembalikan lagu, apakah progress UI benar
- [ ] Verifikasi MediaSession: kontrol dari lock screen
- [ ] Verifikasi foreground service: apakah app bertahan saat di-background lama
- [ ] **Ukur latensi & underrun** - tidak ada satupun angka performa yang pernah diambil

## Fase 2 - Tutup celah wiring native (ditemukan dari kode)

Item ini **terverifikasi terbuka**, bukan diwarisi dari dokumen lama:

- [ ] **`initPlaybackModule()` tidak pernah dipanggil.** Didefinisikan di `jni/NativePlaybackModule.cpp:162` dan dideklarasikan di `NativePlaybackModule.h:24`, tapi **tidak ada satu pun pemanggil** di seluruh `android/`. Selama ini belum dilakukan, `NativePlaybackModule` tidak menerima instance `PlaybackController`. Ini kemungkinan akar dari kenapa bridge playback harus ditinjau ulang.
  - Titik pemanggilan yang benar: `jni/OnLoad.cpp` (`JNI_OnLoad`, sudah menginisialisasi `EngineManager`), atau setelah `EngineManager` menyediakan `PlaybackController`.
  - [ ] Verifikasi bahwa `PlaybackController` hidup selama app berjalan dan bisa diambil dari `EngineManager`.
- [ ] Audit kapabilitas native yang "mentok" - daftar lengkap `JNIEXPORT` -> Kotlin `external fun` -> TS spec -> pemakaian di `features/`
- [ ] `NativeAudioFeed.cpp` - apa yang mengonsumsinya? Belum jelas.
- [ ] `audioConfig.ts` (`features/player/config/`) - orphan? Tidak ada pemanggil.
- [ ] `ScanDiffEngine.ts` masih memakai `BEGIN TRANSACTION` mentah yang pernah terbukti menyebabkan hang
- [ ] Hapus `src/app/_layout.tsx (2)` - file duplikat sampah di route tree
- [ ] Perbaiki komentar header salah: `api/scanner.ts` menyebut `services/LibraryScanner.ts`

## Fase 3 - Test otomatis (celah terbesar)

PristineAudio **tidak punya satu pun test otomatis**. Persona punya 28 skrip `verify-*.mjs`; di sini nol. Ini yang membuat Fase 1 mahal: tidak ada cara mendeteksi regresi selain memasang APK.

- [ ] **Konfigurasi Jest** - `jest-expo` + `@testing-library/react-native`
- [ ] Test logika murni (tanpa native): `ScanDiffEngine`, format durasi, mapping preset EQ, seleksi tema, `getThemeById` fallback
- [ ] Test warna: kontras semua pasangan di **20 tema** - port pola `check_contrast.ts` persona
- [ ] Test spacing: cegah literal baru (checker `check_layout.ts` sudah jalan, tinggal dijadikan gerbang)
- [ ] Angkat typecheck ke CI sebagai job terpisah yang lebih dulu jalan (pola `verify` -> `build` persona: kegagalan JS muncul dalam 2 menit, bukan setelah 16 menit build)

## Fase 4 - Visual (utang terukur)

Angka riil 2026-10-03. Lihat `VISUAL_HEALTH.md`.

- [ ] **16 pasangan kontras gagal 3:1** - semuanya `border.medium on background.primary`, terjadi di 16 dari 20 tema. Garis pemisah praktis tak terlihat.
- [ ] **519 literal spacing di 52 file** - `SPACING` sudah ada (8 token: 2/4/8/16/24/32/48/64) tapi tidak dipakai
- [ ] Perbaiki di **primitif**, bukan per layar: `CustomDrawer.tsx` (11), `ThemePicker.tsx` (9), `FileTypeList.tsx` (14), `LoadingScreen.tsx` (7)
- [ ] Perbaiki `SPACING` dulu - skala 2/4/8/16/24/32/48/64 tidak punya nilai untuk literal yang paling sering muncul (20x74, 12x68, 10x43, 15x19). Selama token tidak punya padanannya, literal ini **tidak bisa** dihilangkan tanpa menambah token.

## Fase 5 - Rilis & distribusi

- [ ] **CHANGELOG.md** - tidak ada. Versi `1.0.37` tanpa riwayat apa pun.
- [ ] **Git tag** - nol tag di repo. Riwayat rilis tidak bisa direkonstruksi.
- [ ] Rapikan tiga jalur build paralel (EAS | GitHub Actions | GitLab CI) - lihat `ARCHITECTURE.md` ADR-9
- [ ] Perbaiki `eas.json`: `cache.key` mengunci ke `yarn.lock` padahal proyek pakai pnpm - cache selalu miss
- [ ] Putuskan status 5 workflow GitHub yang semuanya `workflow_dispatch` - sengaja, atau belum disetel?
- [ ] Konfigurasi signing rilis (belum ada keystore/solusi di repo)
- [ ] Setup `eas submit` kalau memang mau ke Play Store

## Fase 6 - Fitur lanjutan

- [ ] Crossfade - `FadeEngine.cpp` ada, **tidak diverifikasi** tersambung ke UI
- [ ] Drag-reorder playlist - `react-native-draggable-flatlist` terpasang, pemakaian belum diverifikasi
- [ ] Audio focus (interupsi telepon, ducking) - di luar metadata MediaSession
- [ ] Immersive/spatial tuning lebih dalam - `dsp/{spatial,headphone,convolution,immersive}/` ada, tingkat kematangan belum diukur
- [ ] Update mandiri dalam app
- [ ] UI `audioConfig` (buffer size, latency mode)

---

## Yang tidak akan dikerjakan

- **Streaming / integrasi layanan musik online.** PristineAudio adalah pemutar file lokal bit-perfect. Menambahkan streaming akan bertentangan dengan seluruh alasan DSP bypass jadi default dan alasan USB DAC diurus serius.
- **Ekosistem plugin.** Tidak ada ekstensi pihak ketiga; permukaan API akan jadi beban yang tidak sebanding.
- **Equalizer berbayar / IAP.** Aplikasi ini memutar audio milik pengguna di perangkat pengguna.

---

## Catatan proses

Dokumen lama mengandung **10 blok "FASE 0" berulang** di satu file dan `TL;DR` sampai 5x - artinya status tidak bisa dipercaya, karena tidak ada cara menentukan bagian mana yang berlaku. Pelajaran yang berlaku ke depan:

1. **Satu roadmap, bukan enam.** Dokumen roadmap kedua selalu jadi roadmap pertama yang usang.
2. **Status harus punya tanggal dan bukti.** "Selesai" tanpa file yang membuktikannya akan memakan satu sesi debugging untuk dibantah.
3. **Item terbuka harus bisa dibaca sekali jalan.** Kalau sebuah item terbuka muncul di tiga dokumen dengan tiga tingkat detail, ia praktis tidak terlihat.
