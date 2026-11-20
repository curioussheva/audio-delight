// Smart playlist / auto-playlist (item 7 deep-insight §6) — LOGIKA MURNI.
//
// Playlist otomatis = VIRTUAL, bukan baris di tabel `playlists`: isinya
// dihitung LANGSUNG dari tabel `songs` tiap kali dibuka (lihat
// PlaylistService.getSmartPlaylist), jadi tidak pernah basi — beda dengan
// createSmartPlaylist() lama yang membuat snapshot statis sekali jalan.
// Aturan keanggotaan di sini (atas Song[]) adalah CERMIN dari query SQL di
// service — keduanya harus berubah berpasangan; tes di
// __tests__/features/playlist/smartPlaylists.test.ts mengunci aturan ini,
// tes playlistService.test.ts mengunci SQL-nya.
//
// Data yang dipakai SUDAH ADA dan SUDAH TERISI (verifikasi 2026-11-20):
// - dateAdded: kolom songs.dateAdded, diisi scanner dari MediaStore
//   (fallback Date.now() saat insert) — "Baru Ditambahkan" bisa dihitung.
// - playCount + lastPlayedAt: kolom songs, playCount+1 + lastPlayedAt
//   ditulis tiap ganti trek (SongQueries/LibraryScanner.incrementPlayCount,
//   dipanggil playSong + syncFromNative) + tabel recent_plays —
//   "Paling Sering Diputar" dan "Belum Pernah Diputar" bisa dihitung.
//   CATATAN: PlaylistService.getMostPlayed lama mengurutkan pakai kolom
//   `lastPlayed` yang TIDAK ADA di skema (kolomnya `lastPlayedAt`) —
//   diperbaiki di service bersamaan dengan fitur ini.
// - lossless: codec/sampleRate/bitDepth/bitrate diisi scanner dari
//   MediaStore; "lossless" ditentukan codec SAJA via isLosslessCodec
//   (audioQuality.ts — satu sumber kebenaran; JANGAN dari bitDepth,
//   MediaStore memberi default 16 ke file yang tidak melaporkan
//   BITS_PER_SAMPLE, bug U-P0-1).
//
// Logika murni, tanpa impor react-native/expo, supaya bisa diuji Jest.
import type { Song } from "@/shared/types/audio";
import { isLosslessCodec } from "@/shared/utils/audioQuality";

/** Id virtual smart playlist — prefix `smart:` supaya tidak pernah
 *  bentrok dengan id playlist DB (id DB = Date.now()) maupun id
 *  virtual "favorites". */
export type SmartPlaylistId =
  | "smart:recent"
  | "smart:most-played"
  | "smart:lossless"
  | "smart:never-played";

export const SMART_PLAYLIST_IDS: readonly SmartPlaylistId[] = [
  "smart:recent",
  "smart:most-played",
  "smart:lossless",
  "smart:never-played",
];

export interface SmartPlaylistDef {
  id: SmartPlaylistId;
  name: string;
  description: string;
}

export const SMART_PLAYLIST_DEFS: Record<SmartPlaylistId, SmartPlaylistDef> = {
  "smart:recent": {
    id: "smart:recent",
    name: "Baru Ditambahkan",
    description: "Lagu yang paling baru masuk ke library.",
  },
  "smart:most-played": {
    id: "smart:most-played",
    name: "Paling Sering Diputar",
    description: "Lagu yang paling sering kamu putar.",
  },
  "smart:lossless": {
    id: "smart:lossless",
    name: "Lossless Saja",
    description: "Semua lagu lossless (FLAC, ALAC, WAV, dan sejenisnya).",
  },
  "smart:never-played": {
    id: "smart:never-played",
    name: "Belum Pernah Diputar",
    description: "Lagu di library yang belum pernah diputar.",
  },
};

/** True bila id ini salah satu smart playlist virtual. */
export function isSmartPlaylistId(
  id: string | null | undefined,
): id is SmartPlaylistId {
  return (
    id === "smart:recent" ||
    id === "smart:most-played" ||
    id === "smart:lossless" ||
    id === "smart:never-played"
  );
}

/** True bila lagu ini lossless — ditentukan codec saja (lihat atas). */
export function isLosslessSong(song: Song): boolean {
  return isLosslessCodec(song.codec);
}

// ── Batas isi ────────────────────────────────────────────────────────────────
// "Baru Ditambahkan" / "Paling Sering Diputar" adalah daftar TOP-N —
// dibatasi supaya tetap jadi sorotan, bukan seluruh library.
// "Lossless Saja" / "Belum Pernah Diputar" adalah FILTER penuh —
// tanpa batas (user berharap SEMUA lagu lossless-nya ada di sana);
// FlashList di detail view menangani daftar panjang.
export const SMART_PLAYLIST_LIMITS = {
  "smart:recent": 50,
  "smart:most-played": 50,
  "smart:lossless": null,
  "smart:never-played": null,
} as const satisfies Record<SmartPlaylistId, number | null>;

// Tie-break deterministik (judul ASC) supaya urutan stabil saat nilai
// kunci sama — mis. banyak lagu playCount-nya sama, atau dateAdded 0
// (lagu lama yang dateAdded-nya tidak tercatat).
function byTitleAsc(a: Song, b: Song): number {
  return (a.title ?? "").localeCompare(b.title ?? "");
}

/** "Baru Ditambahkan": dateAdded terbaru dulu, maks 50. */
export function selectRecentlyAdded(songs: Song[]): Song[] {
  return [...songs]
    .sort(
      (a, b) =>
        (b.dateAdded || 0) - (a.dateAdded || 0) || byTitleAsc(a, b),
    )
    .slice(0, SMART_PLAYLIST_LIMITS["smart:recent"]);
}

/** "Paling Sering Diputar": playCount terbanyak dulu (tie-break:
 *  terakhir diputar), hanya lagu yang pernah diputar, maks 50. */
export function selectMostPlayed(songs: Song[]): Song[] {
  return [...songs]
    .filter((s) => (s.playCount || 0) > 0)
    .sort(
      (a, b) =>
        (b.playCount || 0) - (a.playCount || 0) ||
        (b.lastPlayed || 0) - (a.lastPlayed || 0) ||
        byTitleAsc(a, b),
    )
    .slice(0, SMART_PLAYLIST_LIMITS["smart:most-played"]);
}

/** "Lossless Saja": semua lagu lossless, urut judul (tanpa batas). */
export function selectLossless(songs: Song[]): Song[] {
  return [...songs].filter(isLosslessSong).sort(byTitleAsc);
}

/** "Belum Pernah Diputar": playCount 0 / belum tercatat, yang terbaru
 *  ditambahkan dulu (supaya lagu baru yang belum didengar muncul di
 *  atas), tanpa batas. */
export function selectNeverPlayed(songs: Song[]): Song[] {
  return [...songs]
    .filter((s) => (s.playCount || 0) === 0)
    .sort(
      (a, b) =>
        (b.dateAdded || 0) - (a.dateAdded || 0) || byTitleAsc(a, b),
    );
}

/** Isi satu smart playlist dari daftar lagu in-memory (dipakai tes +
 *  siapa pun yang sudah memegang `tracks`; layar memakai query SQL
 *  lewat service supaya isinya selalu segar dari DB). */
export function selectSmartPlaylistSongs(
  id: SmartPlaylistId,
  songs: Song[],
): Song[] {
  switch (id) {
    case "smart:recent":
      return selectRecentlyAdded(songs);
    case "smart:most-played":
      return selectMostPlayed(songs);
    case "smart:lossless":
      return selectLossless(songs);
    case "smart:never-played":
      return selectNeverPlayed(songs);
  }
}
