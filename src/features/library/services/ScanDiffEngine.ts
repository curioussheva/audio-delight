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
import { isHiRes } from "@/shared/utils/audioQuality";

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

/**
 * J2-4: error pembatalan — dilempar saat sinyal abort terdeteksi di
 * antara tahap diff / per N lagu di loop tulis. Transaction yang sedang
 * berjalan di-rollback oleh catch di pemanggil, lalu error ini diteruskan
 * (bukan ditelan jadi hasil kosong) supaya pemanggil tahu scan berhenti
 * karena cancel, bukan karena selesai.
 */
export class ScanAbortedError extends Error {
  constructor() {
    super("Scan cancelled");
    this.name = "ScanAbortedError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ScanAbortedError();
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

/**
 * Bangun data dasar lagu dari NativeSong — TANPA menulis DB.
 *
 * Dipakai jalur batch: data dikumpulkan dulu, ditulis sekaligus oleh
 * `LibraryScanner.saveSongsBatched`. `null` = tanpa id (dilewati,
 * sama seperti early return `saveBasicSongInfo` dulu).
 */
function buildBasicSongInfo(song: NativeSong): Record<string, any> | null {
  if (!song?.id) return null;
  const finalUri =
    song.uri || `content://media/external/audio/media/${song.id}`;
  // Codec dipakai dua kali: field codec + penentu isHiRes (U-P1-01).
  const codec = song.codec || _getCodecFromFilename(song.filename || "");
  const isHiResFlag = isHiRes({
    codec,
    sampleRate: song.sampleRate,
    bitDepth: song.bitDepth,
  });

  // ✅ SOLUSI: Bangun URI artwork secara mandiri jika native.artworkUri kosong
  const artworkUri =
    song.artworkUri ||
    (song.albumId
      ? `content://media/external/audio/albums/${song.albumId}/albumart`
      : null);

  return {
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
    codec,
    sampleRate: song.sampleRate || 0,
    bitDepth: song.bitDepth || 0,
    isHiRes: isHiResFlag,
    isEnriched: false,
    dateAdded: song.dateAdded || Date.now(),
  };
}

/** Kumpulkan data dasar untuk banyak lagu (lewati yang tanpa id). */
function buildBasicSongInfos(songs: NativeSong[]): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const song of songs) {
    const basic = buildBasicSongInfo(song);
    if (basic) out.push(basic);
  }
  return out;
}

