# Kendali Playback: Rancangan Final

**Status: BELUM terverifikasi di device.** Perubahan mencakup C++ dan Kotlin,
butuh build ulang APK.

## Akar masalah: dua jalur yang tidak nyambung

Ada **dua** jalur next/prev, dan keduanya bermasalah.

### Jalur A ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ `useAudioPlayer.skipToNext`

```ts
const skipToNext = useCallback(() => {
  if (!isReady.current) return;   // <-- keluar diam
  NativePlaybackService.next();
}, []);
```

`isReady` diset `true` **hanya** di dalam `useEffect` milik hook itu sendiri.
Kalau komponen pemakainya mount lebih dulu (atau hook-nya unmount), tombol
next/prev **mengembalikan tanpa log apa pun**.

**Bukti:** di logcat device, `next() called` dan `previous() called` muncul
**nol kali** ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ padahal `getCurrentTrack()` dipanggil ~60ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ. Tombolnya ditekan,
tapi perintahnya tidak pernah sampai.

### Jalur B ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ `playerStore.playNext` (pola lama)

```ts
const idx = queue.findIndex((s) => s.id === currentSong.id);
let nextIndex = idx + 1;
...
await get().skipToIndex(nextIndex);   // -> playSong -> setQueue + play
```

Menghitung indeks di JS, lalu **menimpa queue native** lewat `setQueue`.

**Bukti:** `setQueue(48 items)` muncul berulang di 12:19:32, 12:21:05,
12:22:00, 12:22:28. Setiap next membuang queue yang sudah dibangun native,
termasuk urutan shuffle yang **hanya** diketahui native.

**Akibatnya:** tombol next di FloatingPlayer dan di Controls berperilaku
berbeda, dan next bisa memuat lagu yang tidak sesuai dengan yang ditampilkan
saat shuffle aktif.

## Rancangan setelah migrasi

**Native memegang queue dan indeks. JS hanya menampilkan.**

```
UI (Controls, FloatingPlayer, notification)
  |
  v
playerStore.playNext() / playPrevious() / skipToIndex(i)
  |
  v
NativePlaybackService.next() / previous() / jumpTo(i)
  |
  v  (setelah perintah)
playerStore.syncFromNative()
  |
  +--> getCurrentTrack()   -> cocokkan ke song lewat URI
  +--> getCurrentIndex()   -> posisi di queue (sync)
  +--> getStatus()         -> isPlaying
  +--> getPosition()       -> posisi
  +--> updateMetadata()    -> segarkan notification
```

### Kontrak native yang ditambahkan

| Fungsi | Sifat | Kegunaan |
|---|---|---|
| `getCurrentIndex()` | sync | Posisi di queue, pembacaan cepat |
| `getQueueSize()` | sync | Validasi indeks sebelum `jumpTo` |
| `jumpTo(index)` | Promise | Pindah ke indeks lalu muat treknya |

`jumpTo` sengaja **memuat** treknya, sama seperti `next()`/`previous()` yang
sudah memanggil `loadTrack` di C++. Kalau tidak, JS harus memanggil
`setQueue` ulang ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ persis pola lama yang ingin dihapus.

### Kenapa pencocokan lewat URI, bukan indeks

Saat shuffle aktif, indeks di queue store **tidak sama** dengan indeks native.
Mencocokkan lewat indeks akan menampilkan lagu yang salah di UI. Karena itu
`syncFromNative()` mencocokkan URI track aktif dari native dengan URI song di
queue store.

## Perbaikan UI

| Temuan | Sebelum | Sesudah |
|---|---|---|
| `Controls.tsx` | `useAudioPlayer` dengan penjaga `isReady` yang menelan error | store, satu jalur dengan UI lain |
| Progress bar FloatingPlayer | `useAnimatedStyle` baca state di luar worklet ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ bisa beku | shared value di-update lewat `useEffect` |
| `duration` | hanya di-set kalau masih 0 ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ nilai salah bertahan selamanya | dikoreksi kalau selisih > 1 detik |
| `isPlaying` dari status | `status !== 0` ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ PAUSED ikut dianggap playing | hanya `status === 1` |
| Notification next/prev | state sesi tidak ikut berubah | notification disegarkan |

