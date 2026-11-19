# Spike: USB Direct — backend output kedua (UAC2 via usbdevfs)

**Status: SPIKE — bukan kode produksi. 2026-11-16, HEAD cdafb831.**
**INTEGRASI SELESAI 2026-11-19 (commit Butir 3, HEAD lihat log):**
file-file spike ini tetap sumber tunggal (TIDAK di-copy) dan kini
ter-compile ke app lewat `android/app/src/main/cpp/CMakeLists.txt`
(`usb_direct.cpp` + `usb_direct_stream.cpp` eksplisit + spike dir di
include path); wiring-nya di `cpp/usb/UsbDirectOutput.{h,cpp}`,
`cpp/jni/NativeUsbDirect.cpp`, `manager/EngineManager.{h,cpp}`,
`core/AudioCallback.{h,cpp}` (renderFrames) + `core/AudioEngine.{h,cpp}`,
Kotlin `com.pristineaudio.usb.UsbDirectManager` + 2 method di
`NativeDSPModule.kt` + spec `src/specs/NativeDSPModule.ts`. R6
DIPUTUSKAN: backend kedua paralel Oboe. R7 SELESAI: sumber PCM = render
engine (decoder), sine hanya di harness. Yang masih spike: DAC belum
dibeli (bukti device menunggu), R2 (servo feedback) dan R4 masih
berlaku, `usb_direct_jni.cpp` + `android/UsbDirectManager.kt` di sini
hanya referensi (versi produksi ada di `cpp/jni/` + `java/com/
pristineaudio/usb/`).

Tujuan: buktikan apakah PristineAudio bisa bicara LANGSUNG ke DAC USB
UAC2 lewat Linux `usbdevfs` isochronous transfer — bypass total
AudioFlinger / AAudio / ALSA / kernel mixer — teknik yang dipakai UAPP
dan dibuktikan proyek `decent-player` v0.1.0 (2026-05-10, MIT) di Cayin
RU7 @ 24-bit/192 kHz, bit-perfect, `snd-usb-audio` ter-detach.

Keputusan csheva 2026-11-16: **"silahkan bangun, dac menyusul
(kemungkinan tipe CX31993)"** — DAC belum dibeli. Jadi spike ini berisi
kode + verifikasi host-side + pernyataan jujur tentang apa yang bisa dan
tidak bisa dibuktikan tanpa DAC.

## Desain

```
Kotlin (referensi, belum terwiring)
  UsbDirectManager.kt ── UsbManager.getDeviceList() → filter audio
                      ── requestPermission() → BroadcastReceiver
                      ── openDevice() → fd ──────────────┐
                                                          ▼
Native (usb_direct_jni.cpp, CI-only)                      │
  nativeOpen(fd, rate, ch, subslot, bitres)               │
  nativeStart(freqHz) / nativeStop() / nativeClose()      │
  nativeGetStats() → JSON                                 │
                                                          ▼
Core (usb_direct.cpp — MURNI, tanpa syscall)              │
  parseConfigDescriptor() ── cari AS interface + alt +    │
    endpoint iso OUT + FORMAT_TYPE_I + CLOCK_SOURCE       │
  SineSource ── nada test (pengganti decoder)             │
  IsoFrameAccumulator ── 44.1 kHz → paket 5/6 frame       │
                                                          ▼
Streaming (usb_direct_stream.cpp)                         │
  UsbDirectDevice::open() ── baca deskriptor (control)    │
    → parse → GET_RANGE clock → cek laju → claim iface    │
    → SET_INTERFACE → SET_CUR clock                       │
  IsoStreamer ── ring 4 URB × 8 paket, worker reap →      │
    refill → resubmit; stats (error/short/underrun)       │
                                                          ▼
Backend (UsbDeviceIo)                                     │
  UsbdevfsIo ── ioctl nyata pada fd (claim, control, URB) │
  MockUsbIo ── canned, untuk harness host                 │
```

**Yang sengaja TIDAK ada di spike:**
- Servo feedback endpoint async (kirim di laju nominal; drift jangka
  panjang belum ditangani — lihat Risiko).
- Integrasi decoder FFmpeg (sumber PCM masih sine 1 kHz) — SELESAI di
  produksi 2026-11-19 (R7): render engine, bukan sine.
