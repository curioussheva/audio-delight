# PristineAudio - Threat Model - Dokumen kerja untuk memandu keputusan implementasi keamanan. Bukan audit keamanan formal - tapi acuan minimum, dengan status eksplisit per mitigasi.

> **Diverifikasi 2026-10-03** langsung ke `app.json` dan `android/app/src/main/AndroidManifest.xml`.
> Tanda status: `ADA` (terverifikasi) - `SEBAGIAN` - **`BELUM`** - `?` belum diverifikasi.
>
> **Konteks penting:** PristineAudio adalah **pemutar audio lokal**. Tidak ada akun, tidak ada backend, tidak ada data pribadi yang sensitif. Asetnya adalah **file audio milik pengguna** dan **integritas perangkat**. Threat model-nya karena itu berbeda dari aplikasi investigasi: yang dipertaruhkan bukan kerahasiaan data, melainkan **permukaan izin**.

---

## 1. Aset yang Dilindungi - **File audio pengguna** - koleksi musik, rekaman pribadi, audiobook
- **Integritas perangkat** - aplikasi pemutar punya jalur langsung ke media dan storage
- **Data cache aplikasi** - artwork, hasil scan, state playback
- **Tidak ada**: kredensial, token, data lokasi, kontak, pesan. Ketiadaannya disengaja.

## 2. Permukaan Izin - Temuan Terukur

**Ini temuan utama dokumen ini.** Ada selisih antara izin yang dideklarasikan di `app.json` (11) dan yang benar-benar ada di `AndroidManifest.xml` hasil build (17+). Yang masuk lewat manifest berasal dari plugin pihak ketiga.

| Izin | Di `app.json` | Di Manifest | Penilaian |
|---|---|---|---|
| `INTERNET` | ya | ya | **Perlu. Tidak dibutuhkan.** Pemutar lokal tidak perlu jaringan - kecuali ada fitur yang belum ditemukan |
| `MODIFY_AUDIO_SETTINGS` | ya | ya | wajar |
| `RECORD_AUDIO` | ya | ya | **Pertanyakan.** Visualizer membaca buffer output, tidak perlu mikrofon |
| `FOREGROUND_SERVICE` | ya | ya | wajar (playback background) |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | ya | ya | wajar |
| `WAKE_LOCK` | ya | ya | wajar |
| `RECEIVE_BOOT_COMPLETED` | ya | ya | bisa dipertanyakan - untuk resume playback? |
| `POST_NOTIFICATIONS` | ya | ya | wajar (media notification) |
| `READ_MEDIA_AUDIO` | ya | ya | wajar |
| `READ_EXTERNAL_STORAGE` | ya | ya (maxSdk 32) | wajar untuk Android lama |
| `WRITE_EXTERNAL_STORAGE` | ya | ya | **Tidak dibutuhkan** untuk pemutar |
| `READ_MEDIA_IMAGES` | - | ya | **tidak disengaja** - dari plugin, bukan deklarasi |
| `READ_MEDIA_VIDEO` | - | ya | **tidak relevan sama sekali** |
| `READ_MEDIA_VISUAL_USER_SELECTED` | - | ya | **tidak relevan** |
| `ACCESS_MEDIA_LOCATION` | - | ya | **akses GPS foto** - tidak relevan untuk pemutar audio |
| `MANAGE_EXTERNAL_STORAGE` | - | ya | **izinkan SEMUA file.** Izin paling berat di Android; tidak dibutuhkan |
| `VIBRATE` | - | ya | dampak rendah |

**Kesimpulan:** `MANAGE_EXTERNAL_STORAGE` dan `ACCESS_MEDIA_LOCATION` adalah dua yang paling perlu dipertanyakan. Keduanya tidak muncul di `app.json` - artinya tidak ada yang memutuskan memasangnya secara sadar.

## 3. Skenario Ancaman

| Skenario | Deskripsi | Status mitigasi |
|---|---|---|
| **Android auto backup mengirim data ke Google** | Data app ter-backup otomatis ke cloud | **BELUM.** `allowBackup="true"` di `AndroidManifest.xml:52`. Persona mematikan ini; PristineAudio tidak. |
| **Lalu lintas HTTP plaintext** | Trafik tidak terenkripsi, bisa diintip | **BELUM.** `usesCleartextTraffic="true"` (`AndroidManifest.xml:56`, juga di `app.json` `expo-build-properties`). Untuk pemutar lokal seharusnya `false`. |
| Aplikasi lain membaca file pengguna | Aplikasi lain mengakses storage | SEBAGIAN. Dengan `MANAGE_EXTERNAL_STORAGE` permukaannya lebih lebar dari yang diperlukan; scoped storage (`READ_MEDIA_AUDIO`) seharusnya cukup. |
| Izin mikrofon disalahgunakan | `RECORD_AUDIO` dideklarasikan padahal tidak merekam | **BELUM.** Belum ada audit apakah ada kode yang memakainya. |
| File audio keluar device tanpa diminta | Sharing / upload tak terduga | SEBAGIAN. `expo-sharing` terpasang; ada intent filter `VIEW` + `SEND`. Perilaku aktual belum diverifikasi. |
| APK dimodifikasi pihak ketiga | Aplikasi tidak bertanda tangan | **BELUM.** Tidak ada konfigurasi signing rilis di repo, nol git tag. |
| Device di-root / forensik tingkat lanjut | Penyerang punya akses penuh ke storage | **Di luar cakupan** - tidak ada model ancaman untuk ini. |

## 4. Non-Goals (sengaja tidak ditangani) - **Enkripsi library audio.** File milik pengguna, di storage pengguna, dibaca oleh pemutar. Enkripsi di sini merusak interoperabilitas dengan player lain tanpa manfaat nyata.
- **Anti-tamper / root detection.** Tidak ada aset bernilai yang memerlukan proteksi itu.
- **Sandbox proses tambahan.** Mengandalkan sandbox Android standar.

## 5. Urutan penutupan (risiko per satuan usaha)

1. `allowBackup="true"` -> `false` - satu baris di config plugin
2. `usesCleartextTraffic="true"` -> `false` - satu baris
3. Hapus `MANAGE_EXTERNAL_STORAGE` dan `ACCESS_MEDIA_LOCATION` dari manifest hasil build
4. Audit `RECORD_AUDIO`: hapus kalau memang tidak ada perekaman
5. Hapus `INTERNET` **kalau** tidak ada fitur jaringan sama sekali (perlu diverifikasi dulu - update checker atau artwork online akan memerlukannya)

Semua ini **penyempitan permukaan**, bukan penambahan fitur. Tidak ada yang bisa dikerjakan dengan aman sebelum ada verifikasi device (`ROADMAP.md` Fase 1), karena tanpa itu tidak bisa dibuktikan perubahannya tidak merusak fungsi.

## 6. Residual Risk - Yang tetap ada meski semua di atas ditutup:

- **Storage bersama.** File audio pengguna ada di storage bersama; aplikasi lain dengan `READ_MEDIA_AUDIO` bisa membacanya. Ini batasan Android, bukan cacat aplikasi.
- **Tidak ada verifikasi device.** Seluruh dokumen ini berbasis pembacaan konfigurasi, bukan perilaku runtime. Manifest yang tampak benar bisa berbeda dari yang dijalankan.
