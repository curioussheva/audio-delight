/**
 * ScanDiffEngine.ts - Versi Final untuk Mengatasi "Song without URI"
 */

import * as MediaLibrary from "expo-media-library";
import { LibraryScanner } from "@/features/library/api/scanner";
import { MediaStore, NativeSong } from "@/features/library/native/MediaStoreModule";
import MetadataExtractor from "@/features/library/api/metadata";
import { useLibraryStore } from '../store/libraryStore';

const SUPPORTED_EXTENSIONS = new Set([
  "mp3", "flac", "m4a", "wav", "aac", "ogg", "opus",
  "dsf", "dsd", "dff", "alac", "ape", "wma"
]);

const NOISE_PATTERNS = [
  /\s*\(\d+\)\s*$/,
  /\s*-\s*copy\s*$/i,
  /\s*-\s*Copy\s*$/i,
  /^\d+[\s\.\-]+/,
  /\s*\[.*?\]\s*/g,
  /\s*\(.*?\)\s*/g,
  /\s*-\s*YouTube\s*$/i,
  /\s*-\s*youtube\s*$/i,
  /\s*-\s*Official\s*$/i,
  /\s*-\s*Live\s*$/i,
  /\s*-\s*Remix\s*$/i,
  /\s*-\s*Explicit\s*$/i,
  /\s*-\s*MP3\s*$/i,
  /\s*-\s*FLAC\s*$/i,
  /\s*-\s*WAV\s*$/i,
];

/* =============================================
   MAIN EXPORTED ENGINE
   ============================================= */

export const ScanDiffEngine = {
  quickDiff,
  runMediaStoreDiff,
  processSongWithMetadata,
  removeSongs,
};

/* =============================================
   TYPE DEFINITIONS
   ============================================= */

export type DiffResult = {
  newCount: number;
  deletedCount: number;
  updatedCount: number;
  totalAfter: number;
  totalScanned: number;
  newSongs: NativeSong[];
  updatedSongs: NativeSong[];
  deletedUris: string[];
};

export type QuickDiffResult = {
  newCount: number;
  deletedCount: number;
  updatedCount: number;
  totalScanned: number;
  newSongs: NativeSong[];
  updatedSongs: NativeSong[];
  deletedUris: string[];
};

/* =============================================
   PUBLIC FUNCTIONS
   ============================================= */

export async function quickDiff(): Promise<QuickDiffResult> {
  console.log("[ScanDiffEngine] Starting QUICK diff...");

  try {
    const nativeSongs = await getNativeSongs();
    return await processQuickDiff(nativeSongs);
  } catch (error) {
    console.warn("[ScanDiffEngine] Quick diff failed, using fallback:", error);
    return _runQuickFallbackDiff();
  }
}

export async function runMediaStoreDiff(
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  console.log("[ScanDiffEngine] Starting FULL diff...");

  try {
    const nativeSongs = await getNativeSongs();
    return await processFullDiff(nativeSongs, onProgress);
  } catch (error) {
    console.warn("[ScanDiffEngine] Full diff failed, using fallback:", error);
    return _runFallbackDiff(onProgress);
  }
}

export async function processSongWithMetadata(song: NativeSong): Promise<void> {
  if (!song?.uri) {
    console.warn(`[ScanDiffEngine] Skipping song with missing URI: ${song?.filename}`);
    return;
  }

  const isUpdate = !!LibraryScanner.getSongByUri(song.uri);
  await _processSongWithMetadata(song, isUpdate);
}

export async function removeSongs(uris: string[]): Promise<void> {
  if (!uris?.length) return;
  await LibraryScanner.deleteSongsByUris(uris);
}

/* =============================================
   PRIVATE HELPERS
   ============================================= */

async function getNativeSongs(): Promise<NativeSong[]> {
  const songs = await MediaStore.queryAudioFiles();
  return songs.filter((song): song is NativeSong => {
    if (!song) return false;
    // Pastikan minimal ada id, meskipun uri kosong
    return Boolean(song.id);
  });
} 

