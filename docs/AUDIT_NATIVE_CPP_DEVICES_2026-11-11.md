# Audit Native C++ — Section devices (2026-11-11)

Section `devices/`: 5 file, 600 baris (`AudioDeviceManager.cpp` 413,
`AudioDeviceManager.h` 96, `AudioDeviceDescriptor.h` 42, `DeviceTypes.h`
36, `DeviceCapabilities.h` 13). Audit baca-semua-file + grep pemakai +
jejak logcat #12 + konstanta resmi Android (developer.android.com).
Tidak ada harness standalone: temuan section ini berupa wiring/race/
tabel — semuanya terbukti dari kode + log device + tabel resmi.

## Ringkasan

**0 BLOCKER, 4 MAJOR (1 HIDUP, 3 laten), 9 minor, 2 dugaan.**

Section ini HIDUP dan jalurnya sudah tersambung end-to-end sejak fix
2026-10-07: pilih device di UI → `setActiveDevice()` (validasi, tolak
id tak dikenal) → `EngineManager::setRequestedDeviceId()` (validasi
lagi) → reopen → `Oboe AudioStreamBuilder.setDeviceId()` → verifikasi
`getDeviceId()` setelah open. Logcat #12 membuktikan unplug/replug
reopen bekerja di device (407 → speaker, posisi terjaga — kecuali
DV-M1).

## MAJOR

### DV-M1 — Double-reopen race: unplug → posisi hilang ke 0.0s (HIDUP, TERBUKTI logcat #12 + kode)
Satu event unplug memicu DUA reopen yang tidak saling mengenal:
- Jalur A — `onDeviceRemoved` (thread JNI/AudioDeviceCallback):
  memanggil `reopenStreamPreservingPlayback()` langsung + sinkron.
- Jalur B — callback error Oboe → `requestStreamRecovery()`: worker
  tidur 150 ms lalu memanggil `reopenStreamPreservingPlayback()` yang
  sama. Guard `mRecoveryPending`/`mRecoveryRunning` hanya mendedup
  panggilan `requestStreamRecovery` — TIDAK mencakup jalur A.

Mekanisme kehilangan posisi (jejak kode, bukan tebakan):
1. `reopenStreamPreservingPlayback()` membaca posisi dari
   `PlaybackState` (`state_->getPosition().positionMs`), BUKAN dari
   clock.
2. `loadTrack()` me-reset KEDUANYA: `clock_->reset()` +
   `state_->setPosition(0)` (PlaybackController.cpp:287).
3. `seek()` hanya menggeser CLOCK (`clock_->seekToSeconds(...)`) —
   state TIDAK ikut di-update.
4. State baru disegarkan dari clock HANYA di `render()` tiap callback
   (PlaybackController.cpp:873, `clock_->snapshotPositionAndDuration()`
   → `state_->setPosition(msPos)`).
5. Jadi antara seek reopen #1 dan callback render berikutnya, state
   masih 0. Reopen #2 yang mendarat di jendela itu menyimpan 0.0s →
   `savedSeconds > 0.5` gagal → tidak ada seek → track mulai dari awal.

Logcat #12 (12:30:39–40): reopen #1 simpan 138.9s (seek OK 138.922s),
reopen #2 simpan **0.0s** (tanpa seek). Replug 12:30:47 simpan 6.7s
(benar — sudah ada render tick di antaranya).
Fix: (b, MUDAH — dikerjakan 2026-11-11, lihat bawah) `seek()` ikut
`state_->setPosition()` secara sinkron sesudah clock digeser; (c,
struktural — DITAMPUNG) dedup dua jalur reopen (onDeviceRemoved
melebur ke recovery yang tertunda, atau worker jadi satu-satunya
jalur). Guard `mReopening` hanya mencegah reentransi dari
`onTrackLoaded`, bukan reopen konkuren.

### DV-M2 — Data race: `refreshDevices()` baca `mDevices` di luar lock (laten)
Setelah assignment di bawah lock, loop log membaca `mDevices.size()`
+ iterasi TANPA lock — begitu juga `return mDevices.size()` di akhir.
Dua `refreshDevices()` bersamaan (thread JS via `nativeGetDevices` +
thread AudioDeviceCallback via `notifyDeviceAdded/Removed`) → satu
thread move-assign `mDevices` sementara yang lain membacanya → UB.
Fix (MUDAH): salin vector di bawah lock, log salinannya.

