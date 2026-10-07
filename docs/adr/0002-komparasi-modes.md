# Komparasi Teknis: Nasib `cpp/modes/*`

**Untuk diputuskan operator.** Ditulis setelah memeriksa kode dan dokumentasi,
bukan dari ingatan. Fakta di sini bisa diverifikasi ulang dengan perintah di tiap
bagian.

Latar: commit `5a386f0a9` menghapus `cpp/modes/` (3 kelas) dengan alasan "nol
referensi". Dokumentasi (`docs/archive/README.md` bagian B) menyatakan orphan
tidak otomatis berarti hapus, dan menyebutnya "pilihan desain". Dokumen ini
menyajikan dua pilihan itu secara konkret.

---

## Isi `modes/` yang sebenarnya (jangan tertukar dengan "stub kosong")

| Kelas | Isi nyata | Verdict |
|---|---|---|
| `BitPerfectPipeline` | `process()` body kosong + komentar `INTENTIONALLY EMPTY / no EQ, no gain, no limiter`. Ini **spesifikasi perilaku ditulis sebagai kode** | spesifikasi, bukan implementasi |
| `DSPPipeline` | `prepare()` ÃÂ¢ÃÂÃÂ `mDSPChain.prepare()`, `updateParameters()` ÃÂ¢ÃÂÃÂ petakan `DSPParameters` ke `DSPConfig`, `process()` ÃÂ¢ÃÂÃÂ `mDSPChain.process()` | **implementasi nyata** |
| `ImmersivePipeline` | `prepare()` ÃÂ¢ÃÂÃÂ `mSolfeggio.prepare()` + `mPrepared=true`; `updateParameters()` ÃÂ¢ÃÂÃÂ set frequency/intensity/brainwave; `process()` ÃÂ¢ÃÂÃÂ **5 panggilan nyata**: `mSolfeggio.process`, `mHarmonic.process`, `mSpatial.process`, `mBrainwave.generate` | **implementasi nyata** (bukan TODO) |

Verifikasi:
```bash
git show 5a386f0a9~1:android/app/src/main/cpp/modes/ImmersivePipeline.cpp | sed -n '70,120p'
```

Dan yang penting: `dsp/immersive/*` (6 file ÃÂ¢ÃÂÃÂ `SolfeggioResonator`,
`BrainwaveGenerator`, `HarmonicExciter`, `SpatialFieldProcessor`,
`BinauralRenderer`, `FFTResonanceAnalyzer`) **masih ada dan masih dibangun**.
`modes/ImmersivePipeline` adalah konsumen satu-satunya yang pernah menunjuk ke sana.

---

## Opsi 1 ÃÂ¢ÃÂÃÂ "Port lalu hapus"

**Bunyi:** pindahkan logika `modes/*` ke `AudioPipeline`, lalu `modes/` dihapus
permanen. `AudioPipeline` jadi satu-satunya pemilik tiga mode.

### Yang dilakukan (konkret)

```
core/AudioPipeline.h        + member: Solfeggio, Harmonic, Spatial, Brainwave
                            + member: mPrepared, mSampleRate (sudah ada)
core/AudioPipeline.cpp      processImmersive() diisi 5 panggilan nyata
                            (disalin dari modes/ImmersivePipeline::process)
                            prepare() ikut prepare() sub-prosesor
```

**Ukuran porting:** ~40 baris logika `process()` + ~15 baris `updateParameters()`
+ ~10 baris `prepare()`. Total ~65 baris dipindah ke **satu file** yang sudah ada.
Tidak ada file baru.

### Dampak per syarat produk

| Syarat | Hasil |
|---|---|
| **Live switch** | **Murah.** Mode dibaca dari `AudioState::processingMode()` (atomic) di tiap callback. Ganti mode ÃÂ¢ÃÂÃÂ ganti cabang `switch` ÃÂ¢ÃÂÃÂ frame berikutnya diproses beda. Tidak ada restart, tidak ada jeda. Immersive butuh `prepare()` sekali di laju stream ÃÂ¢ÃÂÃÂ itu sudah terjadi di `AudioEngine::start()` |
| **Bit-perfect gagal tetap jalan** | Alami. `processBitPerfect()` no-op ÃÂ¢ÃÂÃÂ PCM lewat utuh. Kegagalan laju/device dilaporkan terpisah (`isRateHonored`, `isPathInherentlyLossy`) ÃÂ¢ÃÂÃÂ tidak menyentuh pemrosesan |
| **Tiga mode tetap ada** | Ya ÃÂ¢ÃÂÃÂ semua di satu `switch`, satu tempat dibaca |
| **Tagihan perawatan** | 1 pemilik `DSPChain`, 1 tempat mode. Nol duplikasi |
| **Risiko baru** | `DSPChain` mulai benar-benar dieksekusi di jalur produksi. Belum pernah terjadi ÃÂ¢ÃÂÃÂ bisa ada bug DSP yang baru muncul |

### Yang hilang

