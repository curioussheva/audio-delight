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
