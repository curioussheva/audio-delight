// src/features/library/utils/lyricsEdit.ts
//
// L2: logika MURNI untuk menu Lirik di [id].tsx — status lirik, parse
// tempelan (polos / LRC), dan penanda "diatur manual" (pola I3).
//
// Menu ini untuk lagu yang TIDAK punya file `.lrc`: user menulis /
// menempel lirik atau mengimpor file `.lrc` sendiri, lalu lirik disimpan
// ke DB (kolom `lyrics` / `lyrics_synced`) dan ditandai di `edited_fields`
// supaya proses otomatis (enrichment backfill + lazy-load saat diputar)
// TIDAK menghidupkan lagi lirik yang sengaja dihapus / diganti user.
//
// TIDAK PERNAH fetch online — tidak ada provider lirik yang terpasang
// (MusicBrainz tidak menyediakan lirik).

import {
  parseLRC,
  parsePlainLyrics,
  type LirikLine,
} from "@/shared/utils/LrcParser";

/** Field lirik minimal yang dibutuhkan helper di sini (Song / MediaTrack). */
export interface LyricsFields {
  lyrics?: string | null;
  lyricsSynced?: string | null;
}

/** Status lirik satu lagu, dari DB. */
export type LyricsKind = "synced" | "plain" | "none";

/**
 * Jenis lirik yang tersimpan: synced menang atas polos (sama seperti
 * `songLyricsToLines` — player menampilkan synced bila ada). Teks yang
 * hanya spasi dihitung kosong.
 */
export function getLyricsKind(song: LyricsFields): LyricsKind {
  if (song.lyricsSynced?.trim()) return "synced";
  if (song.lyrics?.trim()) return "plain";
  return "none";
}

/**
 * Jumlah baris lirik yang benar-benar tampil di player. Teks synced
 * yang tidak menghasilkan satu pun baris ber-timestamp (mis. rusak)
 * dihitung 0 — bukan dari jumlah baris mentah.
 */
export function lyricsLineCount(song: LyricsFields): number {
  if (song.lyricsSynced?.trim()) {
    const lines = parseLRC(song.lyricsSynced);
    if (lines.length > 0) return lines.length;
  }
  if (song.lyrics?.trim()) return parsePlainLyrics(song.lyrics).length;
  return 0;
}

export interface ParsedPastedLyrics {
  kind: "synced" | "plain";
  /** Teks polos untuk kolom DB `lyrics` (kosong bila synced). */
  lyrics: string;
  /** Teks LRC mentah untuk kolom DB `lyrics_synced` (kosong bila polos). */
  lyricsSynced: string;
  lines: LirikLine[];
}

/**
 * Parse teks tempelan user. Ada satu saja baris ber-timestamp
 * `[mm:ss.xx]` → synced (tag LRC seperti `[ti:...]` diabaikan parseLRC,
 * baris polos lain dalam tempelan campuran ikut tersimpan mentah tapi
 * tidak tampil — perilaku yang sama dengan file `.lrc`). Tanpa
 * timestamp sama sekali → polos. Teks kosong / hanya spasi → null.
 */
export function parsePastedLyrics(text: string): ParsedPastedLyrics | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = parseLRC(trimmed);
  if (lines.length > 0) {
    return { kind: "synced", lyrics: "", lyricsSynced: trimmed, lines };
  }
  return {
    kind: "plain",
    lyrics: trimmed,
    lyricsSynced: "",
    lines: parsePlainLyrics(trimmed),
  };
}

/** Isi awal editor tempel: teks synced bila ada, kalau tidak teks polos. */
export function lyricsToDisplayText(song: LyricsFields): string {
  if (song.lyricsSynced?.trim()) return song.lyricsSynced;
  return song.lyrics ?? "";
}

/**
 * Apakah lirik lagu ini sudah diatur manual user (ditandai di
 * `edited_fields` oleh updateMetadata dengan `markEdited: true`)?
 * Dipakai guard di enrichment backfill + lazy-load supaya lirik yang
 * dihapus / diganti manual tidak dihidupkan lagi oleh proses otomatis.
 */
export function isLyricsManuallySet(song: {
  editedFields?: string[] | null;
}): boolean {
  const marked = song.editedFields ?? [];
  return marked.includes("lyricsSynced") || marked.includes("lyrics");
}

/** Gabung penanda lama + field baru (unik, terurut) — untuk update store. */
export function mergeEditedFields(
  existing: string[] | undefined,
  ...fields: string[]
): string[] {
  return [...new Set([...(existing ?? []), ...fields])].sort();
}