async function processQuickDiff(nativeSongs: NativeSong[]): Promise<QuickDiffResult> {
  const currentUris = new Set(nativeSongs.map(s => s.uri));
  const existingUris = LibraryScanner.getExistingUris();

  const newSongs: NativeSong[] = [];
  const updatedSongs: NativeSong[] = [];

  for (const song of nativeSongs) {
    if (!song.uri) continue;

    if (!existingUris.has(song.uri)) {
      await _saveBasicSongInfo(song);
      newSongs.push(song);
    } else {
      const existing = LibraryScanner.getSongByUri(song.uri);
      if (existing && existing.fileSize !== song.fileSize) {
        updatedSongs.push(song);
      }
    }
  }

  const deletedUris = [...existingUris].filter(uri => !currentUris.has(uri));
  if (deletedUris.length > 0) {
    await LibraryScanner.deleteSongsByUris(deletedUris);
  }

  console.log(`[ScanDiffEngine][Quick] New: ${newSongs.length} | Updated: ${updatedSongs.length} | Deleted: ${deletedUris.length}`);

  return {
    newCount: newSongs.length,
    deletedCount: deletedUris.length,
    updatedCount: updatedSongs.length,
    totalScanned: nativeSongs.length,
    newSongs,
    updatedSongs,
    deletedUris,
  };
}

async function processFullDiff(
  nativeSongs: NativeSong[],
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  const currentUris = new Set(nativeSongs.map(s => s.uri));
  const existingUris = LibraryScanner.getExistingUris();

  const newSongs: NativeSong[] = [];
  const updatedSongs: NativeSong[] = [];

  for (const song of nativeSongs) {
    if (!song.uri) continue;

    if (!existingUris.has(song.uri)) {
      newSongs.push(song);
    } else {
      const existing = LibraryScanner.getSongByUri(song.uri);
      if (existing && existing.fileSize !== song.fileSize) {
        updatedSongs.push(song);
      }
    }
  }

  const deletedUris = [...existingUris].filter(uri => !currentUris.has(uri));
  if (deletedUris.length > 0) {
    await LibraryScanner.deleteSongsByUris(deletedUris);
  }

  const changes = [...newSongs, ...updatedSongs];
  const totalChanges = changes.length;

  for (let i = 0; i < changes.length; i++) {
    const song = changes[i];
    await _processSongWithMetadata(song, !!LibraryScanner.getSongByUri(song.uri));
    onProgress?.(i + 1, totalChanges);
  }

  const totalAfter = existingUris.size - deletedUris.length + newSongs.length;

  console.log(`[ScanDiffEngine][Full] New: ${newSongs.length} | Updated: ${updatedSongs.length} | Deleted: ${deletedUris.length}`);

  return {
    newCount: newSongs.length,
    deletedCount: deletedUris.length,
    updatedCount: updatedSongs.length,
    totalAfter,
    totalScanned: nativeSongs.length,
    newSongs,
    updatedSongs,
    deletedUris,
  };
}

/* =============================================
   SONG PROCESSING HELPERS - DITINGKATKAN
   ============================================= */

async function _saveBasicSongInfo(song: NativeSong): Promise<void> {
  if (!song || !song.id) {
    console.warn(`[ScanDiffEngine] Cannot save invalid song: ${song?.filename}`);
    return;
  }

  // Fallback URI yang sangat kuat
  const finalUri = song.uri || `content://media/external/audio/media/${song.id}`;

  const basicData = {
    id: song.id,
    uri: finalUri,                          // Selalu ada
    filename: song.filename || "",
    title: song.title || _parseTitleFromFilename(song.filename || ""),
    artist: song.artist || _parseArtistFromFilename(song.filename || ""),
    album: song.album || "Unknown Album",
    genre: song.genre || "Unknown Genre",
    folder: song.folder || _extractFolder(finalUri),
    artwork: song.artworkUri,
    duration: Math.floor(song.duration || 0),
    codec: song.codec || _getCodecFromFilename(song.filename || ""),
    sampleRate: song.sampleRate || 0,
    bitDepth: song.bitDepth || 0,
    bitrate: song.bitrate || 0,
    fileSize: song.fileSize || 0,
    isEnriched: false,
    isFavorite: false,
    playCount: 0,
    dateAdded: song.dateAdded || Date.now(),
  };

  try {
    await LibraryScanner.saveToDatabase(basicData);
    console.log(`[LibraryScanner] Saved song: \( {basicData.title} ( \){finalUri.substring(0, 60)}...)`);
  } catch (error) {
    console.error(`[ScanDiffEngine] Failed to save song ${song.id}:`, error);
  }
} 

