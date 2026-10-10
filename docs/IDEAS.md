# IDEAS â Penampung Ide yang Belum Bisa Direalisasikan

**Tujuan dokumen ini.** Menampung ide, temuan, dan rencana yang **dinilai baik
tapi belum bisa dikerjakan sekarang** â karena butuh perangkat uji, butuh
keputusan desain, atau tergantung pekerjaan lain.

**Mengapa ada.** Dua cara salah menangani ide yang belum bisa dikerjakan:
menghapusnya (ide hilang), atau memaksakannya sekarang (pekerjaan setengah
jadi). Dokumen ini jalan ketiga: **disimpan dengan alasan penundaan yang
eksplisit**, supaya saat kondisinya terpenuhi semuanya sudah siap.

**Aturan isi**
1. Setiap entri menyebut **apa**, **mengapa belum bisa**, dan **apa yang
   membuka jalannya**. Tanpa bagian "mengapa belum", entri jadi sampah.
2. Entri yang sudah dikerjakan **dipindahkan** ke `CHANGELOG.md` /
   `ROADMAP.md`, bukan ditandai `[x]` di sini. Dokumen ini hanya menampung
   yang **belum**.
3. Entri yang terbukti salah (bukan sekadar tertunda) **dihapus**, dan
   alasannya ditulis singkat â supaya tidak muncul lagi sebagai ide baru.

Lihat juga: `docs/BOILERPLATE_AND_STUBS.md` (aturan status node),
`docs/adr/` (keputusan yang sudah diambil).

---

## Menunggu uji perangkat

Perangkat uji belum tersedia (SDK/NDK tidak ada di Termux; APK dari CI).
Semua di bawah ini **sudah ditulis** dan hanya menunggu bukti dari logcat.

### I-1. Verifikasi tiga mode benar-benar berbunyi beda

**Apa.** Mode BitPerfect / DSP / Immersive sudah tersambung ke jalur produksi
(`AudioCallback::applyPipeline`), tapi `DSPChain` belum pernah benar-benar
mengeksekusi PCM di perangkat â dulu pipeline tidak pernah dipanggil sama
sekali.

**Mengapa belum.** Butuh mendengar sendiri + membaca logcat. Yang harus
dibuktikan: `input_rate == output_rate` (resampler OFF) di bit-perfect, dan
mode DSP/Immersive benar-benar mengubah suara.

**Yang membuka jalan.** APK dari CI dipasang di perangkat. Log yang dicari:
```
EngineManager  start: hasil -> laju diminta=96000 dipakai=96000 (sama=ya),
               exclusive=ya, jalur-mustahil-bit-perfect=tidak, bit-perfect=YA
```
Tombol diagnostik "Proses DSP di Jalur Audio" di settings sudah ada untuk
membandingkan dengan/tanpa DSP tanpa build ulang.

### I-2. Tuning parameter rantai Immersive

**Apa.** `ImmersiveStage` sudah memproses (Solfeggio â Harmonic â Spatial â
Brainwave), tapi nilainya dipilih dari penalaran, bukan pendengaran:
drive exciter = `resonanceIntensity * 12 dB`, depth spatial =
`resonanceIntensity * 0.5`, volume brainwave = `resonanceIntensity`.

**Mengapa belum.** Tidak bisa dituning tanpa mendengar. Risiko nyata: pada
`resonanceIntensity` tinggi, brainwave + exciter bisa menaikkan level sampai
`softClip` bekerja â dan itu terdengar sebagai distorsi, bukan efek.

**Yang membuka jalan.** Dengarkan di perangkat, catat pada intensitas berapa
mulai terdengar pecah. Kalau pecah, turunkan faktor drive atau tambahkan
headroom sebelum exciter.

### I-3. eARC / HDMI sebagai jalur bit-perfect

**Apa.** `AudioDeviceManager` menandai HDMI sebagai `supportsExclusive = true`,
jadi HDMI muncul sebagai kandidat bit-perfect di UI.

