// src/features/library/services/lyricsSource.ts
//
// L1: sumber lirik LOKAL saja (sejalan dengan arah enrichment lokal-only).
// TIDAK PERNAH fetch online.
//
// Dua sumber, prioritas:
//   1. File `.lrc` berdampingan (folder sama, basename sama dengan file
//      audio) → `lyrics_synced` (teks LRC, ber-timestamp).
//   2. Lirik embedded (USLT) → `lyrics` (teks polos).
//
// KOREKSI dari hasil telusur (2026-11-18): sumber (2) TIDAK tersedia
// dengan cara kecil — reader yang dipakai repo
// (@missingcore/audio-metadata, dipakai visualizer/api/analyzer.ts)
// TIDAK mem-parse USLT: ID3Reader-nya hanya menangani frame
// TALB/TPE2/TPE1/TIT2/TRCK/TYER/TDRC + APIC, tanpa USLT; begitu pula
// FLAC/MP4Reader tanpa LYRICS/©lyr. Field `common.lyrics` di
// audio-metadata.d.ts tidak pernah diisi reader mana pun. Jalur live
// (MediaStore NativeSong → convertNativeToSong) bahkan tidak memakai
// reader itu sama sekali, dan `metadataAdapter.ts` (metadataToSong)
// 0 pemanggil. Jadi (2) TIDAK diimplementasikan di sini — yang jalan
// hanya (1) `.lrc`, + plumbing DB/tipe untuk keduanya (bila suatu saat
// ada parser USLT, tinggal mengisi `lyrics`).
//
// Catatan scoped storage: baca `.lrc` lewat path file langsung
// (expo-file-system) bisa ditolak Android 13+ untuk file non-media —
// semua kegagalan dibungkam jadi null (lirik tetap kosong, bukan crash).
// Verifikasi di HP csheva yang menentukan.

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import {
  parseLRC,
  parsePlainLyrics,
  type LirikLine,
} from "@/shared/utils/LrcParser";
// L2: jangan hidupkan lagi lirik yang diatur manual user (dihapus /
// diganti lewat menu Lirik di [id].tsx) — penanda I3 di `edited_fields`.
import { isLyricsManuallySet } from "@/features/library/utils/lyricsEdit";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import type { Song } from "@/shared/types/audio";

/** Teks LRC dari kolom DB / file `.lrc` → baris ber-timestamp. */
export type LyricsText = Pick<Song, "lyrics" | "lyricsSynced">;

/**
 * DB → baris lirik untuk player store. Synced diutamakan; bila teks LRC
 * tidak menghasilkan baris (rusak), jatuh ke lirik polos; bila keduanya
 * kosong → [] (FullLyricsView menampilkan "Instrumental or No Lyrics Found").
 */
export function songLyricsToLines(song: LyricsText): LirikLine[] {
  if (song.lyricsSynced?.trim()) {
    const lines = parseLRC(song.lyricsSynced);
    if (lines.length > 0) return lines;
  }
  if (song.lyrics?.trim()) return parsePlainLyrics(song.lyrics);
  return [];
}

/**
 * Path file `.lrc` berdampingan dari path file audio (murni):
 * folder sama, basename sama, ekstensi diganti `.lrc`.
 * Kembalikan null bila path tidak bisa diturunkan.
 */
export function sidecarLrcPath(audioPath: string | null | undefined): string | null {
  if (!audioPath) return null;
  const clean = audioPath.split("?")[0];
  const withoutExt = clean.replace(/\.[^/.]+$/, "");
  if (!withoutExt || withoutExt === clean) return null;
  return `${withoutExt}.lrc`;
}

/**
 * Path file lokal (file://) dari URI lagu. URI content:// diselesaikan
 * lewat MediaLibrary (pola yang sama dengan resolveToLocalUri di
 * visualizer/api/analyzer.ts); file:// diteruskan apa adanya.
 */
export async function resolveAudioLocalPath(
  uri: string | null | undefined,
): Promise<string | null> {
  if (!uri) return null;
  try {
    if (!uri.startsWith("content://")) return uri;
    const assetId = uri.split("/").pop() ?? "";
    if (!assetId) return null;
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    return info.localUri ?? info.uri ?? null;
  } catch {
    return null;
  }
}

/**
 * Baca file `.lrc` berdampingan untuk satu lagu. Kembalikan teks LRC
 * mentah, atau null bila tidak ada / tidak bisa dibaca (termasuk bila
 * scoped storage menolak). TIDAK PERNAH throw.
 */
export async function readSidecarLrc(
  uri: string | null | undefined,
): Promise<string | null> {
  try {
    const localPath = await resolveAudioLocalPath(uri);
    const lrcPath = sidecarLrcPath(localPath);
    if (!lrcPath) return null;
    const info = await FileSystem.getInfoAsync(lrcPath);
    if (!info.exists || info.isDirectory) return null;
    const text = await FileSystem.readAsStringAsync(lrcPath);
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Lazy-load lirik untuk satu lagu yang DB-nya masih kosong (dipakai
 * playSong — backfill untuk library lama yang sudah ter-enrich sebelum
 * L1). Urutan: `.lrc` berdampingan → (embedded USLT: belum tersedia,
 * lihat catatan di atas). Bila ketemu, hasilnya di-cache ke DB + store
 * supaya pemutaran berikutnya langsung dari DB. Kembalikan baris lirik,
 * atau null bila tidak ada sumber yang membuahkan hasil. TIDAK PERNAH throw.
 */
export async function loadLyricsForSong(
  song: Song,
): Promise<{ lines: LirikLine[] } | null> {
  try {
    // DB sudah punya — pemanggil sudah menampilkannya; jangan baca file.
    if (song.lyricsSynced?.trim() || song.lyrics?.trim()) return null;

    // L2: lirik diatur manual user (dihapus / diganti lewat menu Lirik)
    // — jangan baca .lrc lagi, sekalipun file-nya masih ada di disk.
    if (isLyricsManuallySet(song)) return null;

    const lrcText = await readSidecarLrc(song.uri);
    if (!lrcText) return null;
    const lines = parseLRC(lrcText);
    if (lines.length === 0) return null;

    // Cache supaya pemutaran berikutnya langsung dari DB.
    try {
      await LibraryScanner.updateMetadata(song.id, {
        lyricsSynced: lrcText,
      });
      useLibraryStore.getState().updateTrack(song.id, {
        lyricsSynced: lrcText,
      });
    } catch {
      // Cache gagal = lirik tetap tampil dari memori kali ini.
    }
    return { lines };
  } catch {
    return null;
  }
}
