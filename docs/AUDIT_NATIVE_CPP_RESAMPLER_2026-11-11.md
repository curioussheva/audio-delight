# Audit Native C++ — Resampler (2026-11-11)

- **Repo:** `curioussheva/audio-delight`, branch `fix/ffmpeg-disable-doc`, HEAD `cb9daad4`
- **Section:** `android/app/src/main/cpp/resampler/` (8 file) + jalur pemakai (`decoder/AudioDecoder`, `decoder/StreamResampler`)
- **Metode:** 3 track paralel read-only (A: LinearResampler + jalur hidup; B: SincResampler + kualitas; C: pemakai + tipe + dead code + build). Setiap klaim kunci diverifikasi asisten dari kode (bukan dari laporan saja); klaim harness Track A dicek konsistensinya terhadap kode (matematika carry +1 frame diverifikasi dari `LinearResampler.cpp` langsung).
- **Status:** catat dulu — belum ada perbaikan yang dipilih.

## Ringkasan

**0 BLOCKER, 6 MAJOR (semuanya laten/dormant), 15 minor, 5 dugaan.** Tidak satu pun MAJOR mengubah perilaku produksi hari ini — dan itu justru inti temuannya: section resampler hampir seluruhnya **mati atau dormant**, tapi tetap terkompilasi dan tetap menyimpan ranjau.

Satu-satunya resampling yang benar-benar jalan di produksi adalah **libswresample (sinc) di `FFmpegDecoder`** — dan itu sudah terbukti di device (logcat #9: FLAC 96 kHz main ~2 menit bersih, tempo 44,1 kHz 1,00×). Semua yang ada di `resampler/`:

| Komponen | Status |
|---|---|
| `dsp::LinearResampler` | **Dormant** — rantai `decode → applyResampling → StreamResampler → LinearResampler` utuh, tapi digate override D-M1 (`needsResampling() → false`). Cacatnya nyata (R-M1, R-M2) dan hidup lagi seketika kalau gate dicabut. |
| `SincResampler` | **Mati + stub yang berbohong** (R-M5): `configure()` membangun 128 koefisien sinc, `process()` membuangnya dan memakai linear; `getDelayInFrames()` klaim 64 padahal aktual 0. |
| `AudioResampler` + `createResampler()` + `LinearResamplerAdapter` | **Mati total** (R-M6): factory 0 caller DAN tidak dideklarasikan di header mana pun. |
| `ResamplerType` / `ResampleSpec` / `SINC_FAST/MEDIUM/BEST` / `SRCQuality` | **Mati** — tidak ada pemakaian; tiga varian SINC identik. |
| `StreamResampler` (decoder/) | **Dormant** — dikonstruksi tiap decoder, `process()` tidak terjangkau; `reset()`/`required()` 0 caller. |

**Temuan terbesar: R-M1.** Carry fase `LinearResampler::process()` meleset tepat **+1 frame input di tiap batas chunk, dan akumulasi** — terbukti harness (maxErr 0 → 0,056 → 0,113 per batas, ~1 output hilang per batas). Ini bug di satu-satunya implementasi resample non-FFmpeg di repo, dan ia tersembunyi di balik reset-per-chunk (yang justru membatasi akumulasinya hari ini).

**Koreksi dokumen (baru):** rekomendasi `docs/AUDIT_2026-11-10.md` item 4 ("ganti `LinearResampler` → `SincResampler` di `StreamResampler`") **SALAH** — swap itu no-op kualitas (SincResampler isinya linear) dan menambah bug reset-fase. Koreksi tertanggal ditambahkan ke doc itu (lihat §Koreksi).

---

## MAJOR

### R-M1 — Carry fase `LinearResampler::process()` meleset +1 frame input di tiap batas chunk, dan akumulasi (laten)

- **Bukti kode** — `resampler/LinearResampler.cpp:149-157`: loop berhenti saat `index >= inputFrames - 1`, jadi posisi berikutnya yang belum di-emit, `p`, ada di `[inputFrames-1, inputFrames-1+ratio)`. Posisi lokal yang BENAR untuk output itu di chunk berikutnya adalah `p - inputFrames` ∈ `[-1, 0)` — interpolasi antara sampel terakhir chunk lama dan sampel pertama chunk baru. Kode malah membawa `p - floor(p)` ∈ `[0, 1)` — tepat **1,0 frame lebih lambat** (untuk `p` non-bulat dan `ratio < 2`, `floor(p) = inputFrames-1`). `process()` tidak menyimpan history, jadi output lintas-batas itu tidak mungkin benar.
- **Bukti harness** (Track A, file produksi asli, sine 440 Hz, 44100→48000, chunk 1024): maxErr 0,000000 (chunk 0) → **0,056407** (1 batas) → **0,112749** (2 batas) — tumbuh persis ~0,056 per batas (geser 1 frame @44100 Hz ≈ 22,7 µs). Total output 3341 vs ideal 3343,7 — ~1 output hilang per batas. Tempo: ~0,08% lambat pada chunk 1024 (harness); pada chunk produksi 16384, ~0,006% per batas — kecil, tapi error fase +1 frame per batas tetap akumulasi tanpa batas.
- **Dampak:** glitch satu sampel di tiap batas chunk (~0,34 dtk sekali pada chunk 16384) + drift tempo sistematis. Kecil per batas, tak terbatas akumulasinya.
- **Catatan penting:** bug ini TERSEMBUNYI di balik r-m1 (reset per chunk). Kalau seseorang "memperbaiki" r-m1 dengan menghapus `configure()` per chunk tanpa memperbaiki carry ini, error batasnya justru mulai akumulasi. Kedua bug harus diperbaiki bersamaan (carry = `p - inputFrames` + simpan 1 frame history).
- **Status:** laten — `process()` tidak terjangkau runtime pasca-D-M1 (gate override). Hidup lagi seketika kalau gate dicabut atau ada subclass decoder baru.

### R-M2 — `configure()` tanpa validasi: rate 0 / channel 0 → UB, SIGFPE, terminate, inf/NaN (laten)

- **Bukti kode** — `resampler/LinearResampler.cpp:14-40`: `configure()` meng-assign rate/channel/ratio tanpa satu pun guard. `getOutputFramesForInput()` (`:52-67`) membagi dengan `mInputRate`; `process()` loop `ch < mChannels` tanpa guard.
- **Bukti harness** (Track A):
  - `inputRate = 0` → `getOutputFramesForInput(16384) = -2147483648` (double `x/0` = inf, cast ke `int32_t` = UB). Di `StreamResampler::process()` nilai itu masuk `resize()`: mono → **THROW** `std::length_error` → `workerLoop` tanpa try/catch (d-m16) = **terminate**; stereo → meluap ke 0 → chunk diam-diam dibuang.
  - `outputRate = 0` → `mRatio = inf` → `process()` return 8 frame berisi `[0, 0.1, inf, inf, …]` sebagai audio valid.
  - `channels = 0` → `process()` return **1114 frame** tanpa menulis buffer sama sekali.
- **Jalur masuk:** `inputFormat_` dari subclass diteruskan tanpa validasi (`decoder/AudioDecoder.cpp:246-251`); file korup / decoder baru bisa membawa 0 ke sini. Dormant hari ini (FFmpegDecoder tidak melewati jalur ini).
- **Catatan:** `SincResampler::configure()` juga tanpa validasi (`outputRate == 0` → `ratio` inf; `channels=0` → history kosong) — bagian dari temuan yang sama.

### R-M3 — `StreamResampler` tidak bisa konversi channel; `mRequired` hanya bandingkan rate (laten)

- **Bukti kode** — `decoder/StreamResampler.cpp:30-37`: `mRequired = inputRate != outputRate`. `configure()` hanya menerima SATU `channels` — dipakai untuk input DAN output; tidak ada parameter channel output; konversi channel tidak dapat diekspresikan di layer ini. `process()` set `output.pcm.channels = mChannels` (channel input).
- **Bukti harness** (Track A): mono 48k→48k passthrough mentah (channel tetap 1 padahal target stereo); mono 44,1k→48k: 17.832 frame × 1 channel (rate dikonversi, channel TIDAK — konsumen stereo mengharapkan 35.664 float).
- **Dampak hilir (terverifikasi):** konsumen `playback/PlaybackController.cpp:1130-1137` menyalin `result.samples.size()` float ke queue (bukan `framesDecoded * channel`) — jadi TIDAK ada OOB di konsumen. Kerusakannya berupa audio: queue terisi mono sementara `render()` membaca stereo → starvasi 2:1 (zero-fill/gap) + pasangan L/R salah. Ini persis separuh-mono dari D-M1 yang dulu terjadi karena `applyResampling` + `mRequired=false`; perbaikan 7e6fd5a6 mem-bypass jalurnya untuk FFmpegDecoder (yang sudah di-upmix swr), tapi cacat di `StreamResampler` sendiri tidak diperbaiki.
- **Inkonsistensi kontrak:** `needsResampling()` membandingkan laju DAN channel (`decoder/AudioDecoder.cpp:173-177`), tapi `StreamResampler::required()` hanya laju — perubahan channel murni lolos sebagai "tidak perlu", lalu `applyResampling` mengonfigurasi dengan channel input (`:246-250`).

### R-M4 — Footgun D-M1 masih ada di `applyResampling()` (laten)

- **Bukti kode** — `decoder/AudioDecoder.cpp:238-281`: `input.pcm.frames = static_cast<int32_t>(result.framesDecoded)` (`:248`) — `framesDecoded` domain INPUT dipakai sebagai jumlah frame buffer domain OUTPUT. Persis mekanisme heap OOB D-M1. Satu-satunya yang menahannya hari ini adalah override `needsResampling() → false` di `FFmpegDecoder` (satu-satunya subclass, `final`); bila subclass baru memakai implementasi base (atau override dihapus), bug D-M1 hidup lagi tanpa peringatan.
- **Catatan:** komentar invarian di `decoder/FFmpegDecoder.cpp:336-341` memperingatkan hal ini, tapi tidak ada yang mencegahnya di compile time (mis. `applyResampling` dihapus atau `framesDecoded` diperbaiki domainnya). Perbaikan D-M1 (7e6fd5a6) dinilai **tepat sebagai penahan, bukan perbaikan akar**.

### R-M5 — `SincResampler` adalah stub linear yang berbohong soal kualitas + delay (mati, tapi terkompilasi)

- **Bukti kode** — `resampler/SincResampler.cpp:82-87`: `process()` membangun `dsp::LinearResampler` baru per panggilan dan mendelegasikan semuanya; `coefficients`/`history` tidak pernah dibaca di `process()` (satu-satunya pembacaan `coefficients` adalah `.size()` untuk variabel lokal `taps` yang juga tidak dipakai). Komentar kode sendiri mengakuinya tiga kali: "works as stub", "use linear interpolation as placeholder", "STUB: fallback to linear".
- **Bohongnya berlapis:** `configure()` (`:35-60`) membangun tabel koefisien windowed-sinc 128 tap + log `LOGD("Configured sinc resampler...")` — kerja yang seluruhnya DIBUANG. `getDelayInFrames()` return `halfKernel` = 64 (`:111-113`) padahal perilaku aktual (linear) delay-nya 0 — kompensasi latensi yang memakai nilai ini meleset 64 frame. `process()` membuat LinearResampler fresh tiap panggil → fase di-reset tiap chunk (klik di batas chunk, ~0,34 dtk sekali pada 48 kHz, kalau pernah dipakai) + alokasi/configure per chunk yang dibuang.
- **Yang TIDAK rusak:** tabel koefisien `configure()` benar secara matematis untuk desain yang dinyatakan (Blackman-windowed sinc, 128 tap, cutoff 0,95 × output Nyquist, normalisasi DC sehingga gain DC = 1 — diverifikasi Track B: rumus `h[n] = 2·f_c·sinc(2·f_c·n)` cocok; faktor 2× dibatalkan normalisasi). Yang hilang adalah seluruh mesin konvolusinya — perlu polyphase filter bank (~150–300 baris + harness), bukan "aktifkan flag".
- **Dampak hari ini:** nol (0 caller). Dampak laten: siapa pun yang suatu hari memakai `createResampler(SINC_*)` demi kualitas akan mendapat kualitas linear — tanpa peringatan apa pun, karena nama kelas, enum `SINC_FAST/MEDIUM/BEST`, dan tabel 128-tap semuanya menjanjikan sinc. Ini pola persis yang diperingatkan `AGENTS.md` ("stub yang dikompilasi lebih berbahaya daripada file yang tidak ada").
- **Perbaikan yang benar:** hapus kelas + factory, atau tulis ulang `process()` dari nol. Jangan "aktifkan".

### R-M6 — Factory + kontrol kualitas mati total; tiga varian SINC identik (mati)

- **Bukti kode:**
  - `createResampler()` 0 caller repo-wide DAN **tidak dideklarasikan di header mana pun** (`resampler/AudioResampler.h` 15 baris hanya berisi interface) — tidak bisa dipanggil dari TU lain tanpa deklarasi ulang. Seluruh lapisan `AudioResampler` + `ResampleSpec` + `ResamplerType` + `LinearResamplerAdapter` hanya ada untuk dirinya sendiri.
  - `SRCQuality` (`resampler/SRCQuality.h:5-9`, enum `FAST/MEDIUM/BEST`) 0 referensi; headernya bahkan tidak pernah di-`#include` siapa pun. Duplikat konsep dengan `ResamplerType::SINC_FAST/MEDIUM/BEST` — dua enum kualitas paralel, keduanya mati.
  - Ketiga varian SINC memetakan ke kelas yang sama (`resampler/AudioResampler.cpp:60-63`); `SincResampler::configure` mengabaikan `spec.type` sepenuhnya (`taps = 128` hardcode). Tidak ada pemilih kualitas di C++/Kotlin/TS.
- **Dampak:** setiap klaim tentang kualitas resample yang bisa dipilih (dokumen/UI/komentar) adalah salah. Konsekuensi dokumen: rekomendasi `docs/AUDIT_2026-11-10.md` item 4 ("ganti `LinearResampler` → `SincResampler` di `StreamResampler`") harus dikoreksi — swap itu no-op kualitas + menambah bug reset-fase (lihat §Koreksi).
- **Perbaikan:** hapus `SRCQuality` + `ResamplerType` bersama kelasnya; kalau suatu hari kualitas perlu dipilih, desain dulu pemilihnya (dan ukur perbedaannya).

---

## MINOR

| ID | Temuan | Bukti |
|---|---|---|
| r-m1 | `applyResampling()` memanggil `configure()` TIAP chunk → fase di-reset tiap chunk (konfirmasi d-m26 audit decoder, terkuantifikasi: maxErr 0,058, ~1 output hilang/batas, tempo −0,06%; reset justru MEMBATASI R-M1) | `decoder/AudioDecoder.cpp:246-251`; `resampler/LinearResampler.cpp:37-40` (`configure()` → `reset()` → `mReadPosition = 0.0`) |
| r-m2 | Estimasi `getOutputFramesForInput()` vs aktual off-by-one (arah aman): `ceil()` 17.833 vs `process()` maks 17.832 — buffer 1 frame lebih besar, tidak pernah overflow; jangan "perbaiki" ceil jadi floor | `resampler/LinearResampler.cpp:52-67` |
| r-m3 | Chunk 1 frame selalu dibuang: guard `inputFrames <= 1 → return 0` + syarat `index < inputFrames-1` | `resampler/LinearResampler.cpp:85,104` |
| r-m4 | Default menipu + fallback diam-diam: `ResampleSpec::type` default `SINC_MEDIUM` (pemakai yang tidak mengisi `type` mendapat stub linear berkedok sinc); factory `default:` return `LinearResamplerAdapter` untuk enum tak dikenal tanpa log/assert | `resampler/ResamplerTypes.h:17`; `resampler/AudioResampler.cpp:64-65` |
| r-m5 | Komentar menyesatkan: `LinearResampler.h` mengklaim "Stereo interleaved float32" padahal kelasnya generik terhadap `mChannels` | `resampler/LinearResampler.h` |
| r-m6 | `seek()`/`close()` tidak me-reset resampler; `reset()`/`required()` 0 caller. Kalau r-m1 diperbaiki (configure sekali), seek WAJIB memanggil `reset()` — kalau tidak, fase chunk sebelum seek bocor ke audio setelah seek | `decoder/StreamResampler.cpp:44,53`; grep 0 caller |
| r-m7 | Komentar `SincResampler::configure()` bilang "Kaiser-windowed" tapi kode memakai **Blackman** | `resampler/SincResampler.cpp:42` vs `:30-33,49` |
| r-m8 | Variabel lokal mati di `SincResampler::process()`: `taps`, `half`, `outIdx`, `ratio`, `pos` dihitung, tidak pernah dipakai; `outIdx` tidak pernah di-increment | `resampler/SincResampler.cpp:65-69` |
| r-m9 | `Impl::kernelSize = 64` dideklarasi ("adjustable") tapi tidak pernah dibaca; `taps = 128` di-hardcode di `configure()` | `resampler/SincResampler.cpp:18` vs `:43-44` |
| r-m10 | `reset()` membersihkan `history` yang tidak pernah dipakai `process()`; satu-satunya efek nyata adalah `pos = 0` | `resampler/SincResampler.cpp:105-108` |
| r-m11 | `ResampleSpec` tidak punya default untuk `inputRate`/`outputRate` (hanya `type` yang punya default) — `ResampleSpec spec;` meninggalkan rate tak terinisialisasi | `resampler/ResamplerTypes.h:13-18` |
| r-m12 | Tabel koefisien dibangun tanpa syarat bahkan saat `ratio == 1` (passthrough) — kerja terbuang; dan kalau tabel itu suatu hari dipakai, filter 128-tap pada passthrough menambah latensi 64 frame tanpa manfaat | `resampler/SincResampler.cpp:42-55` |
| r-m13 | `LinearResampler::process` percaya `inputFrames` tanpa batas: membaca `input[index+1]` sampai `inputFrames-2`. Invarian "inputFrames == panjang buffer sebenarnya" tidak didokumentasikan dan tidak dicek. Mekanisme OOB D-M1 persis di sini | `resampler/LinearResampler.cpp:115-135` |
| r-m14 | `StreamResampler::process` meng-alias buffer member (`output.pcm.data = mOutputBuffer.data()`). Aman hanya karena `applyResampling` langsung menyalinnya ke vector baru; kontrak aliasing tidak didokumentasikan | `decoder/StreamResampler.cpp:91-92`; `decoder/AudioDecoder.cpp:265-267` |
| r-m15 | CMakeLists meng-glob `resampler/*.cpp` tanpa kecuali — ketiga TU terkompilasi ke `libpristine-audio.so` meski 2 dari 3 hanya melayani factory mati | `android/app/src/main/cpp/CMakeLists.txt:84` |

---

## DUGAAN

| ID | Dugaan | Dasar + cara verifikasi |
|---|---|---|
| Rg-1 | Glitch batas chunk (R-M1/r-m1) TERDENGAR pada musik nyata? Error 0,056 per batas untuk sine 440 Hz @0,9 (~-25 dB pada SATU sampel per ~0,34 dtk) — masking musik kompleks mungkin menutupinya | Harness: resample sine sweep + noise burst mode reset-per-chunk, hitung THD+N / spektrogram di sekitar batas chunk; device tidak mungkin tanpa menghidupkan jalur (dormant). Perbaiki R-M1/r-m1 dulu, dugaan ini hilang sendiri |
| Rg-2 | Drift tempo 0,06–0,08% sepanjang track penuh — ekstrapolasi ≈ 0,25 dtk per track 5 menit, belum diukur pada input panjang | Harness input 5 menit (13,4 juta frame), bandingkan total output vs ideal; atau DIAG position vs wall clock di device kalau jalur dihidupkan lagi |
| Rg-3 | `SincResampler` ditulis sebagai placeholder pada pekerjaan resampler Oktober 2026 dengan niat diselesaikan kemudian, lalu tidak pernah dilanjutkan | Komentar "stub", "placeholder", "For production, use polyphase filter bank" (`SincResampler.cpp:71-80`); git: hanya import awal (2026-05-30) + mass-update, tanpa commit yang memperkenalkan pemanggil. Niat penulis tidak terekam di kode |
| Rg-4 | `SRCQuality` dulunya selector kualitas `SincResampler`/`createResampler`? | Tidak ada bukti di kode (0 referensi, tidak di-include). Verifikasi: `git log -S SRCQuality` |
| Rg-5 | Factory `createResampler` pernah dipakai sebelum jalur swr FFmpeg? | Tidak ada bukti di kode; `FFmpegDecoder` selalu memakai swr sejak awal. Verifikasi: `git log -S createResampler --oneline` |

**DITUTUP (bukan dugaan lagi):** matematika tabel koefisien `SincResampler::configure()` — Track B memverifikasi rumusnya benar untuk desain yang dinyatakan (lihat R-M5, "Yang TIDAK rusak"). Jangan ada yang mengklaim "sinc sudah tersedia" dari file ini — tabel benar, mesinnya tidak ada.

---

## Dead code

| Simbol / file | Status | Bukti |
|---|---|---|
| `SincResampler` (seluruh kelas) | Mati — 0 caller | Hanya `resampler/AudioResampler.cpp:63` (di dalam factory mati) |
| `createResampler` + `LinearResamplerAdapter` + `AudioResampler` (factory) | Mati — 0 caller, tanpa deklarasi header | §R-M6 |
| `SRCQuality` (seluruh file) | Mati — 0 referensi, tidak pernah di-include | §R-M6 |
| `ResamplerType` / `ResampleSpec` | Mati praktis — hanya dipakai factory mati + default yang tidak dikonsumsi | §R-M6 |
| `StreamResampler::reset()` / `required()` | Mati — 0 caller | §r-m6 |
| `StreamResampler::process()` (jalur runtime) | Tidak terjangkau runtime — dikonstruksi tapi tidak pernah memproses (akan hidup lagi kalau ada subclass `AudioDecoder` baru tanpa override `needsResampling`) | `decoder/AudioDecoder.cpp:9` vs `decoder/FFmpegDecoder.cpp:469` |
| `AudioResampler::getDelayInFrames()` | Mati — 0 caller | Deklarasi `resampler/AudioResampler.h:12` |
| `LinearResampler::inputRate()` / `outputRate()` | Mati — 0 caller | — |
| `SincResampler::Impl` member `history`, `coefficients`, `kernelSize`, `pos` | Mati di dalam kelas mati — ditulis/dialokasi, tidak pernah dibaca `process()` | `resampler/SincResampler.cpp:16-18,57` vs `:62-88` |

**Tidak mati (jangan dihapus):** `dsp::LinearResampler` (satu-satunya implementasi resampling non-FFmpeg; dipakai `StreamResampler` — meski jalurnya kini dormant, ini satu-satunya fallback linear yang benar) dan `decoder/StreamResampler.h` sebagai wrapper (selama `AudioDecoder` masih memilikinya). `LinearResampler` perlu DIPERBAIKI (R-M1, R-M2), bukan dihapus.

---

## Tabel pemakai per simbol (dari Track C, diverifikasi)

| Simbol | Caller produksi | Keterangan |
|---|---|---|
| `AudioResampler` (interface) | 0 pengguna; 2 implementasi | Impl: `SincResampler.h:7`, `AudioResampler.cpp:16` (adapter internal). Tidak ada yang memegang `AudioResampler*` di luar `AudioResampler.cpp` |
| `createResampler()` | **0** | Definisi `resampler/AudioResampler.cpp:56`. Tidak dideklarasikan di header mana pun |
| `SincResampler` | **0** | Hanya `resampler/AudioResampler.cpp:63` + definisi diri sendiri |
| `LinearResampler` (`dsp::`) | 1 kelas pemakai (jalur dormant) + 2 pemakai mati | `decoder/StreamResampler.h:48` (member); `resampler/AudioResampler.cpp:51` (adapter mati); `resampler/SincResampler.cpp:83` (fallback stub) |
| `StreamResampler` | 1 kelas pemakai (jalur dormant) | `decoder/AudioDecoder.h:188` (member), `decoder/AudioDecoder.cpp:9` (ctor), `:246` + `:261` (di dalam `applyResampling`, tidak terjangkau) |
| `ResamplerTypes.h` | 1 include | `resampler/AudioResampler.h:2` |
| `ResamplerType` | 0 di luar factory mati | `resampler/AudioResampler.cpp:56,58,60-62` |
| `ResampleSpec` | 0 di luar resampler/ | `resampler/AudioResampler.h:9`, `resampler/AudioResampler.cpp:18`, `resampler/SincResampler.h:11`, `resampler/SincResampler.cpp:35` |
| `SINC_FAST/MEDIUM/BEST` | 0 | `resampler/AudioResampler.cpp:60-62`; default `SINC_MEDIUM` (`ResamplerTypes.h:17`) |
| `SRCQuality` | **0** | Definisi `resampler/SRCQuality.h:5`. Tidak ada `#include "SRCQuality.h"` di repo |
| `setTargetFormat()` | **1** | `playback/PlaybackController.cpp:1006` (di `startDecoder()`) — perbaikan D-M1 terverifikasi masih benar |
| `needsResampling()` | 1 caller produksi | `decoder/AudioDecoder.cpp:101` (di `decode()`); override `decoder/FFmpegDecoder.cpp:469` (return `false`) |
| `applyResampling()` | 1 caller (jalur dormant) | `decoder/AudioDecoder.cpp:102`; definisi `:238` |
| `outputFormat_` | 1 writer + 3 baca internal | Writer `decoder/AudioDecoder.cpp:170` (`setTargetFormat`); `refreshFormats` (`:229-236`) tidak pernah menimpa karena default valid |

**Di luar decoder, nol pemakai:** grep `resampl` di `dsp/`, `playback/`, `visualizer/`, `fft/`, `realtime/`, `devices/`, `manager/`, `jni/`, `android/app/src/main/java`, `src/` (TS) tidak menemukan satu pun pemakaian kelas resampler. WSOLA (`playback/PlaybackRateProcessor`) adalah time-stretch, bukan resampling. Produksi resampling = FFmpeg swr saja.

---

## Kualitas nyata hari ini (perbandingan 3 resampler)

|  | libswresample (FFmpegDecoder) | `dsp::LinearResampler` | `SincResampler` |
|---|---|---|---|
| Algoritma nyata | Windowed-sinc FIR, 128 tap (`filter_size=128, cutoff=0.97, linear_interp=0`) | Interpolasi linear antar 2 sample | **Sama dengan LinearResampler** (delegasi penuh) |
| Anti-aliasing | Ya — filter lowpass sesungguhnya | Tidak — respons sinc², aliasing ~−26 dB | Tidak (sama dengan linear) |
| Kontinuitas antar-chunk | Ya (state internal swr) | Ya, bila `configure()` tidak dipanggil ulang — tapi r-m1 me-resetnya, dan R-M1 menggesernya +1 frame/batas | **Tidak** — fase di-reset tiap panggilan |
| Dither | Triangular highpass 0.5 saat resample; none saat passthrough | Tidak ada | Tidak ada |
| Hidup di produksi? | **Ya — satu-satunya yang hidup** | **Tidak** — dormant (gate D-M1) | **Tidak** — 0 caller |
| Kualitas | Produksi | Buruk-untuk-HiFi (rolloff HF + aliasing), cukup untuk placeholder | **Terburuk dari ketiganya** (kualitas linear + klik batas chunk) |

---

## Yang sehat

- **Interpolasi linear per-sampel TEPAT.** Harness chunk tunggal: maxErr **0,000000** vs referensi langsung. Rumus `s1 + (s2-s1)*frac` benar.
- **Batas baca aman JIKA `inputFrames` benar.** Guard `index >= inputFrames-1` memastikan `input[index+1]` maksimal `input[inputFrames-1]` — tidak pernah OOB dari dalam. (Bahaya D-M1 ada di PEMANGGIL yang memberi `inputFrames` domain salah; API ini tidak bisa mendeteksinya — raw pointer + count. Pertahanan harus di caller/gate, dan gate itu sudah ada: override D-M1.)
- **Tidak pernah menulis melewati `maxOutputFrames`.** While-loop cek sebelum tiap emit.
- **Estimasi ukuran aman.** `ceil()` + buffer `estimatedFrames * mChannels` — 1 frame slack, tidak pernah kurang.
- **Passthrough rate-sama benar** untuk stereo (bit-identik, termasuk `pts`/`endOfStream`/`discontinuity`).
- **Gate D-M1 kedap.** Override `needsResampling() → false` tanpa syarat; `framesDecoded` domain-input + invarian terdokumentasi — jangan hapus override tanpa memperbaiki domain dulu.
- **Produksi (swr) dikonfigurasi dengan benar**: `filter_size=128, cutoff=0.97, linear_interp=0`, dither hanya saat resample, tiga lapis guard overflow di `swr_convert`. Kualitas resample hari ini ditentukan di sini — dan di sini saja.
- **Tidak ada klaim kualitas yang hidup di UI/kode produksi** — `SRCQuality`/`ResamplerType` tidak bocor ke Kotlin/TS, jadi tidak ada janji kualitas palsu yang sampai ke user. Masalahnya murni internal (dead code + stub menyesatkan).
- **`process()` realtime-safe** (tanpa alokasi/lock/syscall) — klaim header berlaku untuk `LinearResampler`, tidak untuk `SincResampler::configure()` (alokasi vector + LOGD per configure).

---

## §Koreksi

1. **Rekomendasi `docs/AUDIT_2026-11-10.md` item 4 SALAH** — "ganti `LinearResampler` → `SincResampler` di `StreamResampler`" (bagian "Bit-perfect jujur", P0). `SincResampler::process()` isinya interpolasi linear (R-M5), jadi swap itu no-op kualitas dan menambah bug reset-fase per chunk. Rekomendasi yang benar: hapus `SincResampler`, atau tulis ulang `process()`-nya sebagai polyphase sinc betulan; jangan swap buta. Koreksi tertanggal ditambahkan ke `docs/AUDIT_2026-11-10.md` itu sendiri.
2. **Klaim Track D audit decoder ("needsResampling selalu false") tetap DITOLAK** — base `needsResampling()` (`decoder/AudioDecoder.cpp:173-177`) membandingkan rate/channel dan TRUE untuk file non-48kHz/mono; yang false adalah OVERRIDE `FFmpegDecoder`. Pembedaan ini penting: base class masih akan me-resample subclass baru (dan di situlah R-M1/R-M2/R-M3/R-M4 menunggu).
3. **Catatan peta `docs/NATIVE_CPP_MAP.md` §5** ("terkait langsung dengan M2") sudah tidak akurat untuk `SincResampler` setelah temuan ini: kaitannya dengan M2 adalah sebagai *jalan buntu*, bukan solusi.

---

## Verifikasi device

Tidak ada — dan memang tidak bisa ada: tidak satu pun dari temuan di atas punya perilaku runtime pada APK hari ini (ketiga resampler di luar swr tidak terjangkau). Satu-satunya yang bisa/diverifikasi di device adalah kualitas swr itu sendiri — **sudah terbukti di logcat #9** (FLAC 96 kHz main ~2 menit bersih, tempo 44,1 kHz 1,00× — bukti tidak langsung bahwa sinc produksi bekerja).

---

## Perbaikan — BELUM DIKERJAKAN (catat dulu)

Semua 6 MAJOR laten/dormant — tidak ada yang mengubah audio hari ini, jadi tidak ada yang mendesak. Yang paling layak kalau csheva mau: (a) hapus `SincResampler` + factory + `SRCQuality` + `ResamplerType`/`ResampleSpec` (dead code, mengikuti pola hapus DecoderFactory/PCMDecoder di D-M5); (b) perbaiki R-M1+R-M2+R-M3 di `LinearResampler`/`StreamResampler`/`applyResampling` (carry = `p - inputFrames` + 1 frame history, validasi `configure()`, konversi channel) — atau, lebih sederhana, hapus `applyResampling` + `StreamResampler` sekalian karena jalurnya sudah tidak terjangkau dan swr sudah menangani semuanya.
