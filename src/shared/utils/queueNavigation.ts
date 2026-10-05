/**
 * Tes anti-regresi untuk navigasi queue (next/previous/skipToIndex).
 *
 * MASALAH YANG DIJAGA
 * -------------------
 * Ada DUA jalur next/prev yang tidak nyambung, dan keduanya bermasalah:
 *
 *   Jalur A: useAudioPlayer.skipToNext -> NativePlaybackService.next()
 *     Dijaga `if (!isReady.current) return`. isReady hanya di-set true di
 *     useEffect milik hook itu sendiri, jadi kalau komponen pemakainya mount
 *     lebih dulu, tombol MENGAKIBATKAN RETURN DIAM tanpa log apa pun.
 *     Bukti: di logcat device, `next() called` muncul NOL kali padahal user
 *     menekan tombol berkali-kali.
 *
 *   Jalur B: playerStore.playNext -> hitung indeks di JS -> playSong ->
 *     setQueue(48 items) + play. Ini MENIMPA queue native setiap kali next,
 *     dan mengabaikan urutan shuffle yang hanya diketahui native.
 *     Bukti: `setQueue(48 items)` muncul berulang di log pada 12:19:32,
 *     12:21:05, 12:22:00, 12:22:28.
 *
 * Perbaikan: native yang memegang queue + indeks. JS memerintahkan `next()`,
 * `previous()`, atau `jumpTo(index)`, lalu membaca ulang keadaan dari native.
 *
 * Tes di bawah menjaga logika murni yang paling mudah rusak.
 */

/** Status native dari NativePlaybackService.getStatus(). */
export const NATIVE_STATUS = {
  IDLE: 0,
  PLAYING: 1,
  PAUSED: 2,
  STOPPED: 3,
} as const;

// javaStringHashCode dipakai uriMatches() untuk mencocokkan content:// (JS)
// dengan path cache (native). Replikasi persis java.lang.String.hashCode().
import { javaStringHashCode } from "./cacheNaming";

/** Ambang "previous = ulang lagu ini" (detik), perilaku standar player. */
export const RESTART_THRESHOLD_SECONDS = 3;

/**
 * Apakah "previous" harus mengulang lagu ini alih-alih pindah ke sebelumnya.
 * Ini logika yang dulu ada di playPrevious dan mudah hilang saat refactor.
 */
export function shouldRestartInsteadOfPrevious(positionSeconds: number): boolean {
  return positionSeconds > RESTART_THRESHOLD_SECONDS;
}

/**
 * Terjemahkan status native ke boolean isPlaying.
 *
 * PENTING: hanya PLAYING yang dianggap true. Dulu ada tempat yang memakai
 * `status !== 0`, yang membuat PAUSED ikut dianggap playing - tombol jadi
 * menampilkan "pause" padahal audio sedang berhenti.
 */
export function isPlayingFromStatus(status: number): boolean {
  return status === NATIVE_STATUS.PLAYING;
}

/**
 * Validasi indeks queue terhadap ukuran queue native.
 * Mengembalikan null kalau tidak valid, supaya pemanggil tidak mengirim
 * indeks di luar jangkauan ke native.
 */
export function validateQueueIndex(
  index: number,
  queueSize: number,
): number | null {
  if (!Number.isInteger(index)) return null;
  if (queueSize <= 0) return null;
  if (index < 0 || index >= queueSize) return null;
  return index;
}

/**
 * Cocokkan URI track aktif dari native dengan song di queue store.
 *
 * Queue di store hanya untuk metadata tampilan; native yang punya kebenaran
 * soal mana yang dimuat. Pencocokan HARUS lewat URI, bukan indeks: saat
 * shuffle aktif, indeks di store tidak sama dengan indeks native.
 *
 * ⚠️ URI native dan URI JS bisa berbeda BENTUK untuk trek yang sama:
 * - JS mengirim `content://media/external/audio/media/123` ke setQueue
 * - Kotlin (NativePlaybackService.setQueue) me-resolve MAX_PRE_RESOLVE = 5
 *   trek pertama ke path cache `/data/.../audio_<hash>.flac`, sisanya
 *   dibiarkan `content://`
 * - Decoder juga bisa me-resolve `content://` sendiri ke path cache
 *   (ContentUriResolver)
 *
 * Jadi perbandingan string mentah `a === b` gagal untuk trek yang sudah
 * di-resolve — tepatnya trek yang sedang diputar. Tanpa helper ini,
 * `findSongByUri` kembali null, `currentSong` JS tidak update, dan UI
 * menampilkan trek lama padahal audio native sudah next.
 */
export function uriMatches(
  jsUri: string | null | undefined,
  nativeUri: string | null | undefined,
): boolean {
  if (!jsUri || !nativeUri) return false;
  if (jsUri === nativeUri) return true;

  // Native resolve content:// → /data/.../cache/audio_<hashCode>.<ext>.
  //java.lang.String.hashCode() dari content:// harus sama dengan hash di
  //nama file cache. Lihat javaStringHashCode() (replikasi persis).
  const cacheName = cacheFileNameForUri(jsUri);
  if (cacheName && nativeUri.includes(cacheName)) return true;

  // Simetri: JS ada path cache, native kasih content:// (jarang, tapi mungkin
  // kalau trek deferred dan decoder resolve di-lazy).
  const cacheName2 = cacheFileNameForUri(nativeUri);
  if (cacheName2 && jsUri.includes(cacheName2)) return true;

  return false;
}

/** Nama file cache yang dihasilkan Kotlin/native untuk URI ini
 * (`audio_<javaHashCode>.<ext>`), atau null kalau bukan content://. */
function cacheFileNameForUri(uri: string): string | null {
  if (!uri.startsWith("content://")) return null;
  // Ekstensi tidak bisa ditebak dari URI saja (didapat dari ContentResolver
  // getType), jadi cocokkan hanya prefix `audio_<hash>.` — itu sudah unik.
  return `audio_${javaStringHashCode(uri)}.`;
}

export function findSongByUri<T extends { uri?: string }>(
  queue: T[],
  uri: string | null | undefined,
): T | null {
  if (!uri) return null;
  // Cek exact match dulu (kasus path cache == path cache), baru fallback
  // ke uriMatches (content:// vs path cache).
  return (
    queue.find((s) => s.uri === uri) ??
    queue.find((s) => uriMatches(s.uri, uri)) ??
    null
  );
}

/**
 * Hitung persentase progress untuk progress bar, dijaga dari nilai aneh.
 * duration 0 / NaN / Infinity dulu menghasilkan lebar "NaN%" atau "Infinity%"
 * yang membuat React Native mengabaikan style tersebut.
 */
export function progressPercent(
  positionSeconds: number,
  durationSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return 0;
  const pct = positionSeconds / durationSeconds;
  return Math.min(Math.max(pct, 0), 1) * 100;
}

/**
 * Apakah duration dari song perlu dipakai untuk mengoreksi durasi di store.
 *
 * Dulu hanya di-set kalau store masih 0, sehingga durasi yang salah dari
 * database bertahan selamanya - progress bar mati dan seek jadi tidak mungkin.
 */
export function shouldCorrectDuration(
  currentDuration: number,
  songDuration: number,
): boolean {
  if (!Number.isFinite(songDuration) || songDuration <= 0) return false;
  if (!Number.isFinite(currentDuration) || currentDuration <= 0) return true;
  return Math.abs(currentDuration - songDuration) > 1;
}
