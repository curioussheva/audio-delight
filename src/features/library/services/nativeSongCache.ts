// src/features/library/services/nativeSongCache.ts
//
// J2-1 — peta uri -> NativeSong untuk enrichment, dibangun dari SATU
// sumber (satu query MediaStore penuh, atau satu SELECT SQLite) lalu
// lookup di memori. Enrichment per lagu TIDAK BOLEH query ulang per
// lagu — lihat MetadataEnricher.warmNativeSongCache /
// refreshNativeSongCacheFromDb.
//
// Modul MURNI (tanpa dependensi runtime React Native) supaya bisa diuji
// jest — pola yang sama seperti equalizer/api/graphProps.ts. Hanya
// `import type` NativeSong, jadi tidak ada impor runtime sama sekali.
import type { NativeSong } from "../native/MediaStoreModule";

/**
 * Bangun peta uri -> NativeSong dari satu daftar. Entri tanpa uri
 * dilewati (tidak bisa di-lookup); uri duplikat: yang terakhir menang
 * — sama seperti loop yang dulu inline di warmNativeSongCache.
 */
export function buildNativeSongMap(
  songs: readonly (NativeSong | null | undefined)[] | null | undefined,
): Map<string, NativeSong> {
  const map = new Map<string, NativeSong>();
  if (!songs) return map;
  for (const song of songs) {
    if (song?.uri) map.set(song.uri, song);
  }
  return map;
}
