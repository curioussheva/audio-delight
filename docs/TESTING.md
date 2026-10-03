# PristineAudio - Testing

Strategi verifikasi, disesuaikan dengan constraint: **tidak ada Gradle lokal, tidak ada Android SDK/NDK, tidak ada emulator.** Build native hanya lewat CI atau EAS.

> **Status 2026-10-03 (diperbarui): proyek ini punya 98 test Jest di 6 suite, semuanya untuk logika murni TS.** Sebelumnya nol. Ini baru lapisan pertama; **C++ masih tanpa test sama sekali** (193 file, bagian terbesar risiko). Lihat bagian 5 untuk batasnya.

---

## 1. Verifikasi lokal yang benar-benar jalan (sekarang)

```bash
# Test unit logika murni (Jest + ts-jest, ~25 detik)
pnpm test                    # jest, semua suite (98 test, ~25 detik)
pnpm test:watch              # jest --watch
pnpm test:coverage           # jest --coverage

# Typecheck seluruh project (~100 detik di Termux)
node_modules/.bin/tsc --noEmit          # atau: pnpm typecheck
# Hasil 2026-10-03: LULUS, 0 error

# Lint (oxlint, bukan ESLint sebagai runner utama)
pnpm lint:check                          # oxlint src  - tanpa --fix
pnpm lint                                # oxlint src --fix
pnpm format                              # prettier --write "src/**/*.{ts,tsx}"

# Sanitas C++ (butuh compile_commands.json)
python3 scripts/generate_compile_commands.py
bash scripts/check.sh                    # semua .cpp, timeout 30s per file
bash scripts/check.sh core/AudioEngine.cpp   # satu file - jauh lebih cepat
```

`check.sh` **keluar 1** kalau ada error, jadi bisa dipakai sebagai gerbang. Ia melewatkan `cpp/oboe/**` (dependensi vendored) dan file `*.bak*`.

**Batas jujur dari `check.sh`:** ia menangkap `no member`, `error:`, `undeclared`, `does not name a type`, `expected ';'`. Ia **tidak menangkap silent wiring gap** - fungsi yang lengkap tapi tidak pernah dipanggil kompilasi dengan bersih. Lihat `TROUBLESHOOTING.md` pola #9.

## 2. Yang diverifikasi CI

**Tidak ada satu pun workflow yang menjalankan test.** Yang dijalankan hanya build:

| Workflow | Trigger | Yang dilakukan |
|---|---|---|
| `.gitlab-ci.yml` | push ke `pristine-audio` | `yarn install` -> `patch-package` -> unduh Oboe -> `./gradlew assembleDebug --max-workers=2`, ABI `arm64-v8a` |
| `.github/workflows/build.yml` | `workflow_dispatch` | build debug APK |
| `.github/workflows/build-dev.yml` | `workflow_dispatch` | dev client APK |
| `.github/workflows/build-preview.yml` | `workflow_dispatch` | preview APK |
| `.github/workflows/runtime-test.yml` | `workflow_dispatch` | uji runtime |
| `.github/workflows/autolinking-debug.yml` | `workflow_dispatch` | debug autolinking |

**Semua workflow GitHub hanya `workflow_dispatch`** - tidak ada yang otomatis saat push. Belum diverifikasi apakah ini disengaja.

**Cacat yang perlu diperbaiki:** `.gitlab-ci.yml` memakai `yarn install --frozen-lockfile`, padahal proyek ini pakai pnpm dengan `pnpm-lock.yaml`. Ia juga memanggil `npx patch-package` untuk `patches/`.

## 3. Kenapa typecheck hijau tidak membuktikan apa pun soal aplikasi

Kelas kegagalan yang lolos typecheck **dan** lolos build native:

1. **Kabel yang tidak tersambung.** `initPlaybackModule` didefinisikan, dikompilasi bersih, dan tidak pernah dipanggil. Typecheck lulus. Build lulus. Fitur mati.
2. **Nilai default yang salah.** Mode DSP default pernah salah (DSP aktif padahal seharusnya BitPerfect). Tidak ada error tipe yang bisa menangkapnya.
3. **Nama file yang tidak cocok dengan isinya.** `ThemeContext.tsx` berheader `contexts/` padahal path `context/`. Kedua impor menunjuk `@/shared/constants/theme` sehingga tidak ada yang pecah, tapi header itu berbohong.
4. **File duplikat.** `_layout.tsx (2)` - diabaikan router, tidak pernah dibundel, tidak pernah dilint.

Persona memakai pola yang tepat untuk kelas ini: modul murni dikompilasi apa adanya lalu dijalankan di Node, dan dibandingkan dengan **implementasi independen** (mis. PBKDF2 JS vs `hashlib.pbkdf2_hmac`). PristineAudio belum punya padanannya.

## 4. Manual QA (belum dijalankan - ini yang dibutuhkan)

Karena tidak ada test otomatis dan tidak ada verifikasi device, checklist berikut adalah **satu-satunya** cara membuktikan aplikasi berjalan. Belum pernah dijalankan.

```bash
pnpm build:dev          # atau trigger build-dev.yml di GitHub Actions
# pasang APK, lalu pantau:
adb logcat -s PristineAudio ReactNativeJS
```

| # | Uji | Cara memastikan |
|---|---|---|
| 1 | App terbuka tanpa crash | logcat bersih dari `FATAL EXCEPTION` |
| 2 | Library terisi | jumlah lagu > 0; bandingkan dengan file nyata di device |
| 3 | Play lagu | audio keluar dari speaker/headphone, bukan diam |
| 4 | Pause / resume | posisi tidak melompat |
| 5 | Seek | posisi pindah, audio ikut |
| 6 | Next / prev | track berganti, tidak hang |
| 7 | Auto-next di akhir lagu | lanjut sendiri tanpa interaksi |
| 8 | Shuffle / repeat | urutan berubah sesuai mode |
| 9 | **BitPerfect benar-benar bypass** | bandingkan dengan DSP aktif - harus terdengar beda |
| 10 | Equalizer mengubah suara | geser band, dengar perubahannya |
| 11 | Visualizer bergerak | spektrum bergerak mengikuti audio |
| 12 | Ganti tema | seluruh UI ikut berubah, tidak ada elemen tertinggal |
| 13 | 20 tema berturut-turut | tidak ada crash, tidak ada warna tak terbaca |
| 14 | MediaSession | kontrol dari lock screen bekerja |
| 15 | Foreground service | app bertahan 10+ menit di background |
| 16 | USB DAC | terdeteksi di output settings, audio keluar dari DAC |
| 17 | Scan library besar | tidak hang; ukur waktunya |

**Yang paling sering dilewatkan:** #9. Mengubah konstanta default di kode tidak membuktikan bahwa jalur BitPerfect benar-benar melewati DSP - harus terdengar.

## 5. Test yang sudah ada (dibuat 2026-10-03)

98 test, 6 suite. Empat suite pertama murni tanpa mock; dua terakhir memakai `jest.mock` untuk modul yang menyeret kode native. Semua berjalan di `testEnvironment: node`.

| Suite | Test | Yang dijaga |
|---|---|---|
| `shared/utils/LrcParser.test.ts` | 11 | Parser lirik LRC: format timestamp, multi-timestamp, pengurutan, state regex |
| `shared/types/dsp.test.ts` | 19 | `createFlatEQ`, clamp gain, `dbToLinear`/`linearToDb`, mapping reverb |
| `shared/types/audio.test.ts` | 15 | `formatDuration`, `formatFileSize`, batas satuan |
| `shared/types/dac.test.ts` | 13 | `canDoBitPerfect`, `isHiResCapable`, `recommendDSDMode` |
| `features/audio/BitDepthVerifier.test.ts` | 23 | Heuristik deteksi bit depth palsu & upsample |
| `features/library/ScanDiffEngine.test.ts` | 17 | Logika diff scan + pengaman anti-hapus-library |

Dua suite terakhir butuh `jest.mock` untuk modul yang menyeret native (`audioAnalyzer`, `MediaStore`, `LibraryScanner`, `db`) - bukan karena RN, tapi karena fungsi murni yang diuji tinggal serumah dengan kode native.

**Konfigurasi sengaja minimal:** `jest.config.cjs` + `preset: "ts-jest"`, tanpa `babel-preset-expo`. Alasannya: memuat babel-expo akan menyeret kebutuhan mock RN ke setiap test, padahal yang diuji murni TS. Kalau nanti perlu menguji komponen, buat project Jest **terpisah** dengan `jest-expo` - jangan bebankan mock ke suite yang sekarang.

**Lokasi test di `src/__tests__/`, bukan `__tests__/` di samping modul.** Ini bukan pilihan estetika: `tsconfig.json` mencantumkan `./src/shared/types` di `typeRoots`, sehingga folder `__tests__` di dalamnya dipindai TypeScript sebagai *type library* dan memunculkan `error TS2688: Cannot find type definition file for '__tests__'`. Menaruhnya di `src/__tests__/` menghindari itu tanpa mengubah tsconfig.

### Bug yang ditemukan test ini

Tiga, semuanya **lolos typecheck dan lolos build** - persis alasan test ini ada.

**1. `formatDuration(Infinity)` mengembalikan `"Infinity:NaN"`.** Penjaganya `if (!seconds || isNaN(seconds))` tidak menangkap `Infinity`: nilainya truthy, dan `isNaN(Infinity)` bernilai `false`. Diperbaiki jadi `if (!Number.isFinite(seconds) || seconds <= 0)`, yang sekaligus menangani nilai negatif.