- Integrasi ke engine Oboe / mode bit-perfect / UI. Jalur playback
  utama TIDAK DISENTUH — folder `spike/` di luar glob CMakeLists app.
  — SELESAI 2026-11-19 (R6): backend kedua paralel, file spike tetap
  sumber tunggal dan ikut ter-compile ke app (lihat Status di atas).

## File

| File | Isi |
|---|---|
| `usbdevfs.h` | Pembungkus `<linux/usbdevice_fs.h>` + fallback (nilai terverifikasi vs header host) |
| `usb_direct.h/.cpp` | Parser deskriptor UAC2 + sine + packet sizing (murni) |
| `usb_direct_stream.h/.cpp` | Setup perangkat + ring URB + backend nyata/mock |
| `test_usb_direct.cpp` | Harness host (71 cek — 68 lama + 3 gate UAC2, 2026-11-19) |
| `usb_direct_jni.cpp` | Jembatan JNI (CI-only, syntax-check stub) |
| `android/UsbDirectManager.kt` | Discovery + permission + fd (referensi) |
| `android/device_filter.xml` | Template (VID:PID diisi setelah DAC dibeli) |
| `CMakeLists.txt` | Build standalone (core + harness; JNI opsional) |

## Cara build & test (host — terverifikasi)

Dari root repo:

```sh
# Harness langsung (g++)
g++ -std=c++17 -O2 -Wall -Wextra -I spike/usb-direct \
  spike/usb-direct/test_usb_direct.cpp \
  spike/usb-direct/usb_direct.cpp \
  spike/usb-direct/usb_direct_stream.cpp \
  -o /tmp/test_usb_direct && /tmp/test_usb_direct

# Dengan sanitizer
g++ -std=c++17 -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all \
  -Wall -Wextra -I spike/usb-direct \
  spike/usb-direct/test_usb_direct.cpp \
  spike/usb-direct/usb_direct.cpp \
  spike/usb-direct/usb_direct_stream.cpp \
  -o /tmp/test_usb_direct_asan && /tmp/test_usb_direct_asan

# Atau via CMake standalone
cmake -S spike/usb-direct -B /tmp/usb-direct-build
cmake --build /tmp/usb-direct-build
/tmp/usb-direct-build/test_usb_direct
```

**Hasil 2026-11-16: 68 PASS, 0 FAIL (O2 dan ASan+UBSan).**

## Apa yang TERBUKTI di host (tanpa DAC)

1. **Parser deskriptor UAC2** — blob sintetis mirip CX31993 (AC iface +
   clock source 0x10 + AS alt 0/1, endpoint iso OUT async, FORMAT_TYPE_I
   4/32): interface, alt, endpoint, maxPacketSize, interval, sync type,
   clock id, format — semua benar. Preferensi async atas sync terbukti
   (alt 2 dipilih bila alt 1 sync). Blob rusak/terpotong/tipe salah
   ditolak tanpa crash (fuzz ringan via kasus tepi di harness).
2. **Laju TIDAK ada di deskriptor UAC2** — didapat dari clock source
   lewat GET_RANGE (triplet 12-byte) + SET_CUR. Harness membuktikan
   alur lengkap: query range → cek 44100/96000 didukung, 12345/192001
   ditolak → SET_CUR tercatat dengan laju + clock id yang benar.
3. **Packet sizing + akumulator fraksional** — 48k @125µs = 6 frame,
   384k = 48 frame, 44.1k = 5.5125 → akumulator menghasilkan hanya
   paket 5/6 frame dan total tepat 44100 frame per 8000 paket (tanpa
   drift). `packetFits` menolak endpoint yang terlalu kecil.
4. **Sine source** — 16-bit mencapai ±32767, 24-in-32 left-justified
   (byte bawah 0), fase kontinu antar fill, puncak sesuai amplitudo.
5. **Alur setup lengkap (mock)** — read config → parse → GET_RANGE →
   claim → SET_INTERFACE alt 1 → SET_CUR 96000: semua panggilan
   tercatat dengan argumen benar. Laju tak didukung ditolak dengan
   pesan yang menyebut lajunya.
6. **Streaming ring (mock)** — 4 URB × 8 paket, 96 kHz stereo 32-bit:
   14968 paket selesai, 0 URB error, 0 underrun, byte = paket × 96,
   frame konsisten (± in-flight saat stop). Underrun (source mati)
   tercatat dan paket silence tetap terkirim.
