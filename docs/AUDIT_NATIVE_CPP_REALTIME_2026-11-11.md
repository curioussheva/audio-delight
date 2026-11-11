# Audit Native C++ — Section realtime (2026-11-11)

Section `realtime/`: 2 file, 31 baris (`ThreadPriority.h` 14,
`RealtimeThread.h` 17). Audit 4 track paralel read-only +
verifikasi ulang parent (header dibaca langsung, `git log --all`
untuk `RealtimeThread.cpp`, grep pemakai).

## Ringkasan

**0 BLOCKER, 5 MAJOR, 6 minor, 3 dugaan. Section ini kode mati 100%.**

## Liveness

`setRealtimePriority` (`ThreadPriority.h:4`), `setThreadAffinity`
(`:10`), `RealtimeThread` (`RealtimeThread.h:6-17`): **0 pemakai,
0 `#include` repo-wide**. `realtime/` berisi 0 file `.cpp`; glob
`realtime/*.cpp` (`CMakeLists.txt:82`) cocok nol file — section ini
menyumbang nol objek ke `libpristine-audio.so`.
`git log --all -- '*RealtimeThread.cpp'` kosong: `RealtimeThread.cpp`
**tidak pernah ada di git** (kelas lahir sebagai deklarasi tanpa
implementasi sejak commit awal `30252b45`). Commit `5a386f0a`
(2026-10-07, "hapus 20 kelas stub") menghapus
`realtime/CallbackTimer.{h,cpp}` tapi melewatkan kedua header ini.
Mekanisme prioritas yang benar-benar hidup:
`decoder/DecoderWorker.cpp:187` — `setpriority(PRIO_PROCESS, tid,
-16)` (ANDROID_PRIORITY_AUDIO) + log WARN saat gagal; thread
callback audio milik Oboe (prioritas internal Oboe). Klaim dokumen
salah: `docs/NATIVE_CPP_MAP.md:79` (§11) menulis "Prioritas thread
audio" — menyesatkan.

## MAJOR

- **RT-M1 — `RealtimeThread.h:6-17`: kelas stub tanpa definisi;
  pemakaian = link error (TERBUKTI harness).** Ctor, dtor, `start()`,
  `stop()`, `join()`, `threadEntry()` tanpa definisi di mana pun.
  Komentar `start()` (`:12`) janji "set thread priority to
  realtime" padahal tak ada kode yang melakukannya. Link test:
  `undefined reference` ke kelima simbol. Fix: hapus header; kalau
  dibutuhkan, tulis `RealtimeThread.cpp` lengkap + wiring + tes
  device.
- **RT-M2 — `ThreadPriority.h:4`: default SCHED_FIFO prioritas 90
  hampir pasti gagal di Android, dan gagalnya diam-diam (TERBUKTI
  harness).** `pthread_setschedparam(SCHED_FIFO, 90)` butuh
  `CAP_SYS_NICE` — harness: bahkan root tanpa `CAP_SYS_NICE`
  ditolak (`EPERM`, errno=1). Fungsi hanya kembalikan `bool` tanpa
  log/`errno` — pemanggil takkan tahu prioritas tak diterapkan. 90
  nyaris-maksimum: bila suatu hari berhasil, risiko starvation
  thread sistem. Kontras pola hidup `DecoderWorker.cpp:187-192`
  (nice `-16` + log WARN + `strerror(errno)`). Fix: bila dihidupkan
  — validasi + log `strerror(errno)`; pertimbangkan pola
  `setpriority` `-16` atau serahkan ke Oboe; jangan default 90 tanpa
  justifikasi.
- **RT-M3 — `ThreadPriority.h:4-8`: tanpa validasi policy/prioritas
  (TERBUKTI harness).** Rentang SCHED_FIFO 1–99; `priority` 0 dan
  100 → `EINVAL`, `policy` 9999 → `EINVAL`, semua hanya `false`
  tanpa jejak. Magic `90` tanpa nama — konstanta bernama untuk ini
  (`kRealtimeThreadPriority`) sudah dihapus 2026-11-10 sebagai
  0 pemakai (`AudioConstants.h:80`), jadi `90` adalah duplikat tanpa
  nama dari konstanta yang sudah dibuang. Fix: validasi
  `sched_get_priority_min/max(policy)` + tolak policy di luar
  SCHED_FIFO/SCHED_RR/SCHED_OTHER; beri nama konstantanya bila
  dipertahankan.
- **RT-M4 — `ThreadPriority.h:10-14`: tanpa validasi `coreId` di
  `setThreadAffinity`.** `CPU_SET(coreId, ...)` mentah. Harness:
  `coreId` -1 dan 9999 (mesin 4 CPU) → `false` tapi `errno` tetap 0
  ("Success") — pemanggil yang cek `errno` salah simpulkan. ASan
  glibc bersih (bounds-check), tapi itu milik implementasi, bukan
  kode ini (lihat RT-D1 untuk bionic). Fix: validasi
  `0 <= coreId < sysconf(_SC_NPROCESSORS_ONLN)` (dan `< CPU_SETSIZE`)
  sebelum `CPU_SET`.