### DV-M3 — `nativeOnDeviceAdded` mengoper descriptor KOSONG (laten)
JNI menerima `deviceId` asli tapi membangun
`AudioDeviceDescriptor` default (id "", type BUILTIN_SPEAKER,
48000) dan mengopernya ke `notifyDeviceAdded`. Manager me-refresh
daftar (benar), tapi log + payload callback `mOnPlugged` berisi
sampah. Saat ini tidak berdampak karena `onDevicePlugged` punya
0 caller — tapi ini ranjau + log menyesatkan. Bandingkan
`nativeOnDeviceRemoved` yang meneruskan id asli. Fix (MUDAH):
refresh + cari device berdasarkan id di daftar, oper descriptor
aslinya.

### DV-M4 — `mapDeviceType()` salah + tidak lengkap (laten)
- `case 9 → HDMI` SALAH: `TYPE_HDMI_EARC = 29` (terverifikasi di
  developer.android.com); type 9 tidak ada di tabel Android (case
  mati). HDMI eARC asli (29) jatuh ke UNKNOWN → `supportsExclusive`
  = false untuk device yang sebenarnya bisa exclusive.
- Hilang: 18 TELEPHONY (enum-nya ada, tidak pernah dikembalikan),
  24 BUILTIN_SPEAKER_SAFE (speaker → UNKNOWN), 26/27 BLE_HEADSET/
  BLE_SPEAKER (→ UNKNOWN, seharusnya BLUETOOTH).
- 19 AUX_LINE, 20 IP, 21 BUS, 23 HEARING_AID, 25 REMOTE_SUBMIX juga
  tidak dipetakan (wajar tetap UNKNOWN — bukan output musik).
Fix (MUDAH): betulkan tabel (9 dibuang, 29 → HDMI, 24 →
BUILTIN_SPEAKER, 26/27 → BLUETOOTH, 18 → TELEPHONY).

## Minor (dv-m1…dv-m9)

- **dv-m1:** Komentar ⚠️ di `AudioDeviceManager.h` BASI — mengklaim
  `setDeviceId()` belum dipakai dan `activeDeviceIdNumeric()` 0
  caller. Keduanya SALAH sejak fix 2026-10-07
  (`AudioStreamController.cpp:269` memanggil `setDeviceId`;
  `EngineManager.cpp:279` memanggil `activeDeviceIdNumeric`;
  JNI meneruskan ke `setRequestedDeviceId`). Komentar ini aktif
  menyesatkan pembaca berikutnya. Fix: tulis ulang komentarnya.
- **dv-m2:** `getDeviceCapabilities()` 0 caller + mengarang
  `supportedChannelCounts = {1,2}` dan float/16bit selalu true —
  tidak pernah membaca `AudioDeviceInfo.getChannelCounts()`. API
  mati; hapus atau biarkan.
- **dv-m3:** `getActiveDevice()` 0 caller C++; kalau tidak ada
  preferensi mengembalikan descriptor default BUILTIN_SPEAKER/
  48000 — pemanggil bisa mengira itu speaker sungguhan.
- **dv-m4:** `onDevicePlugged`/`onDeviceUnplugged` 0 caller —
  mekanisme callback mati; EngineManager memakai jalur JNI langsung.
  Hapus atau sambungkan.
- **dv-m5:** `PushLocalFrame(64)` tidak dicek return value-nya
  (di `refreshDevices()` dan `DeviceRateDetector::refresh()`).
- **dv-m6:** Ternary redundan `getRates ? ... : nullptr` di dalam
  `if (getRates)`.
- **dv-m7:** `DeviceRateDetector` (core/) menduplikasi enumerasi JNI
  secara paralel — dua sumber kebenaran untuk "laju apa yang
  didukung". Daftarnya (`gRates`) adalah GABUNGAN semua device,
  jadi `pickBestRate()`/`isBitPerfectFor()` standalone menjawab
  "apakah ADA device yang mendukung laju ini", bukan perangkat
  aktif. `EngineManager::start()` sudah menghindarinya via
  `supportedRatesFor()` (per-device) dengan detector sebagai
  cadangan. Cross-ref M8 (locked reads — `supportedRates()`
  mengembalikan referensi tanpa lock; sudah tercatat di audit
  manager+core).