### Kenapa progress bar bisa beku

```tsx
// SEBELUM - worklet membaca state di luar, tidak reaktif
const animatedProgress = useAnimatedStyle(() => {
  const pct = duration > 0 ? Math.min(position / duration, 1) : 0;
  return { width: `${pct * 100}%` };
});
```

Worklet Reanimated berjalan di thread UI dan **tidak** ikut re-render saat
React state berubah. Solusinya menyimpan nilai di shared value:

```tsx
const progress = useSharedValue(0);
useEffect(() => {
  progress.value = withTiming(progressPercent(position, duration) / 100, {
    duration: 200,
  });
}, [position, duration, progress]);

const animatedProgress = useAnimatedStyle(() => ({
  width: `${progress.value * 100}%`,
}));
```

`progressPercent()` juga menjaga dari `duration` 0/NaN/Infinity yang dulu
menghasilkan lebar `"NaN%"`.

## Cara verifikasi di device

### 1. Build

```bash
cd ~/pristine
pnpm eas build --profile development --platform android
```

Atau CI: **Build Dev APK** (`build-dev.yml`).

### 2. Mulai rekam log DULU, baru buka app

Supaya log boot ikut tertangkap.

### 3. Uji setiap permukaan

| Uji | Yang diharapkan |
|---|---|
| Tekan next di **floating player** | lagu ganti, log: `next() called` |
| Tekan next di **main player** | lagu ganti, log: `next() called` |
| Tekan next di **notification** | lagu ganti, notifikasi ikut update judul |
| Tekan next di **lock screen** | lagu ganti, notifikasi ikut update |
| Tekan previous setelah >3 detik | ulang lagu ini, bukan pindah |
| Tekan previous di awal lagu | pindah ke lagu sebelumnya |
| Nyalakan **shuffle**, tekan next 5x | lagu yang tampil = lagu yang berbunyi |
| Tekan play/pause di notification | ikon & audio sinkron |

### 4. Analisis log

```bash
cd ~/pristine
./scripts/analyze-log.sh <file> grep "next\(\) called|previous\(\) called|jumpTo"
./scripts/analyze-log.sh <file> grep "setQueue"
```

**Yang harus terlihat:** setiap penekanan tombol menghasilkan satu
`next() called` / `previous() called`.

**Yang harus BERKURANG drastis:** `setQueue`. Dulu muncul setiap kali next
sekarang hanya saat queue benar-benar diganti (pilih lagu baru).

## Kalau masih gagal

| Gejala | Artinya |
|---|---|
| Tombol tidak menghasilkan log apa pun | komponen masih memakai `useAudioPlayer`; cek import di komponen itu |
| `next() called` ada tapi lagu tidak ganti | `play(): FAILED` di native ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ kemungkinan bug `content://` (lihat `VERIFY-content-uri-fix.md`) |
| Lagu ganti tapi UI tidak ikut | `syncFromNative` gagal ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ cek warn `syncFromNative gagal` di log |
| Judul notification tetap lagu lama | `updateMetadata` tidak terpanggil dari sync |
| UI menampilkan lagu berbeda dari yang berbunyi | pencocokan lewat indeks, bukan URI ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ cek `findSongByUri` |
| `skipToIndex ditolak: di luar jangkauan` | queue native lebih kecil dari queue store; cek `setQueue` terakhir |

## Catatan: yang TIDAK diubah

- `useAudioPlayer` masih ada karena `search.tsx` memakai `loadSong`. Jalur
  next/prev di hook itu sudah tidak dipakai siapa pun.
- `setQueue` tetap dipakai saat memilih lagu baru ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ itu memang perlu,
  karena queue native harus dibangun ulang. Yang dihapus adalah memanggilnya
  ulang **hanya untuk berpindah trek**.