- **RT-M5 — Section ini lolos dari purge stub 2026-10-07 (pola
  lintas-section).** Kriteria sama persis dengan `CallbackTimer`
  yang dihapus, tapi kedua header tertinggal + masih terdaftar
  `CMakeLists.txt:82,210` dan dipetakan `NATIVE_CPP_MAP.md:79`
  seolah fungsional. Fix: hapus kedua header + glob + entri include
  dir + koreksi peta §11 (atau implementasi penuh + wiring + tes —
  jangan biarkan setengah jalan).

## Minor (RT-m1…RT-m6)

- **RT-m1 — `ThreadPriority.h:2`:** hanya `#include <pthread.h>`
  padahal pakai `cpu_set_t`/`CPU_ZERO`/`CPU_SET` dari `<sched.h>` —
  bergantung include transitif. Tambah `#include <sched.h>` eksplisit.
- **RT-m2 — `RealtimeThread.h:14`:** member `mRunning`
  (`std::atomic<bool>`) tak pernah dipakai logika apa pun; dead member.
- **RT-m3 — `RealtimeThread.h:6`:** kelas tak copyable/movable
  (`std::atomic` hapus move) tanpa `=delete` eksplisit — bila
  dihidupkan dan disimpan di container, error kompilasi
  membingungkan. Nyatakan semantik eksplisit.
- **RT-m4 — `CMakeLists.txt:82,210`:** glob `realtime/*.cpp`
  (0 file) + include dir `realtime` menyesatkan pembaca build.
  Hapus bila header dihapus.
- **RT-m5 — `docs/NATIVE_CPP_MAP.md:79`:** klaim "Prioritas thread
  audio" tak benar — koreksi jadi "kode mati, 0 pemakai" atau hapus
  entri setelah penghapusan.
- **RT-m6 — `ThreadPriority.h:4,10`:** `pthread_*` kembalikan kode
  error langsung dan tak konsisten menyetel `errno` (harness: EPERM
  → errno=1, gagal afinitas → errno=0) — API `bool` murni membuang
  info ini. Bila dipertahankan, teruskan kode error atau log di dalam
  fungsi.

## Dugaan (RT-D1…RT-D3)

- **RT-D1 — OOB write `CPU_SET` di bionic:** ASan+glibc aman, tapi
  `CPU_SET` bionic (NDK) historis tak bounds-check seperti glibc.
  Perlu verifikasi header NDK / GH build. Apapun hasilnya, RT-M4
  adalah perbaikan yang benar.
- **RT-D2 — Apakah SCHED_FIFO memang tak mungkin untuk app Android?**
  Diduga seluruh pendekatan ini tak bisa dipakai proses app stock
  (butuh `CAP_SYS_NICE`/`RLIMIT_RTPRIO`) — mungkin menjelaskan
  kenapa fungsi ini tak pernah di-wiring. Perlu tes device bila
  dihidupkan; jalur nice `-16` (pola `DecoderWorker`) alternatif
  yang sudah terbukti bekerja.
- **RT-D3 — Semantik `RealtimeThread` yang dimaksudkan tak
  diketahui:** tak ada dok/tes/pemakai yang menjelaskan lifecycle
  (`stop()` = minta berhenti saja atau join? `start()` ganda aman?).
  Bila dihidupkan, spesifikasi dulu, jangan tebak dari nama.

## Yang SEHAT di section ini

- Tak ada UB/thread-safety issue yang hidup: tanpa global/shared
  mutable state; kedua fungsi wrapper murni atas `pthread_*` yang
  thread-safe. `setThreadAffinity` pakai `CPU_ZERO` sebelum
  `CPU_SET` dan `sizeof(cpu_set_t)` yang benar.
- `inline` di header benar (tak ada risiko ODR); `ThreadPriority.h`
  terkompilasi bersih standalone `g++ -std=c++20` (terbukti harness).
  `#pragma once` ada di kedua file.
- API kembalikan `bool`, bukan `void` — kegagalan *bisa* dideteksi
  pemanggil (kelemahannya hanya tanpa alasan kegagalan).
- Tanpa dependensi JNI/Oboe/FFmpeg — terisolasi.
- Tak ada komentar basi yang bertentangan dengan kode di dalam kedua
  file (kecuali janji `start()` di `RealtimeThread.h:12` — sudah
  RT-M1).

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul)

- **RT-M1/RT-M5** — commit `a74410f6`: hapus `RealtimeThread.h` +
  `ThreadPriority.h` + glob `realtime/*.cpp` + include dir
  `realtime` di CMakeLists + koreksi peta §11. (Minor RT-m1…RT-m6
  ikut hilang bersama file-nya.)

### DITAMPUNG buat sesi berikut

- Implementasi thread realtime dari nol (bila memang dibutuhkan):
  validasi rentang + logging `errno` + tes device (RT-D2/RT-D3).
  Jangan hidupkan kembali header lama apa adanya.
