/**
 * Satu sumber kebenaran definisi kualitas audio (U-P1-01, 2026-11-11).
 *
 * Sebelumnya ada 5+ definisi "Hi-Res" yang berbeda-beda di codebase:
 * QualityBadge (rate saja), FileTypeList CODEC_CONFIG (per codec, tanpa
 * peduli rate), metadata.ts / scanner.ts / playerStore / ScanDiffEngine
 * (rate > 48 kHz ATAU depth > 16, tanpa peduli codec), FloatingPlayer
 * (depth > 16 saja), plus daftar codec lossless yang berbeda-beda isinya
 * di QualityBadge (10), analyzer.ts (8) dan selectors.ts (6).
 *
 * Standar yang dipakai (diambil dari skema badge P0-1, commit f8393375):
 *
 *   HI-RES = codec lossless DAN (sampleRate > 48000 ATAU bitDepth > 16)
 *
 * LOSSLESS ditentukan codec SAJA — jangan pernah dari bitDepth.
 * MediaStore memberi bitDepth default 16 ke file yang tidak melaporkan
 * BITS_PER_SAMPLE, jadi `bitDepth >= 16` melabeli MP3/AAC/OPUS sebagai
 * LOSSLESS (itu bug U-P0-1).
 *
 * "M4A" sengaja TIDAK masuk daftar lossless: wadah itu bisa berisi ALAC
 * (lossless) atau AAC (lossy) — dari namanya saja tidak bisa dibedakan,
 * jadi jangan klaim.
 *
 * Logika murni, tanpa impor react-native/expo, supaya bisa diuji Jest.
 * Untuk filter SQL (SQLite tidak bisa memanggil helper ini), pakai
 * LOSSLESS_CODECS_SQL_LIST — daftar yang sama, dalam bentuk literal SQL.
 */

/** Codec lossless (huruf besar). "M4A" sengaja tidak ada — lihat atas. */
export const LOSSLESS_CODECS: ReadonlySet<string> = new Set([
  "FLAC",
  "ALAC",
  "WAV",
  "AIFF",
  "APE",
  "WAVPACK",
  "TTA",
  "DSD",
  "DSF",
  "DFF",
]);

/**
 * Daftar yang sama dalam bentuk literal SQL untuk klausa `codec IN (...)`.
 * Dipakai scanner.ts (filter + statistik) karena SQLite tidak bisa
 * memanggil isLosslessCodec — isinya harus tetap sama dengan
 * LOSSLESS_CODECS di atas.
 */
export const LOSSLESS_CODECS_SQL_LIST =
  "'FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'WAVPACK', 'TTA', 'DSD', 'DSF', 'DFF'";

/** Normalisasi nama codec sebelum dicocokkan: buang spasi, huruf besar. */
export function normalizeCodec(codec: string | null | undefined): string {
  return (codec ?? "").trim().toUpperCase();
}

/** True bila codec dikenal sebagai lossless — ditentukan codec saja. */
export function isLosslessCodec(codec: string | null | undefined): boolean {
  return LOSSLESS_CODECS.has(normalizeCodec(codec));
}

export interface AudioQualityInput {
  codec?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
}

/**
 * True bila file Hi-Res: codec lossless DAN benar-benar melebihi CD
 * (rate > 48 kHz atau depth > 16 bit). AAC 96 kHz bukan HI-RES —
 * codec-nya lossy, apa pun sample ratenya. FLAC 16-bit/44,1 kHz juga
 * bukan HI-RES — lossless tapi tidak melebihi CD.
 */
export function isHiRes(
  track: AudioQualityInput | null | undefined,
): boolean {
  if (!track) return false;
  if (!isLosslessCodec(track.codec)) return false;
  return (track.sampleRate ?? 0) > 48000 || (track.bitDepth ?? 0) > 16;
}