7. **Angka ioctl usbdevfs terverifikasi** dari `/usr/include/linux/
   usbdevice_fs.h` host (bukan dari ingatan): ISO_ASAP = 0x02,
   SUBMITURB = _IOR('U',10), CLAIMINTERFACE = 15, RELEASEINTERFACE =
   16, GET_SPEED = _IO('U',31), DISCONNECT_CLAIM = 27.
   GETDESCRIPTOR ioctl TIDAK ADA di kernel modern — deskriptor dibaca
   lewat control transfer (sudah diimplementasi + dites).

**Bug yang ketemu & diperbaiki selama spike (bukti harness bekerja):**
- Parser baca `bNrChannels` AS_GENERAL di offset 7 (layout UAC1) —
  yang benar offset 10 (UAC2). Ketemu saat rekonsiliasi riset; harness
  blob diperbaiki ke layout UAC2 yang benar dan parser ikut diperbaiki.
- Mock `discardUrb` menghapus URB dari antrean → worker tidak pernah
  melihatnya → `inFlight_` tidak pernah 0 → `join()` menggantung
  (harness hang 30 dtk). Perilaku kernel yang benar: URB yang
  di-discard TETAP kembali lewat reap (status -ECONNRESET). Mock
  diperbaiki; worker tidak menghitung discard saat stop sebagai error.
- `UsbDirectDevice::stats()` hilang sesudah `stopStreaming()` (streamer
  di-reset). Sekarang statistik terakhir disimpan (`lastStats_`).

## Apa yang BELUM terbukti (butuh DAC CX31993 + HP)

1. **ioctl usbdevfs nyata di Android** — `UsbdevfsIo` belum pernah
   jalan di perangkat. Khususnya:
   - `USBDEVFS_DISCONNECT_CLAIM` melepas `snd-usb-audio` di POCO M6 /
     HyperOS tanpa root (decent-player membuktikan di Galaxy S26 Ultra
     + Cayin RU7; OEM lain belum tentu sama).
   - `claimInterface(force=true)` di Kotlin vs DISCONNECT_CLAIM native
     — urutan yang dipakai spike adalah native saja.
   - Apakah fd dari `UsbDeviceConnection.getFileDescriptor()` menerima
     semua ioctl usbdevfs di HP ini.
2. **Deskriptor CX31993 yang sebenarnya** — parser ditulis dari spec
   UAC2 + blob sintetis. Deskriptor asli (jumlah alt setting, bInterval,
   maxPacketSize, clock source id, apakah ada clock selector) baru
   diketahui setelah DAC dicolok (`adb shell dumpsys usb` /
   `connection.rawDescriptors`).
3. **Bunyi di DAC** — sine 1 kHz harus terdengar; verifikasi bit-perfect
   butuh prosedur decent-player (`docs/driver/07-verification-and-
   diagnostics.md` di repo mereka): cocokkan laju DAC vs laju sumber,
   cek tidak ada card di `/proc/asound/`.
4. **Feedback endpoint async** — DAC async melaporkan clock aslinya
   lewat feedback endpoint (UAC2: 4-byte 16.16). Spike kirim di laju
   nominal; drift kristal (± puluhan ppm) akan menumpuk jadi under/
   overrun pada sesi panjang. Servo feedback adalah follow-up wajib
   sebelum klaim "bit-perfect stabil".
5. **Kompilasi JNI + Kotlin** — hanya CI (tidak ada NDK/kotlinc di VM).
   `usb_direct_jni.cpp` lolos syntax-check dengan stub jni.h minimal;
   kompilasi nyata belum terjadi.
6. **VID:PID CX31993** — belum diketahui (DAC belum dibeli). JANGAN
   menebak; isi `device_filter.xml` dari `lsusb` setelah DAC datang.
   Discovery dinamis tidak butuh VID:PID.
7. **Perilaku 32-bit ABI** — struct usbdevfs mengandung pointer;
   kernel menangani lewat compat ioctl. App utama arm64-v8a; uji
   armeabi-v7a terpisah bila perlu.

## Risiko & keputusan terbuka