- Kelas `modes/*` hilang sebagai artefak. Perilakunya hidup di `AudioPipeline`.
  Kalau nanti butuh jalur offline/push, yang dipakai `AudioPipeline` juga.
- API `modes/*` (`prepare/updateParameters/process/reset` per kelas) tidak lagi
  tersedia sebagai unit terpisah. Immersive jadi bagian `AudioPipeline`, bukan
  kelas sendiri ÃÂ¢ÃÂÃÂ sedikit kurang modular, tapi konsisten dengan `processDSP`
  yang sudah begitu.

### Cocok kalau

Mode adalah **kondisi pemrosesan dari satu aliran data** (yang memang begitu di
jalur produksi sekarang): satu sumber ÃÂ¢ÃÂÃÂ satu pemroses ÃÂ¢ÃÂÃÂ satu output, mode hanya
memilih pemrosesnya.

---

## Opsi 2 ÃÂ¢ÃÂÃÂ "Kembalikan `modes/*`, jadikan jalur nyata"

**Bunyi:** `modes/*` dikembalikan (dari `5a386f0a9~1`) dan dipakai sebagai tempat
implementasi. `AudioPipeline` hanya jadi dispatcher.

### Yang dilakukan (konkret)

```
modes/                      dikembalikan apa adanya (3 kelas)
core/AudioPipeline          jadi dispatcher:
                              process() ÃÂ¢ÃÂÃÂ if (mode==BitPerfect) mBitPerfect.process(...)
                                         else if (mode==DSP)   mDSPPipe.process(...)
                                         else                  mImmersive.process(...)
modes/DSPPipeline           mDSPChain ÃÂ¢ÃÂÃÂ¬ duplikat dengan AudioPipeline::mDSP
```

**Ukuran:** dikembalikan + dispatcher ~20 baris. Tampak lebih kecil dari Opsi 1,
**tapi** ada biaya tersembunyi: dua `DSPChain` (lihat di bawah).

### Masalah yang muncul

**M1 ÃÂ¢ÃÂÃÂ Dua pemilik `DSPChain`.**
`core/AudioPipeline` sudah punya `DSPChain mDSP`. `modes/DSPPipeline` punya
`DSPChain mDSPChain` sendiri. Kalau keduanya dipakai, ada dua instans dengan
state EQ/limiter/gain terpisah. EQ yang diset lewat `EngineManager` menyentuh
satu; mode DSP membaca yang lain. **Ini bug yang akan muncul sebagai "EQ kadang
tidak berefek"** dan sangat sulit dilacak.

Pilihan untuk menghindarinya:
- `modes/DSPPipeline` tidak dipakai; `AudioPipeline::processDSP` tetap yang
  dipakai ÃÂ¢ÃÂÃÂ berarti untuk mode DSP kita **tidak** memakai `modes/`, sehingga
  "kembalikan modes/" jadi setengah-setengah dan tidak menyelesaikan apa pun.
- `AudioPipeline::mDSP` dihapus, semua lewat `modes/DSPPipeline`
  ÃÂ¢ÃÂÃÂ berarti `AudioPipeline` kehilangan `DSPChain`-nya dan jadi dispatcher murni.
  Ini konsisten, tapi **`render()` tetap harus memanggil `AudioPipeline`**, jadi
  lapisannya bertambah satu tanpa mengurangi keterikatan.

**M2 ÃÂ¢ÃÂÃÂ `modes/*` adalah pemroses in-place tanpa kontrak buffer.**
Tandatangan `modes/*::process(float* left, float* right, int32_t numFrames, ...)`
mengasumsikan pemanggil menyediakan **dua buffer terpisah** (left & right).
`PlaybackController::render()` menghasilkan **satu buffer interleaved**
(`output[i*2]`, `output[i*2+1]` ÃÂ¢ÃÂÃÂ terlihat di `AudioCallback`). Jadi sebelum
`modes/*` bisa dipakai di jalur produksi, buffer interleaved harus
**di-deinterleave** ke `mLeft`/`mRight`, diproses, lalu **di-interleave** kembali.

Deinterleave/interleave itu ~2 loop per callback. Bukan mahal, tapi:
- `AudioCallback` **sudah punya** `mLeft`/`mRight` ÃÂ¢ÃÂÃÂ tapi hanya dipakai di
  cabang fallback yang tidak pernah jalan.
