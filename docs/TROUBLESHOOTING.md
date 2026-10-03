# PristineAudio - Troubleshooting

Error yang sudah pernah ketemu dan fix-nya. **Cek dulu sebelum debug dari nol** - sebagian besar masalah di proyek ini termasuk sepuluh pola berulang di bawah.

Diserap dari `build-fix-changelog.md` (141 KB) dan `build-fix-status.md` (35 KB) sesi Agustus-September 2026, sekarang di `archive/`.

---

## Cara cepat: jalankan sanitas dulu

```bash
python3 scripts/generate_compile_commands.py   # wajib sekali, sebelum check.sh
bash scripts/check.sh                          # clangd, semua .cpp
bash scripts/check.sh core/AudioEngine.cpp     # atau satu file (jauh lebih cepat)
```

`check.sh` menangkap error tipe `no member`, `undeclared`, `expected ';'` - **tapi tidak menangkap silent wiring gap** (pola #9). Untuk itu perlu grep manual.

---

## Sepuluh pola berulang (cek ini dulu)

Sebelum menginvestigasi error C++ dari nol, periksa apakah ini salah satu pola yang sudah terbukti berulang. Semuanya pernah terjadi lebih dari sekali di proyek ini.

### 1. File kosong total (0 byte)

Beberapa header ternyata **kosong sama sekali** padahal di-`#include` dan dipakai. Selalu periksa ukuran file sebelum menyimpulkan "belum diimplementasikan".

Pernah terjadi di: `jni/NativeDeviceModule.h`, `profiling/LatencyProfiler.h`.

### 2. Isi file tertukar, atau header berisi class lain

Isi `.h` dan `.cpp` bisa **benar-benar tertukar** berdasarkan nama file. Juga ada kasus header yang seluruh isinya salinan dari class lain.

Pernah terjadi di: `modes/BitPerfectPipeline.h`/`.cpp` (tertukar), `dsp/BiquadFilter.h` (salah isi - ini memicu domino 5 file).

### 3. Qualifier namespace hilang

Error `no member` atau `unknown type` **sering berarti struct/method sudah ada di namespace lain**, bukan belum dibuat.

```bash
grep -rn "class SomeName\|struct SomeName" android/app/src/main/cpp/
```

Pola paling sering: `pristine::` (level luar) vs submodule (`pristine::decoder`, `pristine::playback`, `pristine::dsp`, `audio::dsp`).

**Cek definisi yang sudah ada via grep sebelum menulis ulang apa pun.**

### 4. `undeclared identifier` bisa berarti include hilang total

Kalau menambah qualifier masih gagal dengan `use of undeclared identifier 'namespace_name'`, periksa apakah **header sumbernya di-`#include` sama sekali**.

### 5. Dua hierarki class yang tidak nyambung

Kadang ada dua desain berbeda untuk tujuan mirip: class stateless vs stateful yang diharapkan caller, atau class polymorphic interface vs class standalone.

**Solusi: tambah adapter/instance-API.** Jangan ubah desain asli yang sudah dipakai di tempat lain.

### 6. Base class pure virtual tidak cocok dengan override subclass

Kalau subclass "abstract, tidak bisa di-`new`", periksa pure virtual **publik** di base - bukan hanya pola `onXxx()` yang protected.

### 7. Constructor mismatch bisa berarti masalah desain

Sebelum menambah parameter constructor untuk "memperbaiki" mismatch, periksa dulu apakah class yang dituju memang dimaksudkan menerima dependency itu, atau itu cuma asumsi lama di call site yang sudah usang.

### 8. File yang "sudah bersih" bisa regresi diam-diam

Jangan asumsikan status lama masih berlaku setelah ada perubahan struktural di file yang di-`#include`-nya. Scan ulang.

### 9. Silent wiring gap - fungsi lengkap tapi tidak pernah dipanggil

**Tidak akan ketahuan lewat `clangd`.** Kompilasi bersih, tapi fiturnya mati. Ini kelas bug paling berbahaya di proyek ini.

Cara mendeteksi:

```bash
# cari deklarasi, lalu cek apakah ada pemanggil selain definisi
grep -rn "initPlaybackModule" android/app/src/main/ | grep -v "/oboe/"
```

**Contoh aktif per 2026-10-03:**

| Fungsi | Lokasi definisi | Status |
|---|---|---|
| `initPlaybackModule(PlaybackController*)` | `jni/NativePlaybackModule.cpp:162` | **tidak pernah dipanggil.** `gPlaybackController` global tidak pernah di-set |
| `createResampler(ResamplerType)` | `resampler/AudioResampler.cpp` | tidak dideklarasikan di header mana pun, tidak dipanggil. Pipeline memakai `dsp::LinearResampler` langsung via `StreamResampler` |

### 10. File sampah di route tree

`src/app/_layout.tsx (2)` - duplikat 10 KB dari `_layout.tsx` yang tertinggal dari editor. expo-router mengabaikannya (bukan nama file valid), tapi ia mengotori grep dan tree.

---

## Error build spesifik

### `target_compile_reactnative_options` unknown CMake command

```
CMake Error at .../generated/source/codegen/jni/CMakeLists.txt:28
  Unknown CMake command "target_compile_reactnative_options".
```

**Bukan** error di file generated - itu gejala. Fungsi didefinisi di `node_modules/react-native/ReactCommon/cmake-utils/react-native-flags.cmake` dan **hanya** di-include oleh `ReactAndroid/cmake-utils/ReactNative-application.cmake`.

**Penyebab:** `CMakeLists.txt` app tidak meng-include `ReactNative-application.cmake`, atau `CMAKE_MODULE_PATH` tidak menunjuk ke cmake-utils RN.

### FFmpeg link gagal / `ReactAndroid::jsi` tidak ditemukan

Fix historis (22 Agustus 2026): tambahkan `target_link_libraries(${target} ${visibility} ReactAndroid::jsi)` - sekarang ada di `CMakeLists.txt:53`. FFmpeg di-exclude secara kondisional (`CMakeLists.txt:125-134`) agar tidak wajib saat tidak dipakai.

### Oboe tidak ditemukan saat CMake

Oboe 1.9.0 **tidak di-commit**. Kalau `android/app/src/main/cpp/oboe/` kosong:

```bash
pnpm download-oboe
```

CI melakukan ini sendiri (`.gitlab-ci.yml` `before_script`, `eas-hooks/`). Kalau gagal di CI tapi jalan lokal, itu sebabnya.

### Build mati di ujung tanpa pesan kompilasi

Biasanya **disk runner penuh**, bukan error kode. Gejalanya: Gradle gagal menulis file cache DAN runner gagal menulis step summary - dua-duanya gejala disk, bukan kompilasi. `.gitlab-ci.yml` membatasi `--max-workers=2` dan ABI tunggal `arm64-v8a` untuk alasan ini.

### `ccache` broken di Termux

`ccache 4.14.1` gagal link: simbol libc++ `_ZNSt6__ndk113__hash_memoryEPKvm` tidak ada. **Reinstall tidak membantu** - ini bug packaging Termux aarch64. Jangan buang waktu di sini; matikan ccache.

### `npx tsc` tampak hang

Bukan hang. tsc cold start di Termux ~100 detik. Gunakan `node_modules/.bin/tsc --noEmit` untuk melewati resolusi npx.

### Cache Gradle beracun setelah codegen regenerasi

Kalau build gagal dengan cara yang tidak masuk akal setelah codegen berjalan, hapus cache **sebelum** menyimpulkan fix gagal:

```bash
rm -rf android/.gradle android/app/.cxx
```

---

## Preseden yang sudah mati (jangan diulang)

Item dari dokumen lama yang **sudah tidak berlaku** - jangan dikerjakan lagi:

| Klaim lama | Kenyataan 2026-10-03 |
|---|---|
| `clearCache` native belum ada | Sudah ada: `NativePlaybackService.kt:210`, dipanggil `_layout.tsx:73` |
| `PlaybackManager.cpp/.h` dead code | Sudah dihapus dari repo |
| `react-native-track-player` perlu dibersihkan | Sudah tidak ada di `package.json` |
| Migrasi namespace `audio::` -> `pristine::` | **Belum diverifikasi** apakah tuntas; perlu `grep -rn "namespace audio"` |

---

## Aturan umum

**Cari FAILED pertama, bukan terakhir.** Build paralel mengeluarkan kegagalan tak terkait setelah yang asli:

```bash
grep -n "FAILED" build.log | head
```

**Jangan percaya komentar header.** Contoh nyata: `ThemeContext.tsx` berheader `src/shared/contexts/` (plural) padahal path-nya `src/shared/context/` (singular). `api/scanner.ts` menyebut `services/LibraryScanner.ts` yang bukan dirinya. Verifikasi path, jangan salin dari komentar.
