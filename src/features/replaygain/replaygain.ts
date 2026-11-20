// src/features/replaygain/replaygain.ts
//
// ReplayGain — logika MURNI (tanpa dependensi React Native, bisa diuji Jest).
//
// KOREKSI ATAS LAPORAN DEEP INSIGHT §6 item 3 (2026-11-20): laporan bilang
// metadata `replaygain_track_gain` "sudah diparse, hanya perlu diterapkan".
// Itu TIDAK BENAR: field itu hanya dideklarasikan di type lokal
// `src/shared/types/audio-metadata.d.ts` (`AudioMetadataCommon`), sementara
// parser yang benar-benar dipakai (`@missingcore/audio-metadata`) TIDAK
// pernah mengembalikannya — `AudioMetadata`-nya hanya { album,
// albumArtist, artist, artwork, name, track, year } dan pembaca FLAC-nya
// (Vorbis map) tidak mengenal REPLAYGAIN_*. Tidak ada jalur kode yang
// mengisi field itu, dan `analyzer.ts` bahkan tidak memintanya. Karena itu
// fitur ini membawa pembaca tag sendiri (`tags.ts` + `reader.ts`).
//
// Cara kerja (mengikuti nilai tag, BUKAN target LUFS — opsi yang dipilih
// dari spec): gain track = `replaygain_track_gain` (dB) dari file; mode
// album memakai `replaygain_album_gain`, jatuh kembali ke track gain bila
// tag album tidak ada (ala foobar2000). Gain diterapkan lewat jalur master
// gain yang sudah ada (setMasterGain -> GainNode di DSPChain, sesudah HRTF,
// sebelum Limiter) — TIDAK ada node DSP baru, TIDAK ada perubahan perilaku
// slider master gain / preset / node lain.
//
// Batas yang dipilih:
// - Koreksi ReplayGain di-clamp ke ±12 dB. Alasan: selaras dengan rentang
//   master gain app (±12 dB); nilai tag di luar itu hampir selalu salah
//   tag / outlier ekstrem, dan clamp menjaga total koreksi tetap bisa
//   diprediksi. Limiter soft (ambang 0,98) tetap jadi backstop.
// - Peak cap: bila `replaygain_*_peak` (linear 0..~1) diketahui, boost
//   dibatasi supaya puncak × gain ≤ 1,0 — lagu pelan yang di-boost tidak
//   hard-clip. Hanya membatasi boost, tidak pernah mengubah cut.
// - Gain efektif akhir = userGain × rgLinear, di-clamp ke rentang master
//   gain (±12 dB → 0,251..3,98 linear). Native juga men-clamp 0..4
//   (AudioState), jadi ini pertahanan berlapis, bukan satu-satunya.
// - Bit-perfect: GainNode tidak ada di jalur bit-perfect
//   (processBitPerfect() no-op) dan dorongan JS di-gate isEQEnabled, jadi
//   ReplayGain otomatis tidak berlaku di mode Bit-Perfect — tanpa kode
//   khusus di sini.

export interface ReplayGainTags {
  /** ReplayGain track gain, dB (mis. -6,23). */
  trackGainDb?: number;
  /** ReplayGain album gain, dB. */
  albumGainDb?: number;
  /** ReplayGain track peak, linear 0..~1 (bukan dB). */
  trackPeak?: number;
  /** ReplayGain album peak, linear 0..~1. */
  albumPeak?: number;
}

export type ReplayGainMode = "track" | "album";

/** Batas koreksi ReplayGain (dB). Selaras dengan MASTER_GAIN_DB_MIN/MAX. */
export const REPLAYGAIN_DB_MIN = -12;
export const REPLAYGAIN_DB_MAX = 12;

/** Rentang gain efektif akhir (linear) = ±12 dB di sekitar 1,0. */
export const EFFECTIVE_GAIN_MIN = Math.pow(10, REPLAYGAIN_DB_MIN / 20);
export const EFFECTIVE_GAIN_MAX = Math.pow(10, REPLAYGAIN_DB_MAX / 20);

export const dbToLinear = (db: number): number => Math.pow(10, db / 20);

export const linearToDb = (linear: number): number =>
  linear > 0 ? 20 * Math.log10(linear) : -Infinity;

/**
 * Parse nilai gain ReplayGain dari tag. Format di file: "-6,23 dB", "+3 dB",
 * "0", atau angka mentah. Koma desimal (gaya Eropa, "-6,23 dB") ikut
 * diterima. Nilai tak hingga / bukan angka -> null.
 */
export function parseReplayGainDb(
  value: string | number | undefined | null,
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const m = value
    .trim()
    .replace(",", ".")
    .match(/^([+-]?\d+(?:\.\d+)?)\s*(?:db)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse nilai peak ReplayGain. Normalnya linear 0..1 ("0,987"); bila
 * bersufiks dB, dikonversi ke linear. Di luar 0..10 -> null (tag rusak).
 */
export function parseReplayGainPeak(
  value: string | number | undefined | null,
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
  }
  const text = value.trim().replace(",", ".");
  const dbMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\s*db$/i);
  if (dbMatch) {
    const n = dbToLinear(Number(dbMatch[1]));
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
  }
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

/** Clamp koreksi ReplayGain ke ±12 dB (nilai tak hingga -> batas terdekat). */
export function clampReplayGainDb(db: number): number {
  if (!Number.isFinite(db)) return db > 0 ? REPLAYGAIN_DB_MAX : REPLAYGAIN_DB_MIN;
  return Math.min(REPLAYGAIN_DB_MAX, Math.max(REPLAYGAIN_DB_MIN, db));
}

/**
 * Gain dB yang berlaku untuk satu lagu pada mode tertentu, atau null bila
 * tidak ada tag yang bisa dipakai. Mode album jatuh kembali ke track gain
 * (dan track peak) bila tag album tidak ada.
 */
export function resolveReplayGainDb(
  tags: ReplayGainTags | null | undefined,
  mode: ReplayGainMode,
): { gainDb: number; peak?: number } | null {
  if (!tags) return null;
  const gainDb =
    mode === "album"
      ? (tags.albumGainDb ?? tags.trackGainDb)
      : tags.trackGainDb;
  if (gainDb === undefined || !Number.isFinite(gainDb)) return null;
  const peak =
    mode === "album"
      ? (tags.albumPeak ?? tags.trackPeak)
      : tags.trackPeak;
  return {
    gainDb: clampReplayGainDb(gainDb),
    peak: peak !== undefined && Number.isFinite(peak) ? peak : undefined,
  };
}

/**
 * Faktor linear ReplayGain untuk satu lagu (1,0 = tidak ada koreksi), atau
 * null bila tidak ada tag. Sudah di-clamp ±12 dB dan dibatasi peak cap
 * (puncak × gain ≤ 1,0) bila peak diketahui.
 */
export function replayGainLinearFor(
  tags: ReplayGainTags | null | undefined,
  mode: ReplayGainMode,
): number | null {
  const resolved = resolveReplayGainDb(tags, mode);
  if (!resolved) return null;
  let linear = dbToLinear(resolved.gainDb);
  if (
    resolved.peak !== undefined &&
    resolved.peak > 0 &&
    Number.isFinite(resolved.peak)
  ) {
    linear = Math.min(linear, 1 / resolved.peak);
  }
  return linear;
}

/**
 * Gain linear yang dikirim ke native: gain user (slider master) × faktor
 * ReplayGain, di-clamp ke rentang master gain. Bila RG mati atau lagu tidak
 * punya tag, mengembalikan gain user apa adanya — toggle OFF memulihkan
 * perilaku lama persis.
 */
export function computeEffectiveMasterGain(
  userGainLinear: number,
  tags: ReplayGainTags | null | undefined,
  enabled: boolean,
  mode: ReplayGainMode,
): number {
  const user = Number.isFinite(userGainLinear) ? userGainLinear : 1.0;
  if (!enabled) return user;
  const factor = replayGainLinearFor(tags, mode);
  if (factor === null) return user;
  const effective = user * factor;
  return Math.min(
    EFFECTIVE_GAIN_MAX,
    Math.max(EFFECTIVE_GAIN_MIN, effective),
  );
}
