# PristineAudio - Competitive Landscape

Analisis posisi PristineAudio terhadap pemutar audio Android yang mapan, per Oktober 2026. Titik beratnya bukan daftar kompetitor, melainkan satu pertanyaan: **lapisan mana yang sudah setara, mana yang tertinggal, dan mana yang tidak bisa dikejar.**

Ini justifikasi untuk `ROADMAP.md` - alasan kenapa urutannya seperti itu ada di sini.

Sumber: halaman Play Store resmi tiap aplikasi, situs produk, diskusi Head-Fi/AudioScienceReview (April-Juli 2026), dan pembacaan kode PristineAudio sendiri.

> **Prinsip dokumen ini:** klaim "sudah setara" harus bisa dibuktikan di kode. Kalau sebuah paritas hanya ada di kertas, ia masuk kolom **belum terbukti**, bukan **setara**.

---

## 1. Posisi apa yang sedang diperjuangkan

**Jangan posisikan PristineAudio sebagai "pemutar musik".** Pasar itu sudah penuh dan matang. Yang membedakan PristineAudio secara arsitektur adalah kombinasi:

1. **BitPerfect sebagai default, bukan opsi.** DSP dilewati kecuali pengguna memintanya. Kompetitor cenderung DSP-aktif secara default.
2. **20 tema** - jauh di atas kompetitor (Poweramp punya beberapa skin; UAPP dan Neutron praktis satu tampilan).
3. **Dikembangkan penuh dari nol** - engine audio C++ sendiri (193 file), bukan pembungkus Android MediaPlayer atau ExoPlayer.

Dua yang pertama adalah keunggulan nyata. Yang ketiga menarik secara teknis, tapi **belum terbukti** dan itu penting untuk ditulis apa adanya.

## 2. Pembanding yang relevan

| Aplikasi | Model harga | Basis teknis | Posisi |
|---|---|---|---|
| **USB Audio Player PRO (UAPP)** | ~$4,99 sekali + plugin | Bypass penuh Android audio stack, driver USB sendiri | Pemenang polling Head-Fi Apr 2026 (60% dari 30 suara) untuk "kualitas suara file lokal" |
| **Neutron Music Player** | ~990 RUB sekali | Engine in-house 32/64-bit, DSP terdalam (EQ parametrik 4-70 band) | "Terbaik secara sonik" menurut konsensus forum; UI dikritik keras |
| **Poweramp** | ~790 RUB sekali | OpenSL ES/AAudio, 64-band EQ parametrik, skin | "Gold standard" untuk UI & fitur; kualitas suara dinilai rata-rata |
| **Onkyo HF Player** | Gratis + langganan | MusiQ upscaling | Segmen berbeda |
| **VLC / Musicolet / Phonograph** | Gratis | Pemutar umum | Bukan pembanding langsung |

## 3. Sudah setara (paritas yang bisa dibuktikan)

| Kemampuan | Standar industri | Status PristineAudio |
|---|---|---|
| **Playback bit-perfect** | UAPP, Neutron | **Arsitektur sudah ada** - mode `BitPerfect` sebagai default di `cpp/modes/`, DSP di-bypass via `patch_default_bypass_dsp.py` |
| **Output ke USB DAC** | UAPP (jadi alasan utama pembelian), Neutron | **Kode ADA** - `cpp/usb/` (8 file): `USBDeviceManager`, `USBDACCapabilities`, `USBClockSync`, `USBStreamSession` + UI pemilih output |
| **Equalizer** | Poweramp (64 band), Neutron (4-70 band parametrik) | **ADA, tapi lebih sederhana** - `cpp/dsp/EQProcessor.cpp`, UI equalizer + preset. Jumlah band **belum diverifikasi** |
| **Foreground service / playback background** | Semua | **ADA** - commit `feat(playback): foreground service lengkap` |
| **MediaSession & lock screen** | Semua | **ADA** - commit `feat: sync MediaSession metadata & playback state dari JS` |
| **Visualizer / spektrum** | Poweramp, Neutron | **ADA** - `cpp/fft/` (11 file) + `features/visualizer/` (15 file), render Skia |
| **Dukungan format** | Neutron (semua + DSD), UAPP (PCM 384k, DSD512, MQA) | **SEBAGIAN** - `FFmpegDecoder` + `PCMDecoder`; **DSD dan MQA belum diverifikasi** apakah didukung |
| **Jumlah tema** | Poweramp: beberapa skin | **UNGGUL** - 20 tema tanpa tema yatim |

## 4. Tertinggal jauh

| Kemampuan | Standar industri | PristineAudio | Jarak |
|---|---|---|---|
| **DSD / DoP / DXD** | Neutron: DSD256/DXD. UAPP: DSD512 | Tidak ditemukan kode DSD | Besar |
| **MQA** | UAPP (plugin), Onkyo (Tidal Masters) | Tidak ada | Penuh |
| **EQ parametrik per channel** | Neutron: 4-70 band, per channel | EQ ada, parametrik penuh **belum diverifikasi** | Sedang-besar |
| **Gapless playback** | Neutron, UAPP | **Belum diverifikasi** - tidak ada yang menguji | - |
| **PCM to DSD real-time** | Neutron | Tidak ada | Penuh |
| **Sumber jaringan (SMB/DLNA/UPnP)** | Neutron, UAPP | Tidak ada. Aplikasi ini sengaja lokal | Bukan target |
| **Streaming (Tidal/Qobuz)** | Neutron, UAPP | Tidak ada | Bukan target |
| **Android Auto** | Poweramp, Neutron, Phonograph | Tidak ada | Sedang |
| **Tag editing** | Neutron | Tidak ada | Sedang |
| **Kedewasaan & stabilitas** | Rilis bertahun-tahun, jutaan pengguna | Nol git tag, nol riwayat rilis, belum pernah diverifikasi di device | **Terbesar** |

