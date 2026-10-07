# Boilerplate & Stub: Aturan Penulisan

**Status:** berlaku sejak 2026-10-07
**Konteks:** `docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md`, `AGENTS.md` (aturan docs)

---

## 1. Dua pendekatan, dan yang dipakai proyek ini

| | **Minimal working** | **Boilerplate lengkap** |
|---|---|---|
| Kontrak berasal dari | kode yang sudah jalan | struktur yang dirancang |
| Yang dijaga | tidak ada fitur yang berbohong | bentuk arsitektur tetap utuh |
| Bahaya khas | arsitektur tumbuh tak terencana | **stub yang mengaku jadi** |
| Sulit dideteksi | utang arsitektur (muncul nanti) | **utang kejujuran** (muncul sekarang, tapi tidak ada yang error) |

Pristine memakai **boilerplate lengkap**. Itu keputusan yang benar: engine audio
193 file C++ dengan tiga mode tidak bisa dibentuk dengan menambah fitur satu per
satu. Tapi harga dari pendekatan ini persis satu hal: **wajib ada pelacakan mana
node yang nyata dan mana yang belum.**

Tanpa pelacakan, boilerplate lengkap menghasilkan kode yang *terlihat* tersedia
padahal tidak ada. Itu sudah terjadi tiga kali (ÃÂÃÂ§4).

---

## 2. Aturan stub: kosong boleh, bohong tidak

Stub boleh tidak melakukan apa pun. Stub **tidak boleh** mengembalikan sukses.

```cpp
// BENAR - kosong adalah spesifikasi, bukan kelalaian
void BitPerfectPipeline::process(...) {
    // INTENTIONALLY EMPTY -- no EQ, no gain, no limiter.
    // Bypass total adalah PERILAKU yang benar untuk mode ini.
}

// SALAH - selalu sukses, tidak menyentuh apa pun
bool USBDACModule::setExclusiveMode(const char* id, bool on) {
    return true;   // tak ada yang bisa mendeteksi ini bohong
}
```

```kotlin
// BENAR - gagal dengan berisik
@ReactMethod
fun setExclusiveMode(dacId: String, enable: Boolean, promise: Promise) {
    promise.reject("NOT_IMPLEMENTED",
        "setExclusiveMode belum tersambung ke engine. Pakai NativeDSPModule.setExclusiveMode.")
}

// SALAH
@ReactMethod
fun setExclusiveMode(dacId: String, enable: Boolean, promise: Promise) {
    promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
}
```

**Kegagalan yang berisik jauh lebih murah daripada sukses palsu yang sunyi.**
Sukses palsu menghasilkan bug kejujuran: UI menampilkan keadaan yang tidak ada,
dan tidak ada satu baris log pun yang membantah.

### 2a. Pengecualian yang disengaja

Kalau sukses palsu memang diperlukan sementara (mis. agar UI tidak crash di
tengah migrasi), **wajib** diberi penanda yang bisa digrep:

```kotlin
private const val STUB_SILENT = true   // TODO(stub): hapus setelah tersambung
```

dan dicatat di ÃÂ¯ÃÂ¸ÃÂ ÃÂÃÂ§3 tabel status. Tanpa penanda, ia berubah dari "stub
sementara" jadi "kebohongan permanen".

---

## 3. Setiap node penghubung wajib punya status eksplisit

Tiga keadaan, tidak lebih:

| Status | Artinya | Cara membuktikan |
|---|---|---|
| **NYATA** | dipanggil dari jalur produksi, punya efek | ada jalur pemanggilan + efek terverifikasi |
| **STUB** | sengaja belum diisi, jujur soal itu | sumber menyatakan belum; gagal dengan berisik |
| **PUTUS** | seharusnya nyata, tapi tidak tersambung | ada pemanggil, tapi efeknya nol |

**Bukti yang sah hanya satu: ada jalur pemanggilan dari jalur produksi.**

Bukan: filenya ada. Bukan: terkompilasi. Bukan: ada referensi nama di file lain
(referensi di komentar tidak dihitung). Aturan ini sudah tertulis di `AGENTS.md`
ÃÂ¢ÃÂÃÂ *"`[x]` berarti ada pemanggil nyata, bukan filenya ada"*.

### 3a. Cara memisahkan "didefinisikan" dari "dipakai"

```bash
# grep nama kelas di seluruh cpp/, lalu buang file yang namanya sama dengan
# kelasnya. Sisanya = referensi nyata. Lalu PERIKSA apakah referensi itu
# kode atau komentar.
```

Contoh yang menipu: `BitPerfectPipeline` dan `DSPPipeline` muncul di grep, tapi
hanya sebagai **komentar** di `FFmpegDecoder.cpp`. `DSPPipeline` juga muncul di
TS ÃÂ¢ÃÂÃÂ itu kelas JS yang berbeda, bukan C++-nya. Grep mentah tidak cukup.

