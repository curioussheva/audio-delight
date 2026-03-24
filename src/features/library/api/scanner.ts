import * as FileSystem from "expo-file-system";
import { db } from "@/shared/lib/sqlite";
import { Song } from "@/shared/types/audio";
import metadataExtractor from "./metadata";

const fs = FileSystem as any;
const ARTWORK_CACHE_DIR = `${fs.cacheDirectory || ''}artworks/`;
// Gunakan nama yang konsisten dengan pemanggilan di bawah
const SAF = fs.StorageAccessFramework;

export class LibraryScanner {
  private static supportedFormats = [
    "flac", "wav", "alac", "dsd",
    "mp3", "m4a", "aac", "dsf", "dff", "ogg", "opus",
  ];

  private static uriToId(uri: string): string {
    let hash = 5381;
    for (let i = 0; i < uri.length; i++) {
      hash = (hash * 33) ^ uri.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }
  
  static async initDatabase(): Promise<void> {
    db.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        uri TEXT UNIQUE,
        -- ... kolom lainnya (pastikan ada fileSize jika ingin disimpan)
        fileSize INTEGER DEFAULT 0
      );
    `);
  }

  static async scanDirectory(
    path: string,
    onProgress?: (curr: number, total: number) => void
  ): Promise<void> {
    if (!path) return;

    const allFiles: { uri: string; filename: string }[] = [];
    
    // Pastikan SAF tersedia sebelum scanning
    if (!SAF) {
      console.error("Storage Access Framework tidak tersedia di perangkat ini.");
      return;
    }

    if (path.startsWith("content://")) {
      await LibraryScanner.collectSAFFiles(path, allFiles);
    } else {
      // Pastikan method ini ada atau arahkan ke collectSAFFiles jika semua lewat SAF
      console.warn("Path bukan content://, mencoba SAF fallback...");
      await LibraryScanner.collectSAFFiles(path, allFiles);
    }

    const total = allFiles.length;
    for (let i = 0; i < total; i++) {
      try {
        await LibraryScanner.processAudioFile(allFiles[i].uri, allFiles[i].filename);
      } catch (e) {
        console.warn(`[LibraryScanner] Skip ${allFiles[i].filename}:`, e);
      }
      onProgress?.(i + 1, total);
    }
  }

  private static async collectSAFFiles(
    directoryUri: string,
    result: { uri: string; filename: string }[]
  ): Promise<void> {
    try {
      // Gunakan variabel 'SAF' yang sudah didefinisikan di atas
      const files = await SAF.readDirectoryAsync(directoryUri);
      
      for (const uri of files) {
        // Decode URI untuk mengecek ekstensi dan folder
        const decodedUri = decodeURIComponent(uri);
        const isDirectory = uri.endsWith("%2F") || !decodedUri.includes("."); 
        const filename = decodedUri.split("/").pop() || decodedUri.split("%2F").pop() || "";
        
        if (isDirectory) {
          await LibraryScanner.collectSAFFiles(uri, result);
        } else {
          const ext = filename.split(".").pop()?.toLowerCase();
          if (ext && LibraryScanner.supportedFormats.includes(ext)) {
            result.push({ uri, filename });
          }
        }
      }
    } catch (e) {
      console.error("[Scanner] SAF Error:", e);
    }
  }

  private static async processAudioFile(
    uri: string,
    filename: string
  ): Promise<void> {
    // Ekstraksi metadata langsung dari Content URI
    const meta = await metadataExtractor.extract(uri);
    
    const id = LibraryScanner.uriToId(uri);
    // Folder path untuk grouping di UI
    const folder = uri.substring(0, uri.lastIndexOf("%2F")) || "Root";

    let fileSize = 0;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) {
        fileSize = info.size || 0;
      }
    } catch (e) {
      // Tidak kritikal, lanjut saja
    }

    db.execute(
      `INSERT OR REPLACE INTO songs (
        id, title, artist, album, genre, folder, filename,
        uri, originalUri, artwork, duration, sampleRate, bitDepth,
        codec, bitrate, fileSize, dateAdded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        meta.title || filename,
        meta.artist || "Unknown Artist",
        meta.album || "Unknown Album",
        meta.genre || "Unknown",
        folder,
        filename,
        uri,
        uri,
        meta.artwork || null,
        meta.duration || 0,
        meta.sampleRate || null,
        meta.bitDepth || null,
        meta.codec || null,
        meta.bitrate || null,
        fileSize,
        Date.now(),
      ]
    );
  }

  static getLibrarySongs(): Song[] {
    try {
      const result = db.execute("SELECT * FROM songs ORDER BY title ASC");
      // Fallback multi-driver untuk expo-sqlite
      const res = result as any;
      const data = res.rows?._array || res.rows?.getAll?.() || (Array.isArray(res) ? res : []);
      return data as Song[];
    } catch (e) {
      console.error("Gagal ambil library:", e);
      return [];
    }
  }
}
 
 