**2. Deteksi "FLAC palsu" salah skala, hampir semua hi-res asli dituduh palsu.** `estimateRealBitDepth` menghitung `(dynamicRange - 1.76) / 6.02` - yang **sudah bernilai satuan bit** - lalu membandingkannya dengan ambang `18` dan `26`. Ambang 18 berarti menuntut DR >= 110 dB sebelum file diakui 24-bit; 24-bit asli DR 100-120 dB, dan maksimum teoretisnya 146 dB. Akibatnya file 24/96 asli diklasifikasi 16-bit. Ambang diperbaiki jadi `16`/`24` (satuan bit, sejalan dengan rumusnya). Ambang lama juga tidak pernah bisa mencapai 32-bit (butuh DR 158 dB, di atas maksimum teoretis 32-bit).

**3. Satu kegagalan query MediaStore menghapus SELURUH library pengguna.** Ini yang terburuk. `MediaStore.queryAudioFiles()` menangkap error lalu `return []` - array kosong tidak bisa dibedakan dari "device tidak punya file audio". `ScanDiffEngine` lalu menyimpulkan bahwa **semua** lagu di database sudah terhapus, dan memanggil `deleteSongsByUris` dengan seluruh library. Playlist, favorit, dan riwayat ikut hilang karena merujuk ke lagu yang dihapus. Pemicunya hal biasa: izin dicabut, MediaStore sibuk, OOM.

Diperbaiki berlapis:
- `MediaStore.queryAudioFiles()` **melempar** error, tidak lagi menyamarkannya sebagai array kosong.
- `isDeletionPlausible()` menahan penghapusan massal: >= 5 lagu dihapus sekaligus dengan device melaporkan nol file, atau lebih dari 50% library hilang, akan ditolak dan dicatat ke log.
- `processQuickDiff` sekarang memakai transaction untuk penulisan (sebelumnya tidak), sehingga scan yang gagal di tengah tidak meninggalkan database setengah terisi.
- `computeDiff()` diekstrak jadi fungsi murni, dan **kedua** jalur diff (quick & full) memakai pengaman yang sama - sebelumnya `runMediaStoreDiff` menghapus tanpa penjagaan apa pun.

Uji regresinya ada di `ScanDiffEngine.test.ts`: 1196 lagu di database dengan MediaStore melaporkan 0 file **harus** ditolak.

## 6. Yang seharusnya diotomasi berikutnya (urutan)

1. ~~**Jest untuk logika murni**~~ - **selesai** untuk `LrcParser`, `dsp`, `audio`, `dac`.
2. ~~**`ScanDiffEngine`**~~ - **selesai** (17 test, termasuk pengaman anti-hapus-library).
3. ~~**`BitDepthVerifier.analyzeBitDepth`**~~ - **selesai** (23 test).
4. **`selectors.ts`** - pengelompokan album/artis. Mengimpor tipe dari `libraryStore.ts` yang menyeret zustand + AsyncStorage; butuh `jest.mock` atau pemisahan tipe. Pola mock-nya sudah ada di `ScanDiffEngine.test.ts`.
4. **Test kontras 20 tema** - port pola `check_contrast.ts` persona. Angka awalnya ada di `VISUAL_HEALTH.md` (16 gagal); jadikan gerbang setelah diperbaiki.
5. **`check_layout.ts` sebagai gerbang CI** - cegah literal spacing **baru** (519 existing, anggap baseline).
6. **Job `verify` terpisah sebelum `build`** - pola persona: kegagalan JS muncul ~2 menit, bukan setelah 16 menit `assembleDebug`.
7. **`scripts/check.sh` di CI** - menangkap error C++ tanpa perlu `assembleDebug`.

**C++ tetap nol test.** Itu 193 file dan bagian terbesar risiko; Jest tidak menyentuhnya. Padanan yang benar adalah pola persona: kompilasi modul murni lalu jalankan di host, dan bandingkan dengan implementasi independen.

## 7. Batas yang tidak bisa dilewati dari lingkungan ini

- **Tidak ada `adb devices`.** Tidak ada device, tidak ada emulator.
- **Tidak ada Gradle.** `./gradlew` tidak bisa dijalankan lokal.
- **Tidak ada Android SDK/NDK.** `assembleDebug` mustahil lokal.
- **`/tmp` tidak writable** - pakai `$TMPDIR`.
- **`which` rusak** - pakai `command -v`.
- **Tidak ada valgrind/heaptrack/frida/flipper.** Untuk debug C++, pakai **AddressSanitizer** (`-fsanitize=address`), yang terverifikasi bekerja di Termux.

**Konsekuensinya:** kelas bug yang butuh runtime - race condition, deadlock, underrun, glitch audio - **tidak bisa diverifikasi sama sekali** dari sini. Itu harus diakui, bukan disamarkan dengan build hijau.