async function _processSongWithMetadata(song: NativeSong, isUpdate: boolean): Promise<void> {
  if (!song?.uri) {
    console.warn(`[ScanDiffEngine] Skipping metadata process: no URI`);
    return;
  }

  try {
    const enhanced = await MetadataExtractor.extract(song.uri);

    const songData = {
      id: song.id,
      uri: song.uri,
      originalUri: song.uri,                    // ← Tambahkan ini
      filename: song.filename,
      title: enhanced?.title || song.title || _parseTitleFromFilename(song.filename),
      artist: enhanced?.artist || song.artist || _parseArtistFromFilename(song.filename),
      album: enhanced?.album || song.album || "Unknown Album",
      genre: enhanced?.genre || song.genre || "Unknown Genre",
      folder: song.folder || _extractFolder(song.uri),
      artwork: enhanced?.artwork || song.artworkUri,
      duration: Math.floor(song.duration || enhanced?.duration || 0),
      codec: song.codec || enhanced?.codec || _getCodecFromFilename(song.filename),
      sampleRate: enhanced?.sampleRate || song.sampleRate || 0,
      bitDepth: enhanced?.bitDepth || song.bitDepth || 0,
      bitrate: enhanced?.bitrate || song.bitrate || 0,
      fileSize: song.fileSize || 0,
      isEnriched: !!enhanced,                    // ← Ini yang penting
      enrichedAt: !!enhanced ? Date.now() : null,
      dateAdded: song.dateAdded || Date.now(),
    };

    await LibraryScanner.saveToDatabase(songData);

    // Mark as enriched di store juga
    if (enhanced) {
      useLibraryStore.getState().markAsEnriched(song.id, { isEnriched: true });
    }

  } catch (error) {
    console.warn(`[ScanDiffEngine] Metadata extraction failed for ${song.filename}:`, error);
    await _saveBasicSongInfo(song);
  }
} 

/* =============================================
   FALLBACK & UTILITY
   ============================================= */

async function _runQuickFallbackDiff(): Promise<QuickDiffResult> {
  console.log("[ScanDiffEngine] Running quick fallback diff...");
  return {
    newCount: 0,
    deletedCount: 0,
    updatedCount: 0,
    totalScanned: 0,
    newSongs: [],
    updatedSongs: [],
    deletedUris: [],
  };
}

async function _runFallbackDiff(
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  console.log("[ScanDiffEngine] Running full fallback diff...");
  return {
    newCount: 0,
    deletedCount: 0,
    updatedCount: 0,
    totalAfter: 0,
    totalScanned: 0,
    newSongs: [],
    updatedSongs: [],
    deletedUris: [],
  };
}

function _cleanNoise(str: string): string {
  let cleaned = (str || "").trim();
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function _parseArtistFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");
  if (dashIndex > 0) {
    const before = withoutExt.substring(0, dashIndex).trim();
    if (/^\d+$/.test(before) || before.length < 2 || before.length > 50) {
      return "Unknown Artist";
    }
    return _cleanNoise(before);
  }
  return "Unknown Artist";
}

function _parseTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");
  const raw = dashIndex > 0 
    ? withoutExt.substring(dashIndex + 3).trim() 
    : withoutExt;

  let title = _cleanNoise(raw);
  // Khusus untuk lagu Indonesia/karaoke
  title = title.replace(/\(Karaoke Video\)/i, "").trim();
  return title || "Unknown Title";
}

function _getCodecFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase() ?? "UNKNOWN";
  const codecMap: Record<string, string> = {
    'MP3': 'MP3', 'FLAC': 'FLAC', 'WAV': 'WAV', 'M4A': 'AAC',
    'AAC': 'AAC', 'OGG': 'OGG', 'OPUS': 'OPUS', 'DSF': 'DSD',
    'DFF': 'DSD', 'ALAC': 'ALAC', 'APE': 'APE',
  };
  return codecMap[ext] || ext;
}

function _extractFolder(uri: string): string {
  try {
    const parts = uri.split(/[/\\]/);
    for (let i = parts.length - 2; i >= 0; i--) {
      if (parts[i] && !parts[i].includes('.')) {
        return parts[i];
      }
    }
    return "Music";
  } catch {
    return "Music";
  }
} 