---

## 4. Tiga kegagalan nyata (dan pelajarannya)

### 4.1 `return` yang terlalu cepat ÃÂ¢ÃÂÃÂ cara paling halus membunuh fitur

```cpp
if (mPlaybackController) {
    mPlaybackController->render(output, numFrames, 2, mSampleRate);
    return oboe::DataCallbackResult::Continue;   // ÃÂ¢ÃÂÃÂ keluar di sini, selalu
}
...
mPipeline.process(mLeft, mRight, numFrames, mParams);   // tidak pernah tercapai
```

Seluruh struktur tiga mode ada, terkompilasi, terdokumentasi di
`ARCHITECTURE.md` ÃÂ¢ÃÂÃÂ dan **tidak pernah dijalankan sedetik pun**. Tidak ada
error, tidak ada warning. Yang hilang hanya efeknya.

**Pelajaran:** untuk setiap kelas yang tampak penting, buktikan ada jalur
pemanggilan dari jalur produksi ÃÂ¢ÃÂÃÂ jangan berhenti di "ada referensi".

### 4.2 Stub yang "selalu sukses" menyembunyikan jalur yang salah

`USBDACModule.kt` tidak punya JNI sama sekali (nol `external fun`), tapi
`setExclusiveMode` mengembalikan `{ success: true }`. Dua hook berbeda
memakainya untuk menyalakan "bit-perfect". User tidak pernah dapat bit-perfect,
dan tidak ada satu pun error di seluruh sistem.

**Cara mendeteksi cepat:** grep `external fun` di file Kotlin yang dicurigai.
Kalau nol, seluruh `@ReactMethod`-nya adalah stub ÃÂ¢ÃÂÃÂ apa pun yang diklaimnya.

### 4.3 Dua struktur paralel untuk hal yang sama

`cpp/modes/*` (3 kelas) dan `core/AudioPipeline` sama-sama mendefinisikan tiga
mode. Yang dipakai jalur produksi adalah `AudioPipeline`; `modes/*` tidak
pernah tersambung. Dua pemilik konsep yang sama, dan **tidak ada cara
menentukan mana yang berlaku** kecuali membaca keduanya.

Termasuk kasus yang lebih halus: `modes/DSPPipeline` punya `DSPChain` sendiri
sementara `AudioPipeline` juga punya. Kalau keduanya dipakai, ada dua instans
state EQ ÃÂ¢ÃÂÃÂ EQ yang diset satu jalur dibaca jalur lain, muncul sebagai
*"EQ kadang tidak berefek"*.

**Pelajaran:** satu konsep, satu pemilik. Kalau butuh dua bentuk (mis. jalur
pull vs push), yang kedua jadi **konsumen** yang pertama, bukan pemilik kedua.

---

## 5. Checklist sebelum menambah node penghubung

1. **Siapa pemanggilnya dari jalur produksi?** Kalau belum ada, tulis node itu
   sebagai STUB dengan kegagalan berisik ÃÂ¢ÃÂÃÂ jangan sebagai API yang mengaku jadi.
2. **Apakah ada struktur lain yang sudah memegang konsep ini?** Kalau ya,
   periksa dokumentasi dulu dan **konfirmasi** sebelum menambah yang kedua.
3. **Kalau node ini gagal, apa yang terjadi pada audio?** Syarat produk:
   audio tetap berbunyi. Mode hanya menentukan pemrosesan; kegagalan jalur
   dilaporkan, tidak memblokir.
4. **Bagaimana statusnya bisa dibuktikan?** Kalau jawabannya hanya "kodenya
   ada", itu belum bukti ÃÂ¢ÃÂÃÂ tambahkan jalur pemanggilan atau jadikan STUB.
5. **Apakah kegagalannya berisik?** Kalau tidak, perbaiki dulu sebelum commit.

---

## 6. Aturan proses (bukan aturan kode)

**Periksa dokumentasi ÃÂ¢ÃÂÃÂ konfirmasi ÃÂ¢ÃÂÃÂ baru kerjakan.**

Ini berlaku untuk setiap perubahan desain atau rencana. Kesalahan 2026-10-07:
`cpp/modes/` dihapus dengan alasan "nol referensi", padahal
`docs/archive/README.md` sudah menyatakan eksplisit *"orphan TIDAK berarti harus
dihapus"* dan menyebutnya *"pilihan desain, bukan sekadar cleanup"*. Urutannya
terbalik ÃÂ¢ÃÂÃÂ dokumentasi diperiksa **sesudah** menghapus.

**Apa pun yang belum dibuktikan di perangkat harus disebut belum dibuktikan.**
Terverifikasi-compile ÃÂ¢ÃÂÃÂ¡ terverifikasi-berfungsi. Statement "check.sh 5/5 lulus"
sah; statement "tiga mode bekerja" tidak, sampai ada log dari device.
