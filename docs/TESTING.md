# PristineAudio - Testing

Strategi verifikasi, disesuaikan dengan constraint: **tidak ada Gradle lokal, tidak ada Android SDK/NDK, tidak ada emulator.** Build native hanya lewat CI atau EAS.

> **Status 2026-10-03 (diperbarui): proyek ini punya test otomatis pertama - 58 test Jest di 4 suite, semuanya untuk logika murni TS.** Sebelumnya nol. Ini baru lapisan pertama; **C++ masih tanpa test sama sekali** (193 file, bagian terbesar risiko). Lihat bagian 5 untuk batasnya.

---

## 1. Verifikasi lokal yang benar-benar jalan (sekarang)

```bash
# Test unit logika murni (Jest + ts-jest, ~60 detik)
pnpm test                    # jest, semua suite
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

58 test, 4 suite. Semuanya di `src/__tests__/`, menguji **logika murni** - tidak ada import react/react-native/expo, sehingga berjalan di `testEnvironment: node` tanpa satu pun mock.

| Suite | Test | Yang dijaga |
|---|---|---|
| `shared/utils/LrcParser.test.ts` | 11 | Parser lirik LRC: format timestamp, multi-timestamp, pengurutan, state regex |
| `shared/types/dsp.test.ts` | 19 | `createFlatEQ`, clamp gain, `dbToLinear`/`linearToDb`, mapping reverb |
| `shared/types/audio.test.ts` | 15 | `formatDuration`, `formatFileSize`, batas satuan |
| `shared/types/dac.test.ts` | 13 | `canDoBitPerfect`, `isHiResCapable`, `recommendDSDMode` |

**Konfigurasi sengaja minimal:** `jest.config.cjs` + `preset: "ts-jest"`, tanpa `babel-preset-expo`. Alasannya: memuat babel-expo akan menyeret kebutuhan mock RN ke setiap test, padahal yang diuji murni TS. Kalau nanti perlu menguji komponen, buat project Jest **terpisah** dengan `jest-expo` - jangan bebankan mock ke suite yang sekarang.

**Lokasi test di `src/__tests__/`, bukan `__tests__/` di samping modul.** Ini bukan pilihan estetika: `tsconfig.json` mencantumkan `./src/shared/types` di `typeRoots`, sehingga folder `__tests__` di dalamnya dipindai TypeScript sebagai *type library* dan memunculkan `error TS2688: Cannot find type definition file for '__tests__'`. Menaruhnya di `src/__tests__/` menghindari itu tanpa mengubah tsconfig.

### Bug yang ditemukan test ini

**`formatDuration(Infinity)` mengembalikan `"Infinity:NaN"`.** Penjaganya `if (!seconds || isNaN(seconds))` tidak menangkap `Infinity`: nilainya truthy, dan `isNaN(Infinity)` bernilai `false`. Diperbaiki jadi `if (!Number.isFinite(seconds) || seconds <= 0)`, yang sekaligus menangani nilai negatif. Ini kelas bug yang **lolos typecheck dan lolos build** - persis alasan test ini ada.

## 6. Yang seharusnya diotomasi berikutnya (urutan)

1. ~~**Jest untuk logika murni**~~ - **selesai** untuk `LrcParser`, `dsp`, `audio`, `dac`.
2. **`ScanDiffEngine` + `selectors.ts`** - logika diff scan dan pengelompokan album/artis. Murni, tapi `selectors.ts` mengimpor tipe dari `libraryStore.ts` yang menyeret zustand + AsyncStorage; butuh `jest.mock` untuk store atau pemisahan tipe.
3. **`BitDepthVerifier.analyzeBitDepth`** - deteksi FLAC palsu/upscale. Murni, nilainya tinggi, dan salah di sini langsung menyesatkan pengguna.
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