**Mengapa belum.** Penandaan itu **belum pernah diuji**. Belum jelas apakah
`setDeviceId()` pada HDMI menghasilkan jalur langsung, atau tetap lewat mixer
(eARC punya penanganan terpisah di Android yang tidak kita sentuh).

**Yang membuka jalan.** HDMI/eARC nyata + logcat `OPEN RESULT: ... api=AAudio`
dan `sharingMode`. Kalau ternyata selalu lewat mixer, `supportsExclusive` untuk
HDMI harus jadi `false` â lebih jujur daripada membiarkan UI menjanjikan.

### I-4. Codec A2DP yang sedang dipakai

**Apa.** Menampilkan codec aktif (SBC/aptX/LDAC) + bitrate di UI.

**Mengapa belum.** `BluetoothA2dp.getCodecStatus()` **bukan API publik** â
tidak ada di daftar public methods dokumentasi resmi Android
(`@SystemApi`/`@hide`). Percobaan pertama gagal compile. Yang bisa dibaca
hanya perangkat terhubung + daftar codec yang **didukung**.

**Yang membuka jalan.** Salah satu dari:
- Android menaikkan `getCodecStatus()` jadi API publik;
- app jadi system app / punya `BLUETOOTH_PRIVILEGED`;
- cukup puas dengan "codec didukung" (yang sekarang sudah ditampilkan).

**Catatan.** Jangan pernah mengarang nama codec. Kalau tidak bisa dibaca,
katakan tidak bisa dibaca â itu keputusan yang sudah diambil.

---

## Menunggu keputusan desain

### I-5. Jalur push/offline (`pushAudio` + `JSIInstaller` + `NativeAudioFeed`)

**Apa.** Seluruh sistem push sudah dibangun lengkap tapi tidak pernah
dinyalakan: `AudioEngine::pushData()`, `AudioBufferController`, cabang
fallback `AudioCallback` (`popStereo` â `mPipeline.process`),
`NativePristineAudio.pushAudio()` (JNI), `NativeAudioFeed.cpp`,
`JSIInstaller.cpp`. **Nol pemanggil dari JS.**

**Mengapa belum.** ADR-0001 memutuskan jalur pull (produksi) sebagai pemilik
logika tiga mode. Jalur push belum punya kegunaan yang disepakati â dan
menyalakannya berarti dua jalur yang harus dijaga sinkron.

**Yang membuka jalan.** Kejelasan **untuk apa** jalur push dipakai. Kandidat
yang masuk akal: analisis/verifikasi offline, render bit-perfect ke file,
atau audio dari sumber non-dekoder (stream, sintesis).

**Batas yang harus dihormati.** Kalau nanti dinyalakan, jalur push jadi
**KONSUMEN** `AudioPipeline`, bukan pemilik `DSPChain` kedua. Dua `DSPChain`
= dua state EQ = bug "EQ kadang tidak berefek" yang sulit dilacak (lihat
ADR-0002 Â§M1).

### I-6. Jalur USB host langsung ke DAC

**Apa.** Melewati Oboe sepenuhnya: buka `UsbDeviceConnection` sendiri, kirim
ISO endpoint langsung ke DAC. Ini jalur bit-perfect "terpendek" secara teori.

**Mengapa belum.** Skeleton-nya (4 kelas C++ + izin USB di manifest) sudah
dihapus 2026-10-07 karena semuanya stub dan menyesatkan (lihat
`AUDIO_OUTPUT_PATHS.md` Â§11). Perlu dibangun dari nol.

**Yang membuka jalan â dan pertanyaan yang harus dijawab dulu.** Oboe
**sudah** menangani DAC USB lewat `setDeviceId()` tanpa izin USB. Jadi
pertanyaannya bukan "bisa tidak", tapi **"apa yang didapat yang tidak bisa
didapat Oboe?"** Kalau jawabannya tidak jelas, jalur ini tidak layak dibangun.

