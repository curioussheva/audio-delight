/**
 * ScanDiffEngine.ts - Fixed Syntax Version
 */

import { LibraryScanner } from "@/features/library/api/scanner";
import {
  MediaStore,
  NativeSong,
} from "@/features/library/native/MediaStoreModule";
import MetadataExtractor from "@/features/library/api/metadata";
import { useLibraryStore } from "../store/libraryStore";
import { db } from "@/shared/lib/sqlite"; 

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
    newCount: 0,
    deletedCount: 0,
    updatedCount: 0,
    totalScanned: 0,
    newSongs: [],
    updatedSongs: [],
    deletedUris: [],
  };
}

/**
 * Penjaga sebelum menghapus. Menghapus lagu adalah operasi merusak: playlist,
 * favorit, dan riwayat ikut hilang karena merujuk ke lagu yang dihapus.
 *
 * Aturannya: kalau diff ingin menghapus sejumlah besar library sekaligus
 * sementara yang terdeteksi di device sangat sedikit, itu jauh lebih mungkin
 * query MediaStore yang tidak lengkap/gagal daripada pengguna benar-benar
 * menghapus musiknya. Tahan penghapusan, laporkan, jangan tebak.
 *
 * Diekspor untuk pengujian.
 */
export const SAFE_DELETE_RATIO = 0.5;
export const SAFE_DELETE_MIN_COUNT = 5;

export function isDeletionPlausible(
  existingCount: number,
  deletedCount: number,
  currentCount: number,
): boolean {
  // Hapus sedikit lagu: selalu wajar.
  if (deletedCount < SAFE_DELETE_MIN_COUNT) return true;
  // Device melaporkan ada lagu, dan yang dihapus minoritas: wajar.
  if (currentCount > 0 && deletedCount / existingCount <= SAFE_DELETE_RATIO) {
    return true;
  }
  // Device melaporkan NOL lagu padahal database punya banyak: mencurigakan.
  // 5+ lagu hilang sekaligus tanpa satu pun tersisa hampir selalu berarti
  // query gagal, bukan pengguna menghapus semuanya.
  return false;
}

/**
 * Hitung diff murni antara isi database dan hasil MediaStore.
 * Tidak menyentuh database maupun file - hanya menghitung.
 * Diekspor untuk pengujian.
 */
export function computeDiff(
  nativeSongs: NativeSong[],
  existingUris: Set<string>,
  getSongFileSize: (uri: string) => number | undefined,
): { newSongs: NativeSong[]; updatedSongs: NativeSong[]; deletedUris: string[] } {
  const currentUris = new Set(
    nativeSongs.map((s) => s.uri).filter(Boolean) as string[],
  );

  const newSongs: NativeSong[] = [];
  const updatedSongs: NativeSong[] = [];

  for (const song of nativeSongs) {
    if (!song.uri) continue;
    if (!existingUris.has(song.uri)) {
      newSongs.push(song);
    } else {
      const existingSize = getSongFileSize(song.uri);
      if (existingSize !== undefined && existingSize !== song.fileSize) {
        updatedSongs.push(song);
      }
    }
  }

  return {
    newSongs,
    updatedSongs,
    deletedUris: [...existingUris].filter((uri) => !currentUris.has(uri)),
  };
}

function _extractFolder(uri: string): string {
  try {
    const parts = uri.split(/[/\\]/);
    for (let i = parts.length - 2; i >= 0; i--) {
      if (parts[i] && !parts[i].includes(".")) return parts[i];
    }
    return "Music";
  } catch {
    return "Music";
  }
}

function _getCodecFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase() ?? "UNKNOWN";
  const codecMap: Record<string, string> = {
    MP3: "MP3",
    FLAC: "FLAC",
    WAV: "WAV",
    M4A: "AAC",
    AAC: "AAC",
    OGG: "OGG",
    OPUS: "OPUS",
    DSF: "DSD",
    DFF: "DSD",
    ALAC: "ALAC",
    APE: "APE",
  };
  return codecMap[ext] || ext;
}

/* =============================================
   CORE PROCESSING FUNCTIONS
   ============================================= */

