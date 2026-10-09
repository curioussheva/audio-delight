# ADR: Satu Sumber Kebenaran untuk Tiga Mode Pemrosesan

**Status:** DITERIMA 2026-10-07 (keputusan arah; implementasi menyusul)
**Konteks:** `docs/ARCHITECTURE.md` ÃÂ§3, `docs/WORKFLOW.md` ÃÂ§2, `docs/archive/README.md` bagian B
**Menggantikan:** ADR implisit lama yang menempatkan tiga mode di `cpp/modes/*` Ã¢ÂÂ dibatalkan (lihat ÃÂ§5)

---

## 1. Masalah yang diputuskan

Aplikasi berjalan di tiga mode (`BitPerfect` / `DSP` / `Immersive`). Prinsip desain
ini tidak boleh berubah. Yang diputuskan dokumen ini: **di mana logika ketiga mode
hidup**, dan **bagaimana mode dipilih saat audio sedang berjalan**.

Ada dua kandidat yang sudah ada di kode:

| | Kandidat A Ã¢ÂÂ `core/AudioPipeline` | Kandidat B Ã¢ÂÂ `modes/*` (3 kelas) |
|---|---|---|
| Ada sejak | awal | awal |
| Isi sekarang | `processBitPerfect` (bypass), `processDSP` (`mDSP.process`), `processImmersive` (base DSP + TODO) | Stub lengkap dengan API `prepare/updateParameters/process/reset` |
| Dipanggil jalur produksi | **tidak** (lihat ÃÂ§2) | tidak |
| Pemilik `DSPChain` | ya (`mDSP`) | `DSPPipeline` punya `mDSPChain` sendiri |
| Punya kelas immersive | tidak | ya (`ImmersivePipeline`, 5 sub-prosesor) |

## 2. Fakta yang harus dihormati siapa pun yang memilih

Terverifikasi ke kode, bukan disimpulkan dari dokumentasi.

**F1. `AudioPipeline::process()` tidak pernah dijalankan di jalur produksi.**
`AudioCallback::onAudioReady()` memanggil `mPlaybackController->render()` lalu
`return`. `mPipeline.process()` hanya di cabang fallback `AudioBufferController`,
dan cabang itu tidak pernah tercapai karena `EngineManager::start()` **selalu**
memasang `setPlaybackController()`. Akibatnya: **mode DSP tidak melakukan apa pun
saat memutar lagu**, dan bit-perfect hanya benar secara kebetulan (tidak ada DSP
yang jalan untuk mode apa pun).

**F2. Mode saat ini hanya menggerakkan `exclusive mode`, bukan pemrosesan.**
`playerStore.setAudioMode()` Ã¢ÂÂ `audioEngine.toggleExclusiveMode(mode === "bit-perfect")`.
Pemrosesan PCM tidak terpengaruh sama sekali.

**F3. `modes/` adalah jalur push (offline), bukan jalur pull (produksi).**
API-nya `process(float* left, float* right, int32_t numFrames, const DSPParameters&)`
Ã¢ÂÂ menerima buffer dari pemanggil. Jalur produksi menarik data dari dekoder.
Dua model kepemilikan data yang berbeda; `modes/` tidak pernah disambungkan ke
`render()` karena memang tidak dirancang untuk itu.

**F4. Isi `modes/ImmersivePipeline::process()` sebenarnya sudah lengkap** Ã¢ÂÂ
`mSolfeggio.process()`, `mHarmonic.process()`, `mSpatial.process()`,
`mBrainwave.generate()`. Ini bukan stub kosong; ini rantai nyata yang memanggil
6 kelas di `dsp/immersive/` yang **masih ada dan dibangun**. Yang kosong hanya
`modes/BitPerfectPipeline` (sengaja) dan sebagian `modes/DSPPipeline`.

**F5. Live switch menuntut state dibaca per-callback.** Memindahkan mode berarti
"frame berikutnya diproses berbeda", bukan "ganti sumber data".

## 3. Konsekuensi untuk syarat produk

Tiga syarat yang harus dipenuhi apa pun pilihannya:

