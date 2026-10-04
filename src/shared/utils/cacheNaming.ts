/**
 * Test untuk anti-regresi bug "playback gagal pada trek ke-6".
 *
 * BUG YANG DIJAGA
 * ---------------
 * Logcat 2026-10-04 12:22 menunjukkan pemutaran gagal total tiga kali:
 *
 *   E FFmpegDecoder       onOpen: avformat_open_input failed
 *   E PlaybackController  play(): FAILED - loadTrack returned false
 *
 * Penyebabnya berlapis:
 *
 *   1. `NativePlaybackService.setQueue` hanya me-resolve MAX_PRE_RESOLVE = 5
 *      entri pertama. Sisanya (43 dari 48) disimpan sebagai `content://`
 *      mentah alias "deferred".
 *   2. `FFmpegDecoder::onOpen` meneruskan URI itu apa adanya ke
 *      `avformat_open_input`, yang tidak punya handler untuk skema
 *      ContentProvider Android. Selalu gagal.
 *   3. `resolveUri()` ada di spec TS dan di Kotlin, tapi TIDAK PERNAH dipanggil
 *      dari JS - silent wiring gap. Jadi entri deferred tidak pernah
 *      di-resolve.
 *
 * Perbaikannya: resolusi dilakukan di sisi native saat dekoder membuka file,
 * jadi tidak bergantung pada JS memanggil resolveUri.
 *
 * Test di bawah menjaga tiga sifat yang paling mudah rusak:
 *
 *   A. Hash penamaan cache harus SAMA antara sisi Kotlin dan sisi native.
 *      Kalau berbeda, resolusi Kotlin dan resolusi native menghasilkan dua
 *      file berbeda untuk trek yang sama - cache ganda, dan trek yang sudah
 *      di-resolve Kotlin tetap disalin ulang oleh dekoder.
 *   B. Antrean yang berisi `content://` mentah harus DIBEDAKAN dari antrean
 *      yang sudah di-resolve, supaya regresi ini bisa dideteksi di test
 *      tanpa device.
 *   C. Kalau native play() menolak, state pemutar TIDAK BOLEH jadi playing.
 */

/** java.lang.String.hashCode(), direplikasi persis. */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Nama file cache, sama dengan sisi Kotlin dan sisi native. */
export function cacheFileName(uri: string, ext: string): string {
  return `audio_${javaStringHashCode(uri)}.${ext}`;
}

/** true kalau URI masih `content://` mentah yang belum di-resolve. */
export function isUnresolvedContentUri(uri: string): boolean {
  return uri.startsWith("content://");
}

/**
 * true kalau antrean punya entri yang belum di-resolve.
 * Ini kondisi yang memicu bug - kalau true dan tidak ada resolver di sisi
 * native, pemutaran akan gagal pada trek tersebut.
 */
export function hasDeferredEntries(uris: string[]): boolean {
  return uris.some(isUnresolvedContentUri);
}

/**
 * Mengurai baris log `setQueue: total=48, resolved=5, deferred=43`.
 * Dipakai untuk mendeteksi regresi dari log device nyata.
 */
export function parseSetQueueLog(
  line: string,
): { total: number; resolved: number; deferred: number } | null {
  const m = line.match(
    /setQueue:\s*total=(\d+),\s*resolved=(\d+),\s*deferred=(\d+)/,
  );
  if (!m) return null;
  return {
    total: Number(m[1]),
    resolved: Number(m[2]),
    deferred: Number(m[3]),
  };
}
