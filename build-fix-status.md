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
