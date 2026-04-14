/**
 * ScanDiffEngine.ts - Fixed Syntax Version
 */

import { LibraryScanner } from "@/features/library/api/scanner";
import { MediaStore, NativeSong } from "@/features/library/native/MediaStoreModule";
import MetadataExtractor from "@/features/library/api/metadata";
import { useLibraryStore } from '../store/libraryStore';

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
   PRIVATE HELPERS
   ============================================= */

async function getNativeSongs(): Promise<NativeSong[]> {
  const songs = await MediaStore.queryAudioFiles();
  return songs.filter((song): song is NativeSong => Boolean(song && song.id));
}

function _emptyQuickResult(): QuickDiffResult {
  return {
    newCount: 0, deletedCount: 0, updatedCount: 0,
    totalScanned: 0, newSongs: [], updatedSongs: [], deletedUris: []
  };
}

function _extractFolder(uri: string): string {
  try {
    const parts = uri.split(/[/\\]/);
    for (let i = parts.length - 2; i >= 0; i--) {
      if (parts[i] && !parts[i].includes('.')) return parts[i];
    }
    return "Music";
  } catch {
    return "Music";
  }
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

/* =============================================
   CORE PROCESSING FUNCTIONS
   ============================================= */

async function saveBasicSongInfo(song: NativeSong): Promise<void> {
  if (!song?.id) return;
  const finalUri = song.uri || `content://media/external/audio/media/${song.id}`;
  const isHiRes = (song.sampleRate || 0) > 48000 || (song.bitDepth || 0) > 16;

  const basicData = {
    id: song.id,
    uri: finalUri,
    filename: song.filename || "",
    title: song.title || song.filename || "Unknown Title",
    artist: song.artist || "Unknown Artist",
    album: song.album || "Unknown Album",
    genre: song.genre || "Unknown Genre",
    folder: song.folder || _extractFolder(finalUri),
    duration: Math.floor(song.duration || 0),
    codec: song.codec || _getCodecFromFilename(song.filename || ""),
    sampleRate: song.sampleRate || 0,
    bitDepth: song.bitDepth || 0,
    isHiRes,
    isEnriched: false,
    dateAdded: song.dateAdded || Date.now(),
  };

  await LibraryScanner.saveToDatabase(basicData);
}

async function processQuickDiff(nativeSongs: NativeSong[]): Promise<QuickDiffResult> {
  const currentUris = new Set(nativeSongs.map(s => s.uri).filter(Boolean));
  const existingUris = LibraryScanner.getExistingUris();

  const newSongs: NativeSong[] = [];
  const updatedSongs: NativeSong[] = [];

  for (const song of nativeSongs) {
    if (!song.uri) continue;

    if (!existingUris.has(song.uri)) {
      await saveBasicSongInfo(song);
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

/* =============================================
   MAIN EXPORTED ENGINE
   ============================================= */

export const ScanDiffEngine = {
  async quickDiff(): Promise<QuickDiffResult> {
    const { isAutoScanEnabled } = useLibraryStore.getState();
    if (!isAutoScanEnabled) return _emptyQuickResult();

    try {
      const nativeSongs = await getNativeSongs();
      return await processQuickDiff(nativeSongs);
    } catch (error) {
      console.error("[ScanDiffEngine] Quick diff failed:", error);
      return _emptyQuickResult();
    }
  },

  async runMediaStoreDiff(onProgress?: (c: number, t: number) => void): Promise<DiffResult> {
    try {
      const nativeSongs = await getNativeSongs();
      const existingUris = LibraryScanner.getExistingUris();
      const currentUris = new Set(nativeSongs.map(s => s.uri).filter(Boolean));

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

      const allChanges = [...newSongs, ...updatedSongs];
      for (let i = 0; i < allChanges.length; i++) {
        await saveBasicSongInfo(allChanges[i]);
        onProgress?.(i + 1, allChanges.length);
      }

      return {
        newCount: newSongs.length,
        deletedCount: deletedUris.length,
        updatedCount: updatedSongs.length,
        totalAfter: currentUris.size,
        totalScanned: nativeSongs.length,
        newSongs,
        updatedSongs,
        deletedUris,
      };
    } catch (error) {
      console.error("[ScanDiffEngine] Full diff failed:", error);
      throw error;
    }
  }
};