### I-7. Migrasi `AudioMode` dari AsyncStorage ke store saja

**Apa.** Mode disimpan di AsyncStorage dengan key `audio_mode_preference`,
dibaca di tiga tempat terpisah (`_layout.tsx`, `engine.ts` Ã 2).

**Mengapa belum.** Bukan bug â tapi tiga pembaca untuk satu nilai berarti
tiga tempat yang harus ikut berubah kalau nilai keempat ditambahkan.

**Yang membuka jalan.** Kebutuhan nyata mode keempat, atau refaktor store.
Sekarang: catat saja.

### I-8. Sisa `useUSBDAC` di layar analyzer

**Apa.** `analyzer.tsx` masih memakai `useUSBDAC()` untuk `isExclusiveMode` +
`currentDAC`.

**Mengapa belum.** Duplikatnya sudah dibersihkan (`shared/hooks/useUSBDAC.ts`
+ `OutputSettings.tsx` dihapus), tapi yang di `features/hardware` masih
dipakai satu layar. Ia membaca `USBDACService.isExclusiveModeActive()` â yang
selalu melaporkan keadaan **palsu** kalau `setExclusiveMode` tidak pernah
dipanggil.

**Yang membuka jalan.** Ganti sumbernya ke `useAudioOutput()` (status jujur
dari `EngineManager`) â pekerjaan kecil, aman, tinggal dikerjakan.

---

## Menunggu kondisi teknis

### I-9. `PrebufferManager` â dead code, perbaikan sudah benar tapi tidak berefek

**Apa.** `PrebufferManager` (termasuk perbaikan `getOutputFormat()`) **nol
pemanggil** dari luar file sendiri. Kodenya benar tapi tidak pernah jalan.

**Mengapa belum diputuskan.** Bukan bug aktif. Pilihan: sambungkan (butuh
alur prebuffer di `PlaybackController`), atau hapus.

**Yang membuka jalan.** Kebutuhan nyata: kalau ada laporan gap/underrun saat
pindah trek di perangkat lambat, prebuffer jadi jawaban yang masuk akal.

### I-10. `setPreferredDevice` sebagai pelengkap `setDeviceId`

**Apa.** Android punya `AudioTrack.setPreferredDevice()` selain Oboe
`setDeviceId()`.

**Mengapa belum.** `setDeviceId()` sudah bekerja dan lebih kuat (diterapkan
saat stream dibuka). `setPreferredDevice` hanya **preferensi** yang bisa
diabaikan sistem.

**Yang membuka jalan.** Hanya kalau ada device yang terbukti mengabaikan
`setDeviceId()`. Sampai itu terjadi, menambahkannya hanya menambah jalur yang
harus dijaga.

### I-11. Ukuran buffer / latency mode di UI

**Apa.** `AudioEngineConfig` (`minBufferMs`, `maxBufferMs`, `playBufferMs`)
sudah ada di engine tapi tidak ada UI-nya.

**Mengapa belum.** Nilai default sudah bekerja. Menampilkannya sebelum ada
masalah latency nyata = kontrol yang membingungkan tanpa manfaat.

**Yang membuka jalan.** Laporan underrun/glitch pada device tertentu.

### I-12. Fitur DSP yang belum diimplementasi (9 kelas di `dsp/`)

**Apa.** Sembilan kelas di `android/app/src/main/cpp/dsp/` yang **nol pemanggil**
dari jalur produksi. Ini **bukan dead code** — ini fitur yang belum
diimplementasi, atau sudah jadi tapi belum tersambung. Jangan dihapus.