| Syarat | A | B |
|---|---|---|
| **Live switch** Ã¢ÂÂ mode berubah tanpa jeda/restart | mode dibaca dari `AudioState` atomic tiap callback. Ganti mode = ganti hasil frame berikutnya | `modes/*` menerima buffer dari pemanggil; untuk live switch di produksi berarti memanggil tiga kelas dari `render()`. Bisa, tapi tiap kelas harus hidup berdampingan di satu jalur Ã¢ÂÂ dan `modes/` tidak punya cara menyerahkan/menerima buffer hasil-proses |
| **Bit-perfect gagal tetap berbunyi** | `processBitPerfect` no-op Ã¢ÂÂ PCM lewat utuh; laju/device dilaporkan terpisah (`isRateHonored`, `isPathInherentlyLossy`) | sama, kalau `render()` memanggil `BitPerfectPipeline::process()` (yang juga no-op). Tidak ada perbedaan perilaku |
| **Tagihan perawatan** | satu kelas, satu `DSPChain` | dua pemilik `DSPChain` (`AudioPipeline::mDSP` + `modes/DSPPipeline::mDSPChain`) kalau keduanya dipakai. Dua jalur harus dijaga sinkron selamanya |

## 4. Keputusan

**Kandidat A Ã¢ÂÂ `core/AudioPipeline` menjadi satu-satunya pemilik logika tiga mode.**

Alasan, berurutan bobotnya:

1. **Live switch (syarat produk eksplisit) hanya murah di A.** Mode dibaca dari
   atomic per callback; tidak ada perpindahan kepemilikan buffer, tidak ada
   restart stream, tidak ada jeda. Di B, live switch berarti tiga kelas berbeda
   harus bergantian melayani satu jalur render Ã¢ÂÂ dan `modes/` tidak punya
   kontrak untuk itu.
2. **Menghindari dua `DSPChain`.** A sudah memiliki `mDSP`. Kalau B dipakai
   sebagai jalur, ada dua instans `DSPChain` (satu di `AudioPipeline`, satu di
   `modes/DSPPipeline`) yang harus dijaga identik. Itu sumber drift, bukan fitur.
3. **Isi B tetap terpakai.** `modes/ImmersivePipeline::process()` (F4) **di-port
   ke `AudioPipeline::processImmersive()`**. Yang diadopsi adalah perilakunya,
   bukan kelasnya. Kelas sumbernya tidak dikembalikan.

**Yang TIDAK diputuskan di sini:** kapan `AudioPipeline` mulai dijalankan di jalur
produksi, dan bagaimana flag-nya. Itu keputusan implementasi terpisah yang butuh
verifikasi di perangkat (lihat ÃÂ§6).

## 5. Pembatalan keputusan lama

Commit `5a386f0a9` menghapus `cpp/modes/` dengan alasan "0 referensi = kode mati".
Alasan itu **salah**, dan dokumen ini membatalkannya:

- `docs/archive/README.md` bagian B sudah menyatakan eksplisit: *"orphan TIDAK
  berarti harus dihapus"*, dan menyebut `modes/*` sebagai *"pilihan desain, bukan
  sekadar cleanup"*.
- Penghapusan dilakukan **sebelum** dokumentasi diperiksa. Urutan yang benar
  adalah periksa-dulu; ini pelanggaran proses, bukan sekadar salah kesimpulan.
- Yang **tidak** ikut terhapus dan tetap ada: `dsp/immersive/*` (6 file),
  `dsp/DSPChain`, `dsp/convolution/`, `dsp/headphone/`, `dsp/filters/`, `fft/`.
  Bagian "badan implementasi" utuh.
- `modes/` **tidak dikembalikan** (keputusan operator). Isi yang berharga
  diambil sebagai perilaku, bukan sebagai file.

## 6. Yang belum diverifikasi

**2026-10-09**: penyambungan ke jalur produksi **sudah dilakukan** —
`AudioCallback::onAudioReady()` tidak lagi `return` sebelum pipeline; sekarang
memanggil `applyPipeline()` di belakang `DSPProcessingGate` (default ON).
Rantai lengkap terverifikasi ke kode: `playerStore.setAudioMode` →
`engine.setProcessingMode` → `NativeDSPModule` → `EngineManager` →
`AudioState` (atomic) → `updateParameters()` tiap buffer →
`AudioPipeline.process()`.

Menyalakan `AudioPipeline` di jalur produksi **mengubah suara yang keluar** —
selama ini mode DSP tidak melakukan apa pun, jadi `DSPChain` belum pernah
benar-benar dieksekusi pada laju/latensi nyata. Wajib diuji di perangkat
(butuh APK dari CI; SDK/NDK tidak tersedia di Termux). Yang tersisa:
**verifikasi dengar**, bukan penyambungan kode.

---

**Catatan proses:** keputusan desain di dokumen ini dikonfirmasi operator
sebelum implementasi, sesuai permintaan: periksa dokumentasi Ã¢ÂÂ konfirmasi Ã¢ÂÂ baru kerjakan.