async function processQuickDiff(
  nativeSongs: NativeSong[],
  signal?: AbortSignal,
): Promise<QuickDiffResult> {
  // J2-4: query bridge tidak bisa dibatalkan — cek pertama begitu query
  // kembali, sebelum diff / tulis apa pun.
  throwIfAborted(signal);

  const existingUris = LibraryScanner.getExistingUris();
  const currentUris = new Set(
    nativeSongs.map((s) => s.uri).filter(Boolean) as string[],
  );

  // J2-2: SATU query ukuran file untuk seluruh diff (bukan satu
  // getSongByUri per lagu yang sudah ada).
  const fileSizeByUri = LibraryScanner.getFileSizeByUri();
  const { newSongs, updatedSongs, deletedUris } = computeDiff(
    nativeSongs,
    existingUris,
    (uri) => fileSizeByUri.get(uri),
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

  // Tulis lagu baru — SATU panggilan executeBatch (satu transaksi
  // native, all-or-nothing). Dulunya loop saveToDatabase per lagu di
  // dalam BEGIN/COMMIT; executeBatch MEMBUKA transaksinya sendiri
  // (quick-sqlite cpp/sqlbatchexecutor.cpp:59), jadi tidak boleh
  // dipanggil di dalam transaksi luar — lihat scanBatchWriter.ts.
  // Gagal/abort sebelum batch = tidak ada yang tertulis, sama seperti
  // rollback sebelumnya.
  const toWrite = [...newSongs, ...updatedSongs];
  if (toWrite.length > 0) {
    throwIfAborted(signal);
    await LibraryScanner.saveSongsBatched(buildBasicSongInfos(toWrite), {
      abortCheck: () => throwIfAborted(signal),
    });
  }

  // N16: hapus gagal SESUDAH tulis commit — jangan buang hasil diff.
  // Lagu baru sudah masuk DB; bila galat ini dilempar, quickDiff
  // melaporkannya sebagai "0 baru" dan lagu itu tidak pernah diantre
  // enrichment (diff berikutnya tidak lagi melihatnya sebagai baru).
  // Laporkan lagu baru seperti biasa + deletedCount 0; penghapusan
  // dicoba lagi di diff berikutnya (lagu masih di DB, tidak ada di
  // MediaStore).
  let reportedDeletedCount = 0;
  let reportedDeletedUris: string[] = [];
  if (finalDeleted.length > 0) {
    throwIfAborted(signal);
    try {
      await LibraryScanner.deleteSongsByUris(finalDeleted);
      reportedDeletedCount = finalDeleted.length;
      reportedDeletedUris = finalDeleted;
    } catch (deleteErr) {
      console.error(
        "[ScanDiffEngine] Quick diff: gagal menghapus lagu lama, ditahan untuk diff berikutnya:",
        deleteErr,
      );
    }
  }

  return {
    newCount: newSongs.length,
    deletedCount: reportedDeletedCount,
    updatedCount: updatedSongs.length,
    totalScanned: nativeSongs.length,
    newSongs,
    updatedSongs,
    deletedUris: reportedDeletedUris,
  };
}

/* =============================================
   MAIN EXPORTED ENGINE
   ============================================= */

export const ScanDiffEngine = {
  /**
   * `bypassAutoScanGate` — lewati gerbang Auto Discovery
   * (`isAutoScanEnabled`) untuk scan perdana fresh install. Gerbang
   * quickDiff milik Auto Discovery (resume, autoScan, background task);
   * scan perdana TIDAK punya toggle — jalan secara default saat fresh
   * install (keputusan csheva 2026-11-18), gerbangnya sudah diperiksa
   * pemanggil (`shouldRunInitialScan` di useScanManager SEBELUM
   * runInitialScan dipanggil). Opsi ini BUKAN jalan pintas — melainkan
   * pernyataan "gerbang sudah diperiksa pemanggil", supaya satu engine
   * tidak perlu tahu kebijakan scan perdana. Semua pemanggil lain
   * tetap digerbangi Auto Discovery seperti dulu bila opsi ini tidak
   * diisi.
   */
  async quickDiff(
    signal?: AbortSignal,
    options?: { bypassAutoScanGate?: boolean },
  ): Promise<QuickDiffResult> {
    // Gerbang Auto Discovery: resume quickDiff, autoScan, dan pemanggil
    // tanpa bypass hanya jalan bila Auto Discovery ON (default OFF).
    const { isAutoScanEnabled } = useLibraryStore.getState();
    if (!isAutoScanEnabled && !options?.bypassAutoScanGate)
      return _emptyQuickResult();

    try {
      const nativeSongs = await getNativeSongs();
      return await processQuickDiff(nativeSongs, signal);
    } catch (error) {
      // J2-4: pembatalan bukan kegagalan — teruskan supaya pemanggil
      // (dan guard isRunning) tahu scan berhenti karena cancel.
      if (error instanceof ScanAbortedError) throw error;
      // N16: galat non-abort (query MediaStore / tulis DB) DILEMPAR,
      // bukan hasil kosong. Sebelumnya ditelan jadi "0 perubahan":
      // koordinator me-bump refreshKey dan men-start worker atas
      // antrean sisa, seolah tidak ada yang berubah. Kedua pemanggil
      // live sudah menangani lemparan (koordinator: catch → false;
      // initial scan: try/catch useScanManager).
      console.error("[ScanDiffEngine] Quick diff failed:", error);
      throw error;
    }
  },

  async runMediaStoreDiff(
    onProgress?: (c: number, t: number) => void,
    signal?: AbortSignal,
  ): Promise<DiffResult> {
    try {
      const nativeSongs = await getNativeSongs();
      // J2-4: query bridge tidak bisa dibatalkan — cek pertama begitu
      // query kembali, sebelum diff / tulis / hapus apa pun.
      throwIfAborted(signal);
      const existingUris = LibraryScanner.getExistingUris();

      // J2-2: SATU query ukuran file untuk seluruh diff (bukan satu
      // getSongByUri per lagu yang sudah ada).
      const fileSizeByUri = LibraryScanner.getFileSizeByUri();
      const { newSongs, updatedSongs, deletedUris } = computeDiff(
        nativeSongs,
        existingUris,
        (uri) => fileSizeByUri.get(uri),
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

      const allChanges = [...newSongs, ...updatedSongs];

      // Tulis batch — SATU panggilan executeBatch (satu transaksi
      // native, all-or-nothing). Dulunya loop saveToDatabase per lagu
      // di dalam BEGIN/COMMIT (1196 commit → 1 commit); kini 289
      // panggilan JSI + SELECT per lagu → 1 panggilan batch + 2 query
      // klasifikasi. Progres dilaporkan batch di awal/akhir (lihat
      // saveSongsBatched) — throttle per-20 tidak lagi relevan.
      throwIfAborted(signal);
      await LibraryScanner.saveSongsBatched(
        buildBasicSongInfos(allChanges),
        {
          onProgress,
          abortCheck: () => throwIfAborted(signal),
        },
      );

      // N6: hapus SESUDAH tulis commit — seperti processQuickDiff.
      // Sebelumnya deleteSongsByUris jalan SEBELUM transaction tulis,
      // jadi cancel di tengah diff meninggalkan penghapusan yang sudah
      // commit sementara tulisannya di-rollback (diff setengah jalan
      // yang tidak bisa dibatalkan). Kini cancel sebelum titik ini hanya
      // membatalkan tulis; penghapusan tidak pernah jalan mendahului
      // tulisan yang belum pasti.
      // N16 (saudara di jalur manual): hapus gagal SESUDAH tulis commit
      // dulu dilempar ke manualScan -> toast "Rescan gagal" padahal lagu
      // baru sudah masuk DB, dan lagu itu tidak diantre enrichment
      // (diff berikutnya tidak lagi melihatnya sebagai baru). Sama
      // seperti processQuickDiff: laporkan lagu baru seperti biasa +
      // deletedCount 0; penghapusan dicoba lagi di diff berikutnya.
      let reportedDeleted: string[] = [];
      if (finalDeleted.length > 0) {
        throwIfAborted(signal);
        try {
          await LibraryScanner.deleteSongsByUris(finalDeleted);
          reportedDeleted = finalDeleted;
        } catch (deleteErr) {
          console.error(
            "[ScanDiffEngine] Full diff: gagal menghapus lagu lama, ditahan untuk diff berikutnya:",
            deleteErr,
          );
        }
      }

      return {
        newCount: newSongs.length,
        deletedCount: reportedDeleted.length,
        updatedCount: updatedSongs.length,
        totalAfter: currentCount,
        totalScanned: nativeSongs.length,
        newSongs,
        updatedSongs,
        deletedUris: reportedDeleted,
      };
    } catch (error) {
      if (error instanceof ScanAbortedError) {
        console.log("[ScanDiffEngine] Full diff cancelled, rolled back");
        throw error;
      }
      console.error("[ScanDiffEngine] Full diff failed:", error);
      throw error;
    }
  },
};
  