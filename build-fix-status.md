# Status Build `pristine-audio` — Ringkasan Aktif

Status per 21 Agustus 2026. Untuk detail forensik lengkap (kenapa tiap bug terjadi, histori investigasi), lihat `build-fix-changelog.md`. File ini hanya untuk kerja sehari-hari: apa yang masih perlu dikerjakan.

**Cara verifikasi:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/), lihat daftar via:
scripts/check.sh 2>&1 | grep "^=== "    # ringkasan cepat file mana saja yang masih error
```

---

## ✅ FASE 0 — Selesai
## ✅ FASE 1 — Selesai
## ✅ FASE 2 — Selesai (semua yang bisa dikerjakan lokal)

82 file `.cpp` total di project. Saat ini **hanya 5 file** yang masih error di `scripts/check.sh`, dan kelimanya punya alasan jelas kenapa ditunda (bukan belum diinvestigasi):

### ⚠️ Limitation lingkungan (bukan bug kode — 2 file)
Dependency eksternal belum terpasang di Termux lokal. Kemungkinan besar akan compile normal di CI/build system sebenarnya (Gradle/CMake dengan dependency lengkap).
- `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ditemukan
- `jni/JSIInstaller.cpp` — `jsi/jsi.h` (React Native JSI) tidak ditemukan; body fungsi masih placeholder kosong

### 🕐 Ditunda — keputusan arsitektur (1 file)
- `fft/FFTProcessor.cpp` — sisa 1 error `createHanningWindow` undeclared. Fix-nya sudah jelas (tambah deklarasi ke `WindowFunctions.h`), tapi sengaja ditunda sampai migrasi namespace `audio::`→`pristine::` dilakukan (lihat bagian Fase 3 & Catatan Arsitektur di bawah).

