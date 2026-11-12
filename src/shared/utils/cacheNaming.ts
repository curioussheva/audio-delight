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
 *      (B9-cache64, 2026-11-12: hashnya FNV-1a 64-bit atas byte UTF-8,
 *      format `audio_<16 digit hex lowercase>.<ext>`; sebelumnya
 *      java.lang.String.hashCode() 32-bit.)
 *   B. Antrean yang berisi `content://` mentah harus DIBEDAKAN dari antrean
 *      yang sudah di-resolve, supaya regresi ini bisa dideteksi di test
 *      tanpa device.
 *   C. Kalau native play() menolak, state pemutar TIDAK BOLEH jadi playing.
 */

/**
 * FNV-1a 64-bit atas byte UTF-8 string, hasil 16 digit hex lowercase
 * (zero-padded). HARUS identik dengan implementasi native
 * (ContentUriResolver.cpp: fnv1a64) dan Kotlin
 * (NativePlaybackService.kt / NativePlaybackModule.kt: fnv1a64Hex):
 * offset basis 14695981039346656037, prima 1099511628211, per byte
 * h ^= byte; h *= prima (mod 2^64).
 *
 * UTF-8 di-encode manual (tanpa TextEncoder) supaya tidak bergantung pada
 * global runtime; surrogate pair digabung dulu jadi satu code point.
 * BigInt dipakai karena JS number tidak muat 64-bit (target esnext,
 * Hermes RN 0.72+ mendukung BigInt); mask tiap byte karena BigInt tidak
 * wrap otomatis seperti uint64_t / Long.
 */
export function fnv1a64Hex(s: string): string {
  const MASK_64 = 0xffffffffffffffffn;
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    // Gabung surrogate pair jadi satu code point.
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    // Encode cp ke byte UTF-8, hash per byte.
    const bytes =
      cp < 0x80
        ? [cp]
        : cp < 0x800
          ? [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)]
          : cp < 0x10000
            ? [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)]
            : [
                0xf0 | (cp >> 18),
                0x80 | ((cp >> 12) & 0x3f),
                0x80 | ((cp >> 6) & 0x3f),
                0x80 | (cp & 0x3f),
              ];
    for (const b of bytes) {
      h = (h ^ BigInt(b)) * prime;
      h &= MASK_64;
    }
  }
  return h.toString(16).padStart(16, "0");
}

/** Nama file cache, sama dengan sisi Kotlin dan sisi native. */
export function cacheFileName(uri: string, ext: string): string {
  return `audio_${fnv1a64Hex(uri)}.${ext}`;
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