async function saveBasicSongInfo(song: NativeSong): Promise<void> {
  if (!song?.id) return;
  const finalUri =
    song.uri || `content://media/external/audio/media/${song.id}`;
  const isHiRes = (song.sampleRate || 0) > 48000 || (song.bitDepth || 0) > 16;

  // ✅ SOLUSI: Bangun URI artwork secara mandiri jika native.artworkUri kosong
  const artworkUri =
    song.artworkUri ||
    (song.albumId
      ? `content://media/external/audio/albums/${song.albumId}/albumart`
      : null);

  const basicData = {
    id: song.id,
    uri: finalUri,
    filename: song.filename || "",
    title: song.title || song.filename || "Unknown Title",
    artist: song.artist || "Unknown Artist",
    album: song.album || "Unknown Album",
    genre: song.genre || "Unknown Genre",
    folder: song.folder || _extractFolder(finalUri),
    artwork: artworkUri, // ✅ TAMBAHKAN INI
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

async function processQuickDiff(
  nativeSongs: NativeSong[],
): Promise<QuickDiffResult> {
  const existingUris = LibraryScanner.getExistingUris();
  const currentUris = new Set(
    nativeSongs.map((s) => s.uri).filter(Boolean) as string[],
  );

  const { newSongs, updatedSongs, deletedUris } = computeDiff(
    nativeSongs,
    existingUris,
    (uri) => LibraryScanner.getSongByUri(uri)?.fileSize,
  );

  // Pengaman: jangan pernah percaya buta pada daftar hapus.
  const bolehHapus = isDeletionPlausible(
    existingUris.size,
    deletedUris.length,
    currentUris.size,
  );
  if (!bolehHapus) {
    console.warn(
      `[ScanDiffEngine] Tahan penghapusan: ${deletedUris.length} dari ` +
        `${existingUris.size} lagu ingin dihapus, tapi MediaStore hanya ` +
        `melaporkan ${currentUris.size} file. Kemungkinan query tidak lengkap.`,
    );
  }
  const finalDeleted = bolehHapus ? deletedUris : [];

  // Tulis lagu baru. Sebelumnya ini dilakukan di dalam loop tanpa
  // transaction, sehingga scan yang gagal di tengah meninggalkan database
  // setengah terisi. Sekarang satu transaction, sama seperti full diff.
  const toWrite = [...newSongs, ...updatedSongs];
  if (toWrite.length > 0) {
    db.execute("BEGIN TRANSACTION");
    try {
      for (const song of toWrite) {
        await saveBasicSongInfo(song);
      }
      db.execute("COMMIT");
    } catch (err) {
      db.execute("ROLLBACK");
      throw err;
    }
  }

  if (finalDeleted.length > 0) {
    await LibraryScanner.deleteSongsByUris(finalDeleted);
  }

  return {
    newCount: newSongs.length,
    deletedCount: finalDeleted.length,
    updatedCount: updatedSongs.length,
    totalScanned: nativeSongs.length,
    newSongs,
    updatedSongs,
    deletedUris: finalDeleted,
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

  async runMediaStoreDiff(
    onProgress?: (c: number, t: number) => void,
  ): Promise<DiffResult> {
    try {
      const nativeSongs = await getNativeSongs();
      const existingUris = LibraryScanner.getExistingUris();

      const { newSongs, updatedSongs, deletedUris } = computeDiff(
        nativeSongs,
        existingUris,
        (uri) => LibraryScanner.getSongByUri(uri)?.fileSize,
      );

      const currentCount = new Set(
        nativeSongs.map((s) => s.uri).filter(Boolean) as string[],
      ).size;

      // Pengaman yang sama seperti quickDiff - jalur ini juga menghapus,
      // dan sebelumnya tanpa penjagaan apa pun.
      const bolehHapus = isDeletionPlausible(
        existingUris.size,
        deletedUris.length,
        currentCount,
      );
      if (!bolehHapus) {
        console.warn(
          `[ScanDiffEngine] Tahan penghapusan (full diff): ${deletedUris.length} ` +
            `dari ${existingUris.size} lagu, MediaStore melaporkan ${currentCount}.`,
        );
      }
      const finalDeleted = bolehHapus ? deletedUris : [];

      if (finalDeleted.length > 0) {
        await LibraryScanner.deleteSongsByUris(finalDeleted);
      }

      const allChanges = [...newSongs, ...updatedSongs];

      // 🔥 OPTIMASI: satu transaction untuk semua write, bukan commit
      // terpisah per lagu (1196 commit → 1 commit). Ini biasanya jadi
      // bottleneck utama untuk bulk insert SQLite.
      db.execute("BEGIN TRANSACTION");
      try {
        const PROGRESS_THROTTLE = 20; // update UI tiap 20 lagu, bukan tiap 1
        for (let i = 0; i < allChanges.length; i++) {
          await saveBasicSongInfo(allChanges[i]);
          if (
            (i + 1) % PROGRESS_THROTTLE === 0 ||
            i + 1 === allChanges.length
          ) {
            onProgress?.(i + 1, allChanges.length);
          }
        }
        db.execute("COMMIT");
      } catch (err) {
        db.execute("ROLLBACK");
        throw err;
      }

      return {
        newCount: newSongs.length,
        deletedCount: finalDeleted.length,
        updatedCount: updatedSongs.length,
        totalAfter: currentCount,
        totalScanned: nativeSongs.length,
        newSongs,
        updatedSongs,
        deletedUris: finalDeleted,
      };
    } catch (error) {
      console.error("[ScanDiffEngine] Full diff failed:", error);
      throw error;
    }
  }, 
};
  