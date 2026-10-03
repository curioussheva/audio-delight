# PristineAudio

**Bit-perfect audio player untuk Android** (React Native + Expo, prebuild hybrid dengan native C++/Kotlin). Pemutar musik hi-res dengan DSP chain, USB DAC, equalizer, dan 20 tema.

Dokumen perencanaan ada di `docs/` - mulai dari `docs/README.md`.

---

## Status jujur - PristineAudio **bukan proyek yang selesai**. Yang sudah jalan dan yang belum dipisahkan di bawah, dan klaim di sini bisa dibuktikan di kode.

**Sudah berfungsi end-to-end:**

1. **Playback native** - decoder C++ (81 file, `android/app/src/main/cpp/`), Oboe/OpenSL ES, flow control dengan hysteresis, foreground service agar app tidak dibunuh OS
2. **MediaSession & lock screen** - metadata dan playback state tersinkron dari JS
3. **Library** - scan MediaStore, tampilan Album/Artist/Folder/FileType (39 file di `src/features/library/`)
4. **Equalizer** - 20 file, store + API + komponen
5. **Visualizer** - 15 file, jembatan native `NativeVisualizerBridge`
6. **20 tema** - skala warna, `isDark` per tema, kategorisasi light/dark/nature/premium
7. **Onboarding + drawer/tabs navigation** - expo-router

**Yang belum, dan berlaku apa adanya:**

- **Tidak satu pun pernah dijalankan di device oleh sesi ini.** Semua verifikasi di sini bersifat statis: `tsc --noEmit` (lulus), dan pembacaan kode. Build native hanya lewat CI/EAS.
- **Tidak ada CHANGELOG.** Versi `1.0.37` di `app.json`, tapi **tidak ada satu pun git tag** - riwayat rilis tidak bisa direkonstruksi.
- **Tidak ada test otomatis.** Tidak ada skrip `verify-*.mjs` seperti di persona. Yang ada hanya typecheck dan `scripts/check.sh` (sanity check C++, butuh `compile_commands.json`).
- **Utang visual terukur:** 519 literal spacing di 52 file, dan 16 pasangan kontras gagal rasio 3:1 (garis border). Lihat `docs/VISUAL_HEALTH.md`.
- **Satu file sampah:** `src/app/_layout.tsx (2)` - duplikat tak terpakai dari editor crash.

---

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | React Native 0.83.10, Expo ~55.0.31, React 19.2.0 |
| Bahasa | TypeScript (strict dimatikan - lihat `tsconfig.json`), Kotlin (33 file), C++20 |
| Audio native | Oboe 1.9.0 (vendored di `android/app/src/main/cpp/oboe/`), OpenSL ES, ALSA |
| Navigasi | expo-router 55 (`src/app/`), drawer + tabs |
| State | Zustand 4.5.5 |
| Penyimpanan | react-native-quick-sqlite 8.2.7, AsyncStorage |
| Animasi | Reanimated 4.2.1, Moti, Skia |
| Lint | oxlint 1.56 (bukan ESLint sebagai runner utama), Prettier 3.8 |
| Package manager | **pnpm 9**, `packageManager: pnpm@9.0.0` |

`newArchEnabled: true` (lihat `android/gradle.properties`). Codegen: `PristineAudioSpec` -> `com.pristineaudio.app`.

---

## Setup

```bash
pnpm install
pnpm download-oboe        # unduh Oboe 1.9.0 ke android/app/src/main/cpp/oboe/
pnpm start                # expo start
```

`pnpm install` menjalankan `husky install` lewat `prepare`. Di lingkungan tanpa husky (CI), set `HUSKY=0` - workflow `build-preview.yml` sudah melakukannya.

**`android/` di-commit** di repo ini (259 file ter-track). Ini berbeda dari persona, di mana `android/` di-generate ulang tiap build. Konsekuensinya: hand-edit `android/` **bertahan** di sini. Jangan menyimpulkan sebaliknya dari pengalaman di proyek persona.

---

## Verifikasi lokal (tanpa Gradle, tanpa Android SDK) - Android SDK/NDK **tidak terpasang** di lingkungan ini. Tapi bukan berarti tidak bisa diverifikasi - ini yang benar-benar jalan:

```bash
pnpm typecheck                                    # tsc --noEmit - lulus per 2026-10-03
pnpm lint:check                                   # oxlint src (tanpa --fix)
python3 scripts/generate_compile_commands.py      # generate compile_commands.json utk clangd
bash scripts/check.sh                             # clangd sanity check semua .cpp
bash scripts/check.sh core/AudioEngine.cpp        # atau satu file
```