- **dv-m8:** `notifyDeviceAdded` TIDAK memberitahu EngineManager —
  DAC yang baru dicolok tidak memicu evaluasi ulang laju (bagian
  dari M8 "tidak refresh saat hot-plug"; cross-ref).
- **dv-m9:** Duplikasi ~90 baris (`ScopedEnv` + `describeAndClear`/
  `describeException` + `jstr`) antara `AudioDeviceManager.cpp`
  dan `DeviceRateDetector.cpp` — dua copy yang bisa drift.

## Yang SEHAT di section ini

- Wiring pemilihan device HIDUP end-to-end (fix 2026-10-07):
  TS `useAudioOutput` → spec → Kotlin → JNI
  `nativeSetActiveDevice` → `setActiveDevice()` + `setRequestedDeviceId()`
  → reopen → `builder.setDeviceId()` → verifikasi `getDeviceId()`.
- `setActiveDevice()` menolak id tak dikenal (false, bukan
  true-but-blind), melepas preferensi kalau id kosong, dan
  `notifyDeviceRemoved()` melepas preferensi kalau device aktif
  dicabut.
- `refreshDevices()` membaca laju NYATA per device (sort + dedup,
  cap 8000–768000), `preferredSampleRate` = tertinggi (bukan
  konstanta), `supportsExclusive` hanya USB/HDMI — jujur soal
  speaker/headphone built-in yang selalu lewat mixer.
- `getSampleRates()` dipanggil via `CallObjectMethod` (komentar
  mendokumentasikan bug lama `CallIntMethod` — sudah diperbaiki).
- `EngineManager::start()` mengutamakan laju per-device
  (`supportedRatesFor`) dengan detector sebagai cadangan; `setRequestedDeviceId()`
  memvalidasi id terhadap daftar.
- `requestStreamRecovery()` mendedup permintaan + batas 5 percobaan
  + cek ulang pending sesudah loop — desainnya bagus; celahnya hanya
  jalur `onDeviceRemoved` yang mem-bypass-nya (DV-M1).

## Dugaan (DV-g1…DV-g2)

- **DV-g1:** Lonjakan DIAG 102→126 dtk di logcat #12 adalah artefak
  sampler, bukan seek (tidak ada `seek()` di log controller).
- **DV-g2:** Seberapa sering dua `refreshDevices()` benar-benar
  bertabrakan di praktik belum terukur — race-nya nyata di kode,
  frekuensi pemicunya tidak diketahui.

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul — fix ini TIDAK masuk build 42962732238; ikut build berikutnya bersama fix fft)

- **DV-M2** — commit `d90e914b`: `refreshDevices()` salin `mDevices` di
  bawah lock, log + return memakai salinan.
- **DV-M3** — commit `eb2369c0`: `nativeOnDeviceAdded` refresh + cari
  device berdasarkan id, oper descriptor asli ke `notifyDeviceAdded`.
- **DV-M4** — commit `5ed3e73c`: betulkan `mapDeviceType` (29 → HDMI,
  24 → BUILTIN_SPEAKER, 26/27 → BLUETOOTH, 18 → TELEPHONY; case 9
  dibuang) + komentar tabelnya.
- **dv-m1** — commit `86255a9d`: tulis ulang blok ⚠️ di
  `AudioDeviceManager.h` sesuai keadaan sekarang (wiring hidup
  sejak 2026-10-07; sisa gap: jalur fallback OpenSLES mengabaikan
  deviceId, Oboe boleh mengabaikan preferensi).
- **DV-M1 (b)** — commit `1617dc68`: `PlaybackController::seek()` ikut
  `state_->setPosition()` secara sinkron sesudah clock digeser —
  reopen kedua tidak lagi membaca 0. (Satu baris, di sebelah
  `clock_->seekToSeconds`; store atomik, aman terhadap write
  `render()`.)

### DITAMPUNG buat sesi berikut

- DV-M1 (c): dedup dua jalur reopen (onDeviceRemoved vs recovery
  worker) — keputusan desain.
- dv-m2…dv-m9: minor di atas, belum dipilih.
- M8 (DeviceRateDetector: refresh dedup/hot-plug/locked reads) —
  sudah tercatat di audit manager+core, tetap terbuka.
