# Verifikasi Perbaikan content:// (Playback Gagal Trek ke-6)

Perbaikan ini **belum terverifikasi di device**. Perubahan native butuh build
ulang APK. Dokumen ini berisi langkah verifikasinya.

Latar belakang bug: `docs/LOGCAT_2026-10-04_12-18.md`, temuan utama.

## Ringkasan perbaikan

| Lapis | Sebelum | Sesudah |
|---|---|---|
| Dekoder | `avformat_open_input("content://...")` selalu gagal | `ContentUriResolver` menyalin isi ke cache, FFmpeg dapat jalur file |
| Resolusi | `MAX_PRE_RESOLVE=5`, 43 entri sisanya `content://` mentah | Dekoder resolve sendiri, tidak bergantung pada JS |
| `nativePlay` | `void` - kegagalan hilang | `jboolean` - kegagalan dipropagasi |
| `play()` JS | hasil diabaikan | reject `PLAY_FAILED`, UI tidak menandai playing |

## Langkah verifikasi

### 1. Build APK

```bash
cd ~/pristine
pnpm eas build --profile development --platform android
```

Atau lewat CI: jalankan workflow **Build Dev APK** (`build-dev.yml`) - ini
satu-satunya workflow yang terbukti sukses berulang.

`build-preview.yml` belum diperbaiki dan akan gagal (`husky: not found`,
`Failed to find package 'tools'`), dan APK release-nya unsigned.

### 2. Pasang dan siapkan tangkapan log

Urutannya penting: **mulai rekam dulu, baru buka app**, supaya log boot ikut
tertangkap.

1. Buka Logcat Reader (`com.dp.logcatapp`), mulai rekam
2. Buka PristineAudio
3. Tunggu library selesai dipindai

### 3. Reproduksi bug lama

Ini langkah yang paling penting - bug hanya muncul pada trek yang URI-nya
**belum** di-resolve:

1. Dari library, pilih lagu yang **jauh dari 5 teratas** (mis. trek ke-20)
2. Tekan play
3. Lalu tekan **next** beberapa kali melewati trek ke-6 dan seterusnya

Sebelum perbaikan, pemutaran berhenti dan tidak ada suara mulai trek ke-6.

### 4. Hentikan rekam, ekspor, analisis

```bash
cd ~/pristine
./scripts/analyze-log.sh                     # ekspor terbaru otomatis
./scripts/analyze-log.sh <file> playback
./scripts/analyze-log.sh <file> errors
```

## Yang harus terlihat kalau perbaikan BERHASIL

**Resolver bekerja** - muncul untuk trek yang belum di-resolve:

```
D ContentUriResolver  resolve: cached audio_104436729.mpeg (12345678 bytes)
                     ^ atau "cache hit audio_104436729.mpeg"
D FFmpegDecoder       onOpen: resolved -> /data/user/0/.../cache/audio_104436729.mpeg
D FFmpegDecoder       onOpen: success
```

**Tidak ada lagi kegagalan dekoder:**

```
E FFmpegDecoder       onOpen: avformat_open_input failed     <- HARUS HILANG
E PlaybackController  play(): FAILED - loadTrack returned false  <- HARUS HILANG
```

**Pemutaran berlanjut melampaui trek ke-6.** Cek di log bahwa `play(): SUCCESS`
muncul untuk trek yang sebelumnya gagal, dan `DecoderWorker loop #N` terus
bertambah.

## Yang harus terlihat kalau perbaikan GAGAL

Kalau masih gagal, log akan menunjukkan **di lapis mana** ia berhenti:

| Yang muncul | Artinya |
|---|---|
| `ContentUriResolver: init: JavaVM null` | `JNI_OnLoad` tidak memanggil init - cek `jni/OnLoad.cpp` ikut ter-compile |
| `ContentUriResolver: resolve: JNIEnv tidak tersedia` | AttachCurrentThread gagal |
| `ContentUriResolver: resolve: currentApplication() null` | `ActivityThread.currentApplication()` mengembalikan null |
| `ContentUriResolver: resolve: openInputStream null` | ContentProvider menolak - kemungkinan izin storage |
| `ContentUriResolver: resolve: sumber kosong (0 byte)` | Provider mengembalikan stream kosong |
| `resolve: cache hit` lalu `avformat_open_input failed` | Resolusi berhasil tapi file cache rusak - periksa ukuran byte-nya |
| `PLAY_FAILED` di JS tapi UI tetap "playing" | Propagasi promise putus di salah satu lapis |

## Pemeriksaan tambahan

**Cache bertambah, bukan berlipat.** Karena nama file memakai
`java.lang.String.hashCode()` yang sama dengan sisi Kotlin, resolusi Kotlin
dan native harus berbagi file cache yang sama:

```bash
# via adb shell atau file manager
ls /data/data/com.pristineaudio.app/cache/audio_*.mpeg | wc -l
```

Jumlahnya harus sekitar jumlah trek unik yang diputar, **bukan dua kali** itu.

**Ukuran file cache masuk akal.** Trek lossless puluhan MB, bukan 0 byte:

```
resolve: cached audio_104436729.mpeg (38650485 bytes)
                                        ^ harus > 0
```

**UI tidak menampilkan status salah.** Kalau pemutaran gagal, harusnya muncul
pesan "Gagal memutar lagu ini. Coba lagu lain." dan tombol play tidak dalam
keadaan aktif.

## Test otomatis yang sudah ada

```bash
cd ~/pristine && pnpm test
```

16 tes di `src/__tests__/shared/utils/cacheNaming.test.ts` menjaga:

- Hash penamaan cache sama antara sisi Kotlin dan native (diverifikasi
  silang 4/4 terhadap nama file di log device nyata)
- Deteksi entri `content://` yang belum di-resolve
- Parsing baris log `setQueue: total=.., resolved=.., deferred=..`

Test ini **tidak menggantikan** verifikasi device - ia hanya menjaga agar
bagian yang bisa diuji tanpa device tidak rusak lagi.

## Setelah terverifikasi

Kalau berhasil, perbarui:

1. `docs/ROADMAP.md` - tandai item content:// selesai
2. `docs/TROUBLESHOOTING.md` - tambah pola "URI belum di-resolve diteruskan
   ke dekoder" sebagai gejala yang harus dicurigai kalau playback berhenti
   pada trek tertentu
3. `docs/CHANGELOG.md` - catat perbaikan

Kalau gagal, simpan log-nya dan kembali ke tabel "kalau perbaikan GAGAL" di
atas untuk mempersempit lapis yang bermasalah.