`scripts/check.sh` **memerlukan** `compile_commands.json` di `android/app/src/main/cpp/`. Kalau belum ada, skripnya berhenti dengan instruksi generate-nya. Ia juga memperingatkan kalau `CMakeLists.txt` lebih baru dari `compile_commands.json` (artinya daftar itu stale).

**`npx tsc` lambat** (~100 detik di Termux). Gunakan `node_modules/.bin/tsc` untuk menghindari resolusi npx.

---

## Build - Build native **hanya lewat CI atau EAS** - tidak ada Gradle lokal.

```bash
# EAS (profile di eas.json)
pnpm build:dev        # eas build --platform android --profile development
pnpm build:preview    # eas build --platform all --profile preview
pnpm build:prod       # eas build --platform all --profile production

# GitLab CI (satu-satunya CI ber-trigger otomatis)
#   .gitlab-ci.yml - branch pristine-audio
#  - Job: build-apk -> ./gradlew assembleDebug --no-daemon --no-parallel --max-workers=2

# GitHub Actions - 5 workflow, SEMUA hanya workflow_dispatch (manual)
#   .github/workflows/build.yml - debug APK
#   .github/workflows/build-dev.yml - dev client
#   .github/workflows/build-preview.yml - preview
#   .github/workflows/runtime-test.yml - uji runtime
#   .github/workflows/autolinking-debug.yml - debug autolinking
```

**Jebakan build yang sudah terverifikasi:**

1. **`eas.json` mengunci `cache.key` ke `yarn.lock`** - proyek ini pakai pnpm. Cache key itu selalu miss. Efeknya build lebih lambat, bukan gagal, tapi perbaiki sebelum bergantung pada cache.
2. **Oboe tidak di-commit.** Build apa pun yang tidak menjalankan `pnpm download-oboe` (atau `eas-hooks/`) akan gagal di CMake. `.gitlab-ci.yml` mengunduhnya sendiri di `before_script`.
3. **CMake 3.22.1 dipasang manual** di GitLab CI; NDK dipin ke `27.1.12297006` dan tidak dijamin ada di runner tanpa langkah `sdkmanager`.

---

## Yang wajib diketahui sebelum mengubah kode - **`android/` di-track** (berbeda dari persona) - hand-edit bertahan, tapi juga berarti konflik merge nyata saat prebuild dijalankan.
- **Native C++ diubah lewat `scripts/patch-*.py`** - ~58 skrip idempotent yang mencari `old`->`new` di file native, dengan backup otomatis `.bak_<timestamp>`. Pola ini disengaja: perubahan native bisa di-review sebagai diff. **Jangan commit `*.bak_*`.**
- **Jangan hand-edit `android/app/src/main/cpp/oboe/`** - itu dependensi vendored, akan tertimpa saat `pnpm download-oboe`.
- **`tsconfig.json` mematikan `strict`, `strictNullChecks`, `strictFunctionTypes`.** Ini pilihan sadar; jangan "memperbaiki" tanpa membahasnya.
- **`fastRefresh` dan log BOOT** - `src/app/_layout.tsx` memuat `console.log("[BOOT] ...")` di beberapa titik. Berguna saat debug, berisik di produksi.

---

## Dokumentasi - Indeks lengkap: **`docs/README.md`**. Yang paling sering dibutuhkan:

| Dokumen | Isi |
|---|---|
| `docs/ROADMAP.md` | Satu-satunya roadmap. Status per fase, terverifikasi |
| `docs/ARCHITECTURE.md` | Stack, folder tree, ADR bernomor |
| `docs/FEATURES.md` | Status implementasi per fitur (scope dipisah dari status) |
| `docs/TROUBLESHOOTING.md` | Root cause build yang sudah pernah ketemu & fix-nya |
| `docs/TESTING.md` | Cara verifikasi lokal, CI, manual QA |
| `docs/VISUAL_HEALTH.md` | Utang visual terukur (519 spacing, 16 kontras gagal) |
| `docs/THREAT_MODEL.md` | Aset, ancaman, status mitigasi |

`AGENTS.md` di root berisi aturan knowledge graph (graphify) untuk agent AI - bukan dokumentasi produk.

Dokumen lama (11 file roadmap/todolist yang tumpang tindih, 31 Agu-20 Sep 2026) dipindahkan ke `docs/archive/` dan tidak lagi jadi rujukan aktif. Isinya sudah diserap ke `ROADMAP.md` dan `TROUBLESHOOTING.md`.
