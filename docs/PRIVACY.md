# PristineAudio - Privacy

Data apa yang diproses di device, apa yang keluar, dan izin apa yang diminta.

> **Diverifikasi 2026-10-03** ke `app.json` dan `android/app/src/main/AndroidManifest.xml`.

---

## 1. Prinsip

**PristineAudio adalah pemutar musik lokal.** Tidak ada akun pengguna, tidak ada backend, tidak ada analitik, tidak ada pelacakan. Aplikasi ini tidak punya tempat untuk mengirim data ke, dan itu disengaja.

## 2. Data yang Diproses Sepenuhnya di Device (tidak pernah dikirim)

| Data | Lokasi | Keterangan |
|---|---|---|
| File audio | Storage pengguna | Dibaca untuk diputar; tidak pernah disalin keluar |
| Metadata lagu (judul, artis, album, durasi) | SQLite lokal | Hasil scan MediaStore |
| Artwork | Cache aplikasi | Diambil dari file audio itu sendiri |
| Playlist | SQLite lokal | Dibuat pengguna, tetap di device |
| Favorit | SQLite lokal | |
| Preset equalizer | Penyimpanan lokal | |
| Pilihan tema | AsyncStorage | Key `@pristineaudio/theme_id` |
| State playback terakhir | Penyimpanan lokal | Untuk resume |

## 3. Data yang Berkomunikasi ke Pihak Luar

**Tidak ada yang terverifikasi.** Tapi manifest mendeklarasikan `INTERNET`, dan `usesCleartextTraffic="true"` aktif. Kalau memang ada lalu lintas jaringan, itu **belum teridentifikasi dari kode**.

| Kemungkinan | Status |
|---|---|
| Pengecekan update | **Belum diverifikasi.** Tidak ditemukan kode update checker di `src/`, tapi izin `INTERNET` ada |
| Pengambilan artwork online | **Belum diverifikasi.** Artwork diambil dari tag file lokal di kode yang terbaca |
| Telemetri / crash reporting | **Tidak ada.** Tidak ada SDK analitik di `package.json` |

**Tindakan yang benar:** audit mengapa `INTERNET` ada. Kalau tidak ada fitur yang membutuhkannya, hapus izinnya. Lihat `THREAT_MODEL.md` bagian 5.

## 4. Izin yang Diminta

Sumber kebenaran ada di `android/app/src/main/AndroidManifest.xml` hasil build, **bukan** `app.json` - keduanya berbeda. Lihat `THREAT_MODEL.md` bagian 2 untuk tabel lengkap 17 izin dan penilaiannya.

Yang **jelas diperlukan** untuk pemutar audio lokal:

- `READ_MEDIA_AUDIO` - membaca file audio
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` - playback background
- `POST_NOTIFICATIONS` - notifikasi kontrol media
- `WAKE_LOCK` - cegah CPU tidur saat memutar
- `MODIFY_AUDIO_SETTINGS` - kontrol audio

Yang **perlu dipertanyakan**:

- `INTERNET` - tidak jelas untuk apa
- `RECORD_AUDIO` - visualizer membaca buffer output, bukan mikrofon
- `WRITE_EXTERNAL_STORAGE` - pemutar tidak menulis ke storage bersama
- `MANAGE_EXTERNAL_STORAGE` - izin akses SEMUA file, tidak dibutuhkan
- `ACCESS_MEDIA_LOCATION` - akses GPS foto, tidak relevan untuk audio
- `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_VISUAL_USER_SELECTED` - masuk lewat plugin pihak ketiga

## 5. Backup Otomatis

**`android:allowBackup="true"`** (`AndroidManifest.xml:52`).

Artinya Android **dapat** memasukkan data aplikasi ke backup otomatis (Google Drive) kalau pengguna mengaktifkannya. Untuk aplikasi pemutar dengan playlist dan preferensi, dampaknya kecil - tapi ini keputusan yang belum pernah diambil secara sadar, dan persona mematikan setelan yang sama.

## 6. Retensi & Penghapusan

- Data aplikasi hilang saat aplikasi di-uninstall (kecuali backup otomatis aktif - lihat bagian 5).
- Tidak ada akun, jadi tidak ada proses penghapusan data terpusat.
- Cache dibersihkan lewat `clearCache` (`NativePlaybackService.kt:210`, dipanggil dari `_layout.tsx:73`).

## 7. Kepatuhan

- **GDPR / CCPA:** Tidak ada data pribadi yang dikumpulkan, diproses, atau dikirim. Tidak ada dasar untuk pelaporan data.
- **Izin sensitif:** `MANAGE_EXTERNAL_STORAGE` dan `ACCESS_MEDIA_LOCATION` menarik perhatian saat tinjauan Play Store. Keduanya sebaiknya dihapus sebelum submission.

## 8. Yang belum diverifikasi

Dokumen ini berbasis pembacaan konfigurasi dan kode. **Tidak ada verifikasi runtime.** Kalau aplikasi benar-benar di-build dan dijalankan, periksa lalu lintas jaringan dengan proxy untuk memastikan tidak ada yang keluar tanpa sepengetahuan. Itu perlu device, yang belum tersedia (`TESTING.md` bagian 6).