## 5. Yang tidak bisa dikejar

Bagian ini paling penting untuk perencanaan. Gap di bagian 4 sebagian masalah kode; tiga hal ini bukan.

### 5.1 Kepercayaan atas kualitas suara - tidak bisa diklaim, hanya bisa dibuktikan

Konsensus komunitas audiophile (Head-Fi, ASR) sangat spesifik: **UAPP dan Neutron menang karena terbukti bypass Android audio stack dan menghasilkan output bit-perfect yang terukur.** Klaim "bit-perfect" tanpa pengukuran tidak diterima audiens ini.

PristineAudio punya arsitekturnya. **Yang belum punya: bukti apa pun.** Tidak ada pengukuran, tidak ada perbandingan, tidak ada verifikasi device. Di segmen ini, klaim tanpa bukti lebih buruk daripada tidak mengklaim.

Ini **tidak bisa** diselesaikan dengan menulis lebih banyak kode. Butuh device, perangkat ukur, dan waktu.

### 5.2 Kedewasaan rilis - tidak bisa dibeli dengan jam kerja

Neutron merilis 2.28.3 (Apr 2026) setelah bertahun-tahun. UAPP, Poweramp sama. Bug mereka sudah ketemu dan diperbaiki oleh ribuan pengguna.

PristineAudio: `versionCode: 1`, `versionName: "1.0.37"`, **nol git tag**, dan tidak satu pun pernah dijalankan di device. Gap ini tidak bisa ditutup dengan sprint; ia harus dilalui.

### 5.3 Dukungan format = keputusan dependensi, bukan fitur

DSD512 dan MQA butuh dekoder berlisensi dan jalur USB khusus (native DSD, DoP). Neutron dan UAPP menghabiskan bertahun-tahun untuk itu. Menambahkannya ke PristineAudio adalah proyek tersendiri, bukan milestone.

## 6. Penghalang sebenarnya: verifikasi, bukan fitur

**Ini pelajaran yang harus mengikat roadmap ke depan.**

Fitur baru di PristineAudio tidak sulit ditambah. Engine audio sudah punya 193 file C++, UI sudah lengkap, tema sudah 20. Menambah fitur adalah pekerjaan biasa.

**Yang tidak bisa dilakukan dari lingkungan pengembangan ini: membuktikan apa pun berjalan.** `adb devices` kosong, tidak ada emulator, tidak ada Android SDK/NDK, build native hanya lewat CI.

Konsekuensinya konkret:

- Setiap fitur yang ditulis tanpa verifikasi device adalah **satu klaim yang belum dibuktikan**
- Sudah ada bukti kelas bug yang lolos semua gerbang otomatis: `initPlaybackModule()` **kompilasi bersih dan tidak pernah dipanggil**. Typecheck lulus, build lulus, fitur mati (`TROUBLESHOOTING.md` pola #9)
- Persona mengalami penyakit identik (klaim > kenyataan) dan butuh 2 sesi untuk memperbaikinya

> **Aturan yang mengikat:** tiap kapabilitas baru yang ditulis tanpa verifikasi device adalah satu klaim yang belum dibuktikan. Makin banyak fitur, makin besar permukaan klaim. **Selesaikan kanal verifikasi device dulu, baru tambah skala.**

## 7. Urutan realistis

Diurutkan berdasarkan **nilai per satuan usaha**, dengan syarat bagian 6 dipenuhi lebih dulu.

### Fase A - buktikan yang sudah ada

1. **Verifikasi device** untuk playback, tiga mode, USB DAC, scan library. Ini satu-satunya yang menahan klaim "berfungsi" (`ROADMAP.md` Fase 1).
2. **Buktikan BitPerfect benar-benar bypass** - pengukuran, bukan asersi. Ini klaim paling berharga dan paling rapuh.
3. **Ukur** latensi, underrun, jitter USB. Tanpa angka, tidak ada yang bisa dibandingkan dengan UAPP/Neutron.

### Fase B - tutup gap (masalah kode murni)

4. **Gapless playback** - verifikasi lalu perbaiki. Ini ekspektasi dasar di segmen ini.
5. **EQ parametrik penuh** - perluas `EQProcessor` kalau perlu. Ini yang membuat Neutron menang secara teknis.
6. **Android Auto** - audiens target banyak memakainya.

### Fase C - butuh keputusan besar

7. **DSD / DoP** - hanya kalau ada audiens nyata. Proyek tersendiri.
8. **MQA** - berlisensi; kemungkinan besar tidak layak untuk proyek solo.

### Ditinggalkan

9. **Streaming (Tidal/Qobuz)** - bertentangan dengan seluruh alasan DSP bypass jadi default. Kalau ditambahkan, proposisinya berubah.
10. **Sumber jaringan (SMB/DLNA)** - Neutron dan UAPP menang di sini; mengejar mereka di domain itu adalah strategi yang kalah dari awal.

## 8. Posisi yang defensible

PristineAudio **tidak akan pernah** menjadi "Neutron dengan UI bagus" - itu mengejar pemimpin pasar di bidang kekuatan mereka. Yang bisa dipertahankan:

- **BitPerfect sebagai default, dengan bukti terukur** - bukan sebagai mode yang harus dinyalakan
- **20 tema** - tidak ada kompetitor yang mendekati ini
- **Pemutar lokal yang tidak menyentuh jaringan** - privasi sebagai fitur, bukan kekurangan

Pernyataan jujur tentang posisi sekarang: **mesin audio yang ambisius dengan 193 file C++, UI yang matang, dan nol bukti bahwa ada yang berjalan.** Gap terbesar bukan fitur yang hilang - ia adalah jarak antara "kodenya ada" dan "sudah dibuktikan".