| # | Risiko / keputusan | Status |
|---|---|---|
| R1 | `snd-usb-audio` tidak bisa dilepas di HyperOS (OEM memblokir DISCONNECT_CLAIM) | Uji di device; fallback: `claimInterface(force=true)` Kotlin |
| R2 | Drift clock tanpa servo feedback (async) | Follow-up: baca feedback endpoint, sesuaikan laju kirim |
| R3 | CX31993 ternyata UAC1 / quasi-UAC2 (bukan UAC2 penuh) | Cek deskriptor dulu (`bcdADC`); bila UAC1, spike ini tidak berlaku |
| R4 | Worker pakai REAPURBNDELAY + tidur 1 ms (polling), bukan REAPURB blocking | Sengaja di spike (hindari race stop). Produksi: blocking + DISCARDURB wakeup |
| R5 | NDK tidak punya `<linux/usbdevice_fs.h>` | Fallback di `usbdevfs.h` sudah siap (nilai terverifikasi); konfirmasi saat CI pertama |
| R6 | Integrasi ke engine: backend kedua paralel Oboe vs ganti output | DIPUTUSKAN 2026-11-19: backend kedua paralel (lihat Status di atas) |
| R7 | Sumber PCM: sine → decoder FFmpeg | SELESAI 2026-11-19: render engine (decoder) via AudioCallback::renderFrames |
| R8 | Latensi/buffer: 4 URB × 8 paket × 125µs = 4 ms in flight | Cukup untuk spike; tuning (2–8 URB) setelah uji device |

## Langkah berikut (konkret, berurutan)

1. **Beli DAC CX31993** (csheva) → catat VID:PID (`lsusb` di Termux).
2. **Dump deskriptor asli** — colok DAC, `adb shell dumpsys usb` +
   `connection.rawDescriptors`; bandingkan dengan blob sintetis
   harness; perbaiki parser bila ada perbedaan (alt setting, interval,
   clock selector).
3. **Build CI** — trigger build dev dengan spike ikut ter-compile
   sebagai target terpisah (tambah `add_subdirectory` ber-flag di
   CMakeLists app — BELUM dilakukan di spike ini); pastikan build app
   default tidak berubah + JNI/Kotlin kompil. — SELESAI sebagian
   2026-11-19: file spike ikut ter-compile ke app (bukan target
   terpisah); kompilasi NDK + Kotlin menunggu CI (tidak ada di VM).
4. **Tes device 1 (konektivitas)** — app spike: discovery → permission
   → open 48k → log `claim ok / SET_CUR ok`; cek `/proc/asound`
   (tidak ada card baru = driver kernel ter-detach).
5. **Tes device 2 (bunyi)** — sine 1 kHz → dengar; naikkan ke 96k /
   192k / 384k; cek tidak ada klik/dropout 60 detik.
6. **Tes device 3 (bit-perfect)** — putar file test (chirp/sine yang
   diketahui) via decoder → rekam output DAC (bila ada alat) atau
   minimal verifikasi prosedur decent-player (laju DAC = laju sumber).
7. **Follow-up** — servo feedback (R2), sumber decoder (R7 — selesai),
   desain integrasi backend kedua (R6 — selesai), lalu putuskan: lanjut
   ke produksi atau parkir. Bukti device tetap menunggu DAC UAC2 +
   build baru; toggle UI menyusul sesudah bukti device.

## Referensi

- decent-player v0.1.0 (2026-05-10, MIT) — pengumuman:
  https://www.head-fi.org/threads/open-source-bit-perfect-usb-audio-driver-for-android-%E2%80%94-v0-1-0-released.980278/
  (repo GitHub-nya belum terverifikasi URL-nya — cari lewat thread
  ini; JANGAN tebak owner/repo. Harness PoC-nya AGPL — JANGAN dipakai;
  library-nya MIT.)
- Kernel UAPI `linux/usbdevice_fs.h` (header host, terverifikasi) +
  `include/uapi/linux/usb/audio.h`, `audio-v2.h`, `sound/usb/format.c`
  (jalur GET_RANGE/SET_CUR kernel).
- USB Audio Class 2.0 ("Audio20 final.pdf") — deskriptor AC/AS,
  FORMAT_TYPE_I, CLOCK_SOURCE, endpoint iso.
- USB 2.0 §5.6.4/§9.6.6 — bInterval, wMaxPacketSize, bmAttributes.
- AOSP `UsbDeviceConnection.getFileDescriptor()` — "intended for
  passing to native code to access the device."
- Repo: `AGENTS.md` (USB dihapus 2026-10-07 — bangun ulang dari nol);
  `MEMORY.md` (penamaan "USB Direct", mode vs path).