| Kelas | Keadaan | Yang membuka jalan |
|---|---|---|
| `CrossfeedProcessor` | **algoritma nyata**, belum tersambung | UI crossfeed headphone |
| `StateVariableFilter` | **implementasi nyata**, belum dipakai | filter parametrik/LPF-HPF di UI |
| `ToneControl` | **tidak bisa dikompilasi** — `BiquadFilter::setHighShelf()` tidak ada (dipanggil di baris 33). Error laten: badan member non-template hanya di-emit kalau odr-used, dan kelas ini nol pemanggil | tambah `setHighShelf()` ke `BiquadFilter` |
| `DCBlocker` | **implementasi nyata** | dipakai `OutputStage`; butuh keputusan `OutputStage` dulu |
| `ConvolverNode` + `FIRFilter` | **konvolusi nyata**, butuh IR | `IRLoader` diisi + UI pemilihan IR |
| `HeadphoneCorrection` | `loadProfile` → `true` palsu, FIR trivial | basis data profil headphone |
| `BinauralRenderer` | copy mono ke L/R, tanpa HRTF | HRTF dataset + renderer |
| `FFTResonanceAnalyzer` | akumulasi buffer; `mPlan` tak dipakai; `getDominantFrequency` → 0 | analisis spektrum nyata (FFT-nya sudah ada) |
| `PartitionedConvolver` | `prepare`/`reset` saja, **tanpa `process`** | IR panjang (reverb) |
| `IRLoader` | `// TODO:` | format IR + pemuat berkas |

**Mengapa belum.** Tidak ada jalur UI yang meminta fitur ini; `FEATURES.md`
menandainya `SEBAGIAN / belum diverifikasi` untuk `convolution/` + `headphone/`.

**Yang membuka jalan.** Permintaan fitur nyata dari sisi pengguna (koreksi
headphone, crossfeed, reverb IR). Sampai itu ada, kelas-kelas ini **tidak
merugikan** selama tidak mengaku jadi — lihat Prioritas 1 di
`DSP_CHAIN_AUDIT.md` untuk dua yang saat ini mengaku jadi
(`HeadphoneCorrection::loadProfile`, `BinauralRenderer`).

**Catatan.** `OutputStage` **bukan** bagian dari daftar ini: ia duplikat konsep
yang sudah dimiliki `DSPChain` (`GainNode` + `LimiterNode`), jadi masuk kategori
§4.3 `BOILERPLATE_AND_STUBS.md` (dua struktur paralel), bukan fitur masa depan.

### I-13. Impor profil koreksi headphone (Squiglink / AutoEQ / Viper DDC)

**Apa.** Satu mesin cascade biquad dengan beberapa parser format. Ketiga acuan
pada dasarnya mesin yang **sama** — bedanya hanya dari mana koefisien datang:

| Acuan | Bentuk data | Koefisien |
|---|---|---|
| **ViPER DDC** | `.vdc` — 5 float per filter (`b0,b1,b2,a1,a2`), `arrSize/5` filter | sudah jadi, **precomputed hanya untuk 44100 & 48000** |
| **Wavelet** | AutoEQ graphic EQ **127 band** | gain di grid tetap → turunkan koefisien |
| AutoEQ / squiglink parametric | `Fc / Q / Gain / tipe` (`PK`/`LSC`/`HSC`) | hitung saat runtime |

**Biaya CPU** (5 mult/sample/biquad × 2 ch @ 48 kHz):

| Pendekatan | Filter | Mult/detik | State |
|---|---|---|---|
| Graphic 127-band | 127 | **61.0 M** | 6.9 KB |
| Parametric | 5-16 | **2.4-7.7 M** | ~0.5 KB |

127-band **8-25× lebih mahal** dan kurang akurat: `Fc` dibulatkan ke grid 127
titik, jadi filter presisi (mis. notch 6.3 kHz) meleset. Parametric menaruh
filter tepat di `Fc` yang diminta.

**Keunggulan yang sudah kita punya.** Viper DDC hanya punya 2 set koefisien
(44.1k & 48k) karena `.vdc` menyimpan koefisien **statis**. Kita menghitung
koefisien saat runtime dengan laju stream **nyata** (`EQNode::prepare(sampleRate)`,
diperbaiki 2026-10-10) — jadi berlaku untuk 44.1/48/88.2/96/176.4/192 kHz tanpa
tabel tambahan.

**Mengapa ini layak.** `docs/archive/ConsolidationV2.md` (F2, 15 Sep) sudah
menetapkannya sebagai diferensiasi: **AutoEQ Import — Wavelet ⚠️ Manual · V4A
✅ Manual · PristineAudio ✅ Built-in**. Dokumen itu juga mencatat kenapa
built-in lebih *benar*, bukan sekadar lebih mudah:

```
Player (AudioTrack) → AudioFlinger Mixer ← V4A/Wavelet inject DI SINI
                      → Audio HAL → DAC
```

Implikasi yang dicatat di sana: kalau volume < 100%, sample **sudah di-scale
sebelum DSP**; notifikasi ter-mix dengan musik. Pipeline Oboe milik Pristine
berada **sebelum** mixer, di dalam proses sendiri.

**Blocker.** `BiquadFilter` tidak punya `setHighShelf()` — `ToneControl.h:33`
memanggilnya dan **gagal dikompilasi** (error laten: badan member non-template
hanya di-emit kalau odr-used). Preset AutoEQ/squiglink hampir selalu memuat `HSC`.
Harus ditutup lebih dulu. Sudah diverifikasi bahwa `ToneControl` satu-satunya
dari 15 header `dsp/` yang bermasalah; CMake memakai `GLOB_RECURSE` sehingga
seluruh 24 `.cpp` di `dsp/` ikut dikompilasi.

**Preamp wajib.** Preset AutoEQ selalu menyertakan preamp negatif (mis.
−6.8 dB) justru karena band di-boost. Tanpa itu limiter bekerja terus.

**Mengapa belum.** Fitur baru, bukan perbaikan wiring: parser, storage, UI
pemilihan. `HeadphoneCorrection` sekarang berbentuk **FIR**
(`applyFIR()`, `mFilterLeft: vector<float>`) — bentuk untuk impulse response,
bukan parametric. Untuk Squiglink komponennya harus diubah bentuk.

**Yang membuka jalan.** Keputusan operator soal (1) format impor pertama,
(2) posisi di chain — sebelum user EQ 10-band atau menggantikannya,
(3) database profil bawaan vs murni impor berkas.

**Catatan.** Koreksi headphone mengubah sinyal, jadi hanya boleh aktif di mode
DSP/Immersive — **tidak** di BitPerfect.

---

## Catatan: ide yang sudah dinilai dan ditolak

Ditulis supaya tidak muncul lagi sebagai ide baru.

| Ide | Alasan ditolak |
|---|---|
| Membangun autodetect device/DAC | **Sudah ada** dan sudah jalan: `DeviceRateDetector` + `AudioDeviceManager`, tersambung ke `AudioEngine::start()`. Yang dulu putus adalah penyaluran laju FILE, bukan deteksinya. |
| Menghapus `modes/*` karena "0 referensi" | Orphan **bukan** alasan menghapus. `modes/*` adalah scaffolding yang sengaja disiapkan; perilakunya diadopsi ke `AudioPipeline` (ADR-0001). |
| Menambah `ImmersivePipeline` sebagai kelas terpisah kembali | Membuat dua pemilik `DSPChain` â dua state EQ (ADR-0002 Â§M1). |
| Chromecast/DLNA/AirPlay | Bukan bug â fitur memang belum ada. Dan casting = re-encode + jaringan, jadi bukan jalur bit-perfect. |
| `AudioRouteManager` (routing) | Nama menjanjikan routing, isi cuma stub yang selalu `return true`. Dihapus 2026-10-07. Bilangan Android tidak punya API "paksa routing sekarang"; `setDeviceId()` sudah yang terkuat. |