- Artinya Opsi 2 **membatalkan keputusan lama** ("kalau Immersive dikerjakan,
  `AudioPipeline` yang dipakai") dan memindahkan pekerjaan ke bentuk buffer yang
  berbeda dari jalur produksi hari ini.

**M3 ÃÂ¢ÃÂÃÂ Live switch jadi lebih berlapis.** Mode harus dibaca di dispatcher, lalu
dispatcher memilih kelas, lalu kelas itu memproses. Sama-sama live, tapi
pergantian mode berarti pergantian kelas yang harus sudah `prepare()` di laju
stream. `ImmersivePipeline::prepare()` dan `DSPPipeline::prepare()` keduanya
harus dipanggil saat stream dibuka ÃÂ¢ÃÂÃÂ tiga jalur persiapan, bukan satu.

### Dampak per syarat produk

| Syarat | Hasil |
|---|---|
| **Live switch** | Bisa, tapi lewat dispatcher + 3 kelas yang semuanya harus siap di laju stream. Lebih banyak state yang harus benar |
| **Bit-perfect gagal tetap jalan** | Sama ÃÂ¢ÃÂÃÂ `BitPerfectPipeline::process()` no-op. Tidak ada perbedaan |
| **Tiga mode tetap ada** | Ya, dan lebih eksplisit ÃÂ¢ÃÂÃÂ tiga kelas, tiga nama |
| **Tagihan perawatan** | Dua `DSPChain` (M1), buffer deinterleave (M2), tiga `prepare()` (M3) |
| **Risiko baru** | Sama seperti Opsi 1 (DSPChain mulai dieksekusi) **plus** risiko dari M1ÃÂ¢ÃÂÃÂM3 |

### Cocok kalau

Tiap mode adalah **komponen yang bisa dipakai berdiri sendiri** ÃÂ¢ÃÂÃÂ misalnya untuk
render offline, verifikasi bit-perfect, atau analisis file, di mana pemanggil
memang punya buffer sendiri dan tidak peduli `render()`.

---

## Perbandingan langsung

| | Opsi 1 ÃÂ¢ÃÂÃÂ port lalu hapus | Opsi 2 ÃÂ¢ÃÂÃÂ hidupkan `modes/` |
|---|---|---|
| Ukuran perubahan | ~65 baris dipindah ke 1 file | 3 file dikembalikan + dispatcher ~20 baris |
| File baru | tidak ada | tidak ada (tapi 1 lapisan logika bertambah) |
| Jumlah `DSPChain` | **1** | **2** (atau `AudioPipeline::mDSP` dihapus) |
| Bentuk buffer | mengikuti jalur produksi (interleaved) | butuh deinterleave/interleave di callback |
| Live switch | 1 titik baca mode | dispatcher + 3 kelas harus siap |
| Risiko regresi | DSP mulai dieksekusi (sama untuk keduanya) | DSP + M1 + M2 + M3 |
| Kesesuaian dengan `archive/README.md` | **sesuai** ÃÂ¢ÃÂÃÂ "`AudioPipeline.cpp` yang dipakai, bukan `modes/ImmersivePipeline`" | bertentangan dengan kalimat itu |
| Kesesuaian dengan `ARCHITECTURE.md` ÃÂÃÂ§3 | perlu update (dokumen menyebut `cpp/modes/`) | sesuai apa adanya |
| Nilai untuk jalur push/offline | `AudioPipeline` tetap bisa dipakai dari sana | `modes/*` jadi komponen mandiri yang lebih pas |

---

## Rekomendasi

**Opsi 1.** Alasan utamanya bukan "lebih sedikit baris" ÃÂ¢ÃÂÃÂ selisihnya kecil.
Alasan utamanya: **M1 (dua `DSPChain`) adalah bug yang pasti terjadi dan sulit
dilacak.** EQ yang diset lewat satu jalur dan dibaca dari jalur lain akan muncul
sebagai "kadang tidak berefek", dan itu jenis bug yang memakan berhari-hari.

Ditambah: `docs/archive/README.md` ÃÂ¢ÃÂÃÂ dokumen Anda sendiri ÃÂ¢ÃÂÃÂ sudah sampai ke
kesimpulan yang sama ("`AudioPipeline.cpp` yang dipakai, bukan
`modes/ImmersivePipeline`"). Opsi 2 berarti membatalkan keputusan yang sudah
ditulis, dan tidak ada argumen baru yang mendukung pembatalan itu.

**Yang bisa diambil dari Opsi 2 tanpa M1ÃÂ¢ÃÂÃÂM3:** kalau nanti jalur push/offline
dihidupkan, `modes/*` bisa dikembalikan sebagai **konsumen** `AudioPipeline`
(bukan pemilik kedua). Saat itu tidak ada dua `DSPChain`, karena `modes/*` tidak
punya `DSPChain` sendiri lagi. Itu kompromi terbaik: perilakunya diadopsi
sekarang, komponennya bisa lahir kembali nanti tanpa duplikasi.

---

## Yang perlu Anda putuskan

1. **Opsi 1** (port lalu hapus ÃÂ¢ÃÂÃÂ sesuai `archive/README.md` dan ADR-0001), atau
2. **Opsi 2** (kembalikan `modes/*` sebagai jalur nyata ÃÂ¢ÃÂÃÂ sesuai `ARCHITECTURE.md` ÃÂÃÂ§3),
3. atau **kompromi**: Opsi 1 sekarang, `modes/*` boleh lahir kembali sebagai
   konsumen `AudioPipeline` saat jalur push/offline benar-benar dipakai.