### 🔴 FASE 3 — Blocked, butuh keputusan desain (2 file)
Tiga tipe/class besar berikut **belum diimplementasikan sama sekali** di project manapun (dikonfirmasi via grep menyeluruh — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — return type semua command play/pause/stop/seek/next/previous di `TransportControls`
- `TransportCommand` (tipe) — dipakai di `TransportControls.h:114`
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`, `PlaybackManager.h/.cpp`

File yang terblokir sampai desain ini diputuskan:
- `playback/PlaybackManager.cpp` — `TransportState.h` tidak ditemukan; `setQueue` mismatch; constructor `PlaybackScheduler` tidak cocok
- `playback/PlaybackScheduler.cpp` — `TransportState.h` tidak ditemukan

**Pertanyaan desain yang perlu dijawab sebelum mengerjakan ini:**
1. Apa saja value yang valid untuk `TransportResult` dan `TransportCommand`?
2. Bagaimana bentuk event yang dikirim `PlaybackEventDispatcher` (apa saja jenis event, payload apa)?
3. Di mana `TransportState.h` seharusnya berada / apa isinya?

---

## 🕳️ Silent wiring gaps (bukan compile error — tidak kena `clangd`)

Ditemukan fungsi yang sudah diimplementasikan lengkap tapi **tidak pernah dipanggil dari manapun** di seluruh project. Bukan bug yang perlu diperbaiki sekarang, tapi perlu diingat saat masuk tahap integrasi end-to-end:

- `initPlaybackModule(pristine::playback::PlaybackController*)` di `jni/NativePlaybackModule.cpp` — `gPlaybackController` global tidak pernah di-set dari inisialisasi engine manapun.
- `createResampler(ResamplerType)` di `resampler/AudioResampler.cpp` — tidak dideklarasikan di header manapun, tidak dipanggil dari manapun. Decoder pipeline saat ini menggunakan `dsp::LinearResampler` langsung via `StreamResampler`, bukan lewat factory ini.

---

## 🏛️ Catatan arsitektur — migrasi namespace `audio::` → `pristine::`

**Keputusan (20 Agustus 2026): namespace akan disatukan jadi `pristine::` saja.** `audio::` akan dihapus/dimigrasikan sepenuhnya.

**Scope migrasi** (dikonfirmasi via `grep -rln "namespace audio\b"`): `devices/*`, `usb/*`, `fft/*`, `dsp/immersive/*`, `dsp/convolution/WindowFunctions.cpp` — belasan file. Selama sesi Fase 2, beberapa file baru dari scope ini ikut ditemukan masih di `namespace audio`: `devices/AudioDeviceManager.h` juga termasuk (dikonfirmasi saat fix `NativeDeviceModule.cpp` — lihat changelog).

**URUTAN EKSEKUSI PENTING — jangan migrasi sekarang.** Migrasi dilakukan **PALING TERAKHIR**, setelah Fase 3 (dan sisa Fase 2 yang blocked) tuntas. Alasan:
- Migrasi ini mekanikal (sed rename namespace) tapi butuh verifikasi manual: cek referensi eksplisit `audio::SomeType` di file `pristine::` lain, cek potensi name collision (`pristine::X` vs `audio::X` beda arti sama nama).
- Kalau dicampur dengan fix compile error yang masih berjalan, sulit membedakan "error karena rename namespace" vs "error karena memang belum diimplementasikan".

**Checklist saat waktunya migrasi tiba:**
1. Pastikan semua file di scope sudah 0 error compile dulu (`scripts/check.sh`)
2. `grep -rn "audio::" android/app/src/main/cpp` untuk cari SEMUA qualified reference lintas file
3. Cek collision nama antara `pristine::X` dan `audio::X` sebelum digabung
4. Rename `namespace audio {` → `namespace pristine {` per file
5. Hapus/ganti semua qualified `audio::` reference jadi `pristine::` (atau hapus qualifier kalau sudah dalam namespace yang sama)
6. `scripts/check.sh` ulang menyeluruh untuk pastikan tidak ada yang lolos

---

## Catatan proses — pola yang perlu diwaspadai ke depan

Ringkasan pola berulang selama Fase 2 (detail lengkap tiap kejadian ada di changelog). Cek pola ini dulu sebelum investigasi error dari nol:

1. **File kosong total (0 byte)** — beberapa header ternyata kosong sama sekali padahal di-`#include` dan dipakai. Selalu `ls -la`/`wc -l` file yang dicurigai sebelum menyimpulkan "belum diimplementasikan". Ditemukan di: `jni/NativeDeviceModule.h`, `profiling/LatencyProfiler.h`.
2. **File isi salah/tertukar** — isi `.h` dan `.cpp` bisa benar-benar tertukar berdasarkan nama file (bukan sekadar typo path). Ditemukan di: `modes/BitPerfectPipeline.h`/`.cpp`. Juga ada kasus header salah isi total (copy dari class lain): `dsp/BiquadFilter.h`.
3. **Qualifier namespace hilang** — error "no_member"/"unknown_type" sering berarti struct/method **sudah ada** tapi di namespace lain, butuh qualifier — bukan belum diimplementasikan. Cek definisi existing dulu via grep sebelum menulis ulang apa pun. Pola paling sering terjadi antara `pristine::` (level luar) dan submodule (`pristine::decoder`, `pristine::playback`, `pristine::dsp`, `audio::dsp`).
4. **"Undeclared identifier" bisa berarti include hilang total** — bukan cuma qualifier. Kalau nambah qualifier saja masih gagal dengan "use of undeclared identifier 'namespace_name'", cek dulu apakah header sumbernya di-`#include` sama sekali.
5. **Dua hierarchy class yang tidak nyambung** — kadang ada dua desain berbeda untuk tujuan mirip (mis. class stateless/static vs stateful yang diharapkan caller; class polymorphic interface vs class standalone). Solusi: tambah adapter/instance-API, jangan ubah desain asli yang sudah dipakai di tempat lain.
6. **Base class pure virtual tidak cocok dengan override di subclass** — kalau subclass "abstract, tidak bisa di-`new`", cek pure virtual **publik** di base (bukan cuma pola `onXxx()` yang protected).
7. **Constructor mismatch bisa berarti masalah desain, bukan cuma parameter** — sebelum menambah parameter constructor untuk "memperbaiki" mismatch, cek dulu apakah desain class yang dituju memang dimaksudkan menerima dependency itu, atau itu cuma asumsi lama di call site yang sudah usang.
8. **File yang "sudah bersih" bisa regresi diam-diam** — jangan asumsikan status lama masih berlaku setelah ada perubahan struktural di file yang di-include-nya. Selalu scan ulang.
9. **Silent wiring gaps** — fungsi lengkap tapi tidak dipanggil dari mana pun, tidak akan ketahuan lewat `clangd`. Baru ketahuan lewat `grep -rln "namaFungsi"` yang hasilnya cuma 1 (definisinya sendiri).



######### update 1 ##########

# Status Build `pristine-audio` — Ringkasan Aktif

Status per 21 Agustus 2026. Untuk detail forensik lengkap (kenapa tiap bug terjadi, histori investigasi), lihat `build-fix-changelog.md`. File ini hanya untuk kerja sehari-hari: apa yang masih perlu dikerjakan.

**Cara verifikasi:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/), lihat daftar via:
scripts/check.sh 2>&1 | grep "^=== "    # ringkasan cepat file mana saja yang masih error
```

---

## ✅ FASE 0 — Selesai
## ✅ FASE 1 — Selesai
## ✅ FASE 2 — Selesai (semua yang bisa dikerjakan lokal)
## ✅ FASE 3 — Selesai (klaim "belum diimplementasikan" sebelumnya TIDAK AKURAT)

**Koreksi penting**: catatan lama menyebut `TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` "belum diimplementasikan sama sekali, butuh keputusan desain". Ini **salah** — ketiganya sudah lengkap diimplementasikan sejak lama di `TransportControls.h` dan `PlaybackEvents.h` (observer pattern sederhana, command-source-aware async command queue dengan dedup). Yang sebenarnya terjadi cuma beberapa bug konkret level Fase 2 biasa (1 file kecil hilang + duplicate member name + beberapa method belum diimplementasikan) — bukan desain arsitektur baru dari nol. Detail lengkap di changelog.

82 file `.cpp` total di project. Saat ini **hanya 3 file (96% bersih)** yang masih error di `scripts/check.sh`, dan ketiganya punya alasan jelas kenapa ditunda:

### ⚠️ Limitation lingkungan (bukan bug kode — 2 file)
Dependency eksternal belum terpasang di Termux lokal. Kemungkinan besar akan compile normal di CI/build system sebenarnya (Gradle/CMake dengan dependency lengkap).
- `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ditemukan
- `jni/JSIInstaller.cpp` — `jsi/jsi.h` (React Native JSI) tidak ditemukan; body fungsi masih placeholder kosong

### 🕐 Ditunda — keputusan arsitektur (1 file)
- `fft/FFTProcessor.cpp` — sisa 1 error `createHanningWindow` undeclared. Fix-nya sudah jelas (tambah deklarasi ke `WindowFunctions.h`), tapi sengaja ditunda sampai migrasi namespace `audio::`→`pristine::` dilakukan (lihat Catatan Arsitektur di bawah).

---

## 🕳️ Silent wiring gaps (bukan compile error — tidak kena `clangd`)

Ditemukan fungsi yang sudah diimplementasikan lengkap tapi **tidak pernah dipanggil dari manapun** di seluruh project. Bukan bug yang perlu diperbaiki sekarang, tapi perlu diingat saat masuk tahap integrasi end-to-end:

- `initPlaybackModule(pristine::playback::PlaybackController*)` di `jni/NativePlaybackModule.cpp` — `gPlaybackController` global tidak pernah di-set dari inisialisasi engine manapun.
- `createResampler(ResamplerType)` di `resampler/AudioResampler.cpp` — tidak dideklarasikan di header manapun, tidak dipanggil dari manapun. Decoder pipeline saat ini menggunakan `dsp::LinearResampler` langsung via `StreamResampler`, bukan lewat factory ini.

---

## 🏛️ Catatan arsitektur — migrasi namespace `audio::` → `pristine::`

**Keputusan (20 Agustus 2026): namespace akan disatukan jadi `pristine::` saja.** `audio::` akan dihapus/dimigrasikan sepenuhnya.

**Scope migrasi** (dikonfirmasi via `grep -rln "namespace audio\b"`): `devices/*`, `usb/*`, `fft/*`, `dsp/immersive/*`, `dsp/convolution/WindowFunctions.cpp` — belasan file. Selama sesi Fase 2, beberapa file baru dari scope ini ikut ditemukan masih di `namespace audio`: `devices/AudioDeviceManager.h` juga termasuk (dikonfirmasi saat fix `NativeDeviceModule.cpp` — lihat changelog).

**URUTAN EKSEKUSI PENTING — jangan migrasi sekarang.** Migrasi dilakukan **PALING TERAKHIR**, setelah Fase 3 (dan sisa Fase 2 yang blocked) tuntas. Alasan:
- Migrasi ini mekanikal (sed rename namespace) tapi butuh verifikasi manual: cek referensi eksplisit `audio::SomeType` di file `pristine::` lain, cek potensi name collision (`pristine::X` vs `audio::X` beda arti sama nama).
- Kalau dicampur dengan fix compile error yang masih berjalan, sulit membedakan "error karena rename namespace" vs "error karena memang belum diimplementasikan".

**Checklist saat waktunya migrasi tiba:**
1. Pastikan semua file di scope sudah 0 error compile dulu (`scripts/check.sh`)
2. `grep -rn "audio::" android/app/src/main/cpp` untuk cari SEMUA qualified reference lintas file
3. Cek collision nama antara `pristine::X` dan `audio::X` sebelum digabung
4. Rename `namespace audio {` → `namespace pristine {` per file
5. Hapus/ganti semua qualified `audio::` reference jadi `pristine::` (atau hapus qualifier kalau sudah dalam namespace yang sama)
6. `scripts/check.sh` ulang menyeluruh untuk pastikan tidak ada yang lolos

---

## Catatan proses — pola yang perlu diwaspadai ke depan

Ringkasan pola berulang selama Fase 2 (detail lengkap tiap kejadian ada di changelog). Cek pola ini dulu sebelum investigasi error dari nol:

1. **File kosong total (0 byte)** — beberapa header ternyata kosong sama sekali padahal di-`#include` dan dipakai. Selalu `ls -la`/`wc -l` file yang dicurigai sebelum menyimpulkan "belum diimplementasikan". Ditemukan di: `jni/NativeDeviceModule.h`, `profiling/LatencyProfiler.h`.
2. **File isi salah/tertukar** — isi `.h` dan `.cpp` bisa benar-benar tertukar berdasarkan nama file (bukan sekadar typo path). Ditemukan di: `modes/BitPerfectPipeline.h`/`.cpp`. Juga ada kasus header salah isi total (copy dari class lain): `dsp/BiquadFilter.h`.
3. **Qualifier namespace hilang** — error "no_member"/"unknown_type" sering berarti struct/method **sudah ada** tapi di namespace lain, butuh qualifier — bukan belum diimplementasikan. Cek definisi existing dulu via grep sebelum menulis ulang apa pun. Pola paling sering terjadi antara `pristine::` (level luar) dan submodule (`pristine::decoder`, `pristine::playback`, `pristine::dsp`, `audio::dsp`).
4. **"Undeclared identifier" bisa berarti include hilang total** — bukan cuma qualifier. Kalau nambah qualifier saja masih gagal dengan "use of undeclared identifier 'namespace_name'", cek dulu apakah header sumbernya di-`#include` sama sekali.
5. **Dua hierarchy class yang tidak nyambung** — kadang ada dua desain berbeda untuk tujuan mirip (mis. class stateless/static vs stateful yang diharapkan caller; class polymorphic interface vs class standalone). Solusi: tambah adapter/instance-API, jangan ubah desain asli yang sudah dipakai di tempat lain.
6. **Base class pure virtual tidak cocok dengan override di subclass** — kalau subclass "abstract, tidak bisa di-`new`", cek pure virtual **publik** di base (bukan cuma pola `onXxx()` yang protected).
7. **Constructor mismatch bisa berarti masalah desain, bukan cuma parameter** — sebelum menambah parameter constructor untuk "memperbaiki" mismatch, cek dulu apakah desain class yang dituju memang dimaksudkan menerima dependency itu, atau itu cuma asumsi lama di call site yang sudah usang.
8. **File yang "sudah bersih" bisa regresi diam-diam** — jangan asumsikan status lama masih berlaku setelah ada perubahan struktural di file yang di-include-nya. Selalu scan ulang.
9. **Silent wiring gaps** — fungsi lengkap tapi tidak dipanggil dari mana pun, tidak akan ketahuan lewat `clangd`. Baru ketahuan lewat `grep -rln "namaFungsi"` yang hasilnya cuma 1 (definisinya sendiri).


########## update 2 ##########


# Status Build `pristine-audio` — Ringkasan Aktif

Status per 22 Agustus 2026. Untuk detail forensik lengkap (kenapa tiap bug terjadi, histori investigasi), lihat `build-fix-changelog.md`. File ini hanya untuk kerja sehari-hari: apa yang masih perlu dikerjakan.

**Cara verifikasi:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/), lihat daftar via:
scripts/check.sh 2>&1 | grep "^=== "    # ringkasan cepat file mana saja yang masih error
```

---

## ✅ FASE 0, 1, 2, 3 — SEMUA SELESAI
## ✅ Migrasi namespace `audio::`→`pristine::` — SELESAI
## ✅ Fix `CMakeLists.txt` — FFmpeg exclude kondisional SELESAI

82 file `.cpp` total di project. **80 file (98%) bersih** menurut `scripts/check.sh`. Sisa **2 file**, keduanya murni limitation lingkungan Termux lokal (bukan bug kode):

### ⚠️ Limitation lingkungan (bukan bug kode)
- `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ditemukan. **Sudah tidak lagi menggagalkan build**: `CMakeLists.txt` sekarang mendeteksi FFmpeg lebih awal (sebelum `add_library`) dan meng-exclude file ini secara otomatis dari target kalau FFmpeg tidak tersedia, alih-alih membiarkan build gagal total.
- `jni/JSIInstaller.cpp` — `jsi/jsi.h` (React Native JSI) tidak ditemukan di Termux. **Dikonfirmasi via log CI (21 Agustus 2026)**: header JSI tersedia di environment CI asli (`-- JSI : ReactAndroid::jsi`), file ini kemungkinan besar compile sukses di sana.

Tidak ada lagi item yang ditunda karena keputusan arsitektur — migrasi namespace dan Fase 3 semuanya sudah tuntas.

---

## Riwayat pencapaian (ringkas, urut mundur)

1. **Migrasi namespace `audio::`→`pristine::`** (22 Agustus 2026) — 30 file dimigrasi penuh: `devices/*` (7 file + rename file `AudioDeviceInfo.h`→`AudioDeviceDescriptor.h` karena collision nama struct), `fft/*` (11 file), `usb/*` (4 file), `dsp/convolution/WindowFunctions.cpp` (1 file, plus fix `createHanningWindow` dkk yang sudah lama ditunda), `dsp/immersive/*` (10 file). Plus fix qualifier di 3 file konsumen: `modes/ImmersivePipeline.h/.cpp`, `dsp/immersive/FFTResonanceAnalyzer.h`, `jni/NativeDeviceModule.cpp`.
2. **Fix `CMakeLists.txt`** (22 Agustus 2026) — FFmpeg detection dipindah sebelum `add_library`, `FFmpegDecoder.cpp` di-exclude otomatis dari `ALL_SRCS` kalau FFmpeg tidak ditemukan (reuse mekanisme `EXCLUDED_SRCS` yang sudah ada untuk test files).
3. **Validasi CI eksternal** (21 Agustus 2026) — build GitHub Actions mengonfirmasi akurasi kerja `clangd` lokal: satu-satunya kegagalan sebelum fix #2 adalah `FFmpegDecoder.cpp`, persis sesuai prediksi.
4. **Fase 3 direklasifikasi** (21 Agustus 2026) — klaim lama "belum diimplementasikan" ternyata salah; `TransportResult`/`TransportCommand`/`PlaybackEventDispatcher` sudah lengkap, hanya perlu 4 fix konkret level Fase 2 (`TransportState.h` alias, duplicate member `state_`, `TrackQueue::tracks()`, `PlaybackManager` type/order fix).
5. **Fase 2 utama** (20-21 Agustus 2026) — root-cause fixes besar: `dsp/BiquadFilter.h` (file salah isi total), `PlaybackController` qualifier (6 file + regresi 3-lapis `EngineManager.cpp`), decoder module (5 file), resampler adapter pattern, visualizer pImpl destructor, file kosong total (`NativeDeviceModule.h`, `LatencyProfiler.h`), `dsp/OutputStage.cpp` instance-API wrapper, `modes/*` desain standalone.

Detail lengkap tiap item ada di `build-fix-changelog.md`.

---

## 🕳️ Silent wiring gaps (bukan compile error — tidak kena `clangd`)

Masih berlaku, belum ditindaklanjuti (bukan prioritas, dicatat untuk tahap integrasi nanti):
- `initPlaybackModule(pristine::playback::PlaybackController*)` di `jni/NativePlaybackModule.cpp` — `gPlaybackController` global tidak pernah di-set dari inisialisasi engine manapun.
- `createResampler(ResamplerType)` di `resampler/AudioResampler.cpp` — tidak dideklarasikan di header manapun, tidak dipanggil dari manapun.

---

## Catatan proses — pola yang perlu diwaspadai ke depan

Ringkasan pola berulang selama seluruh proses perbaikan build (detail lengkap tiap kejadian ada di changelog):

1. **File kosong total (0 byte)** — `jni/NativeDeviceModule.h`, `profiling/LatencyProfiler.h`. Selalu `ls -la`/`wc -l` file yang dicurigai.
2. **File isi salah/tertukar** — `modes/BitPerfectPipeline.h`/`.cpp` (isi tertukar total), `dsp/BiquadFilter.h` (isi salah, copy dari class lain).
3. **Qualifier namespace hilang** — pola paling sering. Cek definisi existing dulu via grep sebelum menyimpulkan "belum diimplementasikan".
4. **"Undeclared identifier" bisa berarti include hilang total** — bukan cuma qualifier.
5. **Dua hierarchy class yang tidak nyambung** — solusi: adapter/instance-API, jangan ubah desain asli.
6. **Base class pure virtual tidak cocok dengan override di subclass** — cek pure virtual publik, bukan cuma pola `onXxx()` protected.
7. **Constructor mismatch bisa berarti masalah desain**, bukan cuma parameter yang salah.
8. **File yang "sudah bersih" bisa regresi diam-diam** — selalu scan ulang setelah perubahan struktural di file yang di-include.
9. **Silent wiring gaps** — fungsi lengkap tapi tidak dipanggil dari mana pun, tidak ketahuan lewat `clangd`.
10. **Klaim status lama bisa stale/salah** — verifikasi ulang dari nol (grep, baca file langsung) sebelum percaya catatan sesi sebelumnya, terutama untuk klaim "X belum diimplementasikan" atau "Y file kena masalah Z".
11. **Namespace collision saat migrasi** — sebelum menggabungkan dua namespace, grep semua nama type di kedua sisi dan cross-check; struct dengan nama sama tapi field berbeda (seperti `AudioDeviceInfo`) butuh rename, bukan sekadar namespace merge.
12. **Bug di luar `clangd`** — `CMakeLists.txt`/build-config issues (seperti FFmpeg exclude) tidak akan pernah terdeteksi oleh `scripts/check.sh`; perlu baca log CI/build asli untuk kategori masalah ini.

## 🕳️ Silent wiring gaps (bukan compile error — tidak kena `clangd`)

Ditemukan fungsi yang sudah diimplementasikan lengkap tapi **tidak pernah dipanggil dari manapun** di seluruh project. Bukan bug yang perlu diperbaiki sekarang, tapi perlu diingat saat masuk tahap integrasi end-to-end:

- `initPlaybackModule(pristine::playback::PlaybackController*)` di `jni/NativePlaybackModule.cpp` — `gPlaybackController` global tidak pernah di-set dari inisialisasi engine manapun.
- `createResampler(ResamplerType)` di `resampler/AudioResampler.cpp` — tidak dideklarasikan di header manapun, tidak dipanggil dari manapun. Decoder pipeline saat ini menggunakan `dsp::LinearResampler` langsung via `StreamResampler`, bukan lewat factory ini.

---

## ✅ Migrasi namespace `audio::`→`pristine::` — SELESAI (22 Agustus 2026)

Migrasi dilakukan setelah semua Fase 2/3 tuntas, sesuai urutan yang direncanakan. Detail lengkap eksekusi (termasuk collision `AudioDeviceInfo`) ada di `build-fix-changelog.md`.

---

## Catatan proses — pola yang perlu diwaspadai ke depan

Ringkasan pola berulang selama Fase 2 (detail lengkap tiap kejadian ada di changelog). Cek pola ini dulu sebelum investigasi error dari nol:

1. **File kosong total (0 byte)** — beberapa header ternyata kosong sama sekali padahal di-`#include` dan dipakai. Selalu `ls -la`/`wc -l` file yang dicurigai sebelum menyimpulkan "belum diimplementasikan". Ditemukan di: `jni/NativeDeviceModule.h`, `profiling/LatencyProfiler.h`.
2. **File isi salah/tertukar** — isi `.h` dan `.cpp` bisa benar-benar tertukar berdasarkan nama file (bukan sekadar typo path). Ditemukan di: `modes/BitPerfectPipeline.h`/`.cpp`. Juga ada kasus header salah isi total (copy dari class lain): `dsp/BiquadFilter.h`.
3. **Qualifier namespace hilang** — error "no_member"/"unknown_type" sering berarti struct/method **sudah ada** tapi di namespace lain, butuh qualifier — bukan belum diimplementasikan. Cek definisi existing dulu via grep sebelum menulis ulang apa pun. Pola paling sering terjadi antara `pristine::` (level luar) dan submodule (`pristine::decoder`, `pristine::playback`, `pristine::dsp`, `audio::dsp`).
4. **"Undeclared identifier" bisa berarti include hilang total** — bukan cuma qualifier. Kalau nambah qualifier saja masih gagal dengan "use of undeclared identifier 'namespace_name'", cek dulu apakah header sumbernya di-`#include` sama sekali.
5. **Dua hierarchy class yang tidak nyambung** — kadang ada dua desain berbeda untuk tujuan mirip (mis. class stateless/static vs stateful yang diharapkan caller; class polymorphic interface vs class standalone). Solusi: tambah adapter/instance-API, jangan ubah desain asli yang sudah dipakai di tempat lain.
6. **Base class pure virtual tidak cocok dengan override di subclass** — kalau subclass "abstract, tidak bisa di-`new`", cek pure virtual **publik** di base (bukan cuma pola `onXxx()` yang protected).
7. **Constructor mismatch bisa berarti masalah desain, bukan cuma parameter** — sebelum menambah parameter constructor untuk "memperbaiki" mismatch, cek dulu apakah desain class yang dituju memang dimaksudkan menerima dependency itu, atau itu cuma asumsi lama di call site yang sudah usang.
8. **File yang "sudah bersih" bisa regresi diam-diam** — jangan asumsikan status lama masih berlaku setelah ada perubahan struktural di file yang di-include-nya. Selalu scan ulang.
9. **Silent wiring gaps** — fungsi lengkap tapi tidak dipanggil dari mana pun, tidak akan ketahuan lewat `clangd`. Baru ketahuan lewat `grep -rln "namaFungsi"` yang hasilnya cuma 1 (definisinya sendiri).

