// src/services/library/LibraryScanner.ts
import * as FileSystem from "expo-file-system";
import { db } from "../database/SQLiteService"; // Gunakan Quick SQLite Service
import { Song, AudioMetadata } from "@/types/audio";
import { parseLRC } from "@/utils/LrcParser";
import { usePlayerStore } from "@/store/playerStore";

export class LibraryScanner {
  private static supportedFormats = [
    "flac",
    "wav",
    "alac",
    "dsd",
    "mp3",
    "m4a",
    "dsf",
    "dff",
  ];

  /**
   * Menggunakan skema yang konsisten dengan PlaylistService
   */
  static async initDatabase() {
    db.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        uri TEXT UNIQUE NOT NULL,
        duration INTEGER,
        format_sampleRate INTEGER,
        format_bitDepth INTEGER,
        format_codec TEXT,
        format_bitrate INTEGER,
        artwork TEXT,
        dateAdded INTEGER
      );
    `);

    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_uri ON songs(uri);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);`);
  }

  /**
   * RECURSIVE SCANNER: Dioptimasi untuk rekursi folder
   */
  static async scanDirectory(
    path: string,
    onProgress?: (curr: number, total: number) => void,
  ) {
    try {
      // Pastikan path diakhiri dengan slash
      const folderPath = path.endsWith("/") ? path : `${path}/`;
      const files = await FileSystem.readDirectoryAsync(folderPath);
      const total = files.length;

      // Gunakan batching jika memungkinkan, tapi untuk scan file sistem kita proses satu per satu
      for (let i = 0; i < total; i++) {
        const fileName = files[i];
        const uri = `${folderPath}${fileName}`;
        const info = await FileSystem.getInfoAsync(uri);

        if (info.isDirectory) {
          await this.scanDirectory(uri, onProgress);
        } else {
          const ext = fileName.split(".").pop()?.toLowerCase();
          if (ext && this.supportedFormats.includes(ext)) {
            await this.processAudioFile(uri, fileName);
          }
        }
        onProgress?.(i + 1, total);
      }
    } catch (e) {
      console.error("Scan error:", e);
    }
  }

  private static async processAudioFile(uri: string, filename: string) {
    try {
      const metadata = await this.extractMetadata(uri, filename);
      // Generate ID unik dari URI
      const songId = Math.random().toString(36).substring(2, 15);

      db.execute(
        `INSERT OR REPLACE INTO songs (
          id, title, artist, album, uri, duration, 
          format_sampleRate, format_bitDepth, format_codec, format_bitrate, dateAdded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          songId,
          metadata.title,
          metadata.artist,
          metadata.album,
          uri,
          metadata.duration,
          metadata.sampleRate,
          metadata.bitDepth,
          metadata.codec,
          metadata.bitrate,
          Date.now(),
        ],
      );
    } catch (err) {
      console.error(`Failed to process ${filename}:`, err);
    }
  }

  static async getLibrarySongs(): Promise<Song[]> {
    const result = db.execute("SELECT * FROM songs ORDER BY title ASC");
    const rows = result.rows?._array || [];

    // Mapping manual agar sesuai dengan interface Song (termasuk nested format)
    return rows.map(
      (row) =>
        ({
          id: row.id,
          title: row.title,
          artist: row.artist,
          album: row.album,
          uri: row.uri,
          duration: row.duration,
          format: {
            sampleRate: row.format_sampleRate,
            bitDepth: row.format_bitDepth,
            codec: row.format_codec,
            bitrate: row.format_bitrate,
          },
          dateAdded: row.dateAdded,
        }) as Song,
    );
  }

  private static async extractMetadata(
    uri: string,
    filename: string,
  ): Promise<AudioMetadata> {
    const ext = filename.split(".").pop()?.toUpperCase() || "UNKNOWN";
    // Catatan: Di sini idealnya kamu memanggil @missingcore/audio-metadata
    // atau logic analyzer yang sudah kita bahas sebelumnya.
    return {
      title: filename.replace(/\.[^/.]+$/, ""),
      artist: "Unknown Artist",
      album: "Unknown Album",
      duration: 0,
      sampleRate: 44100,
      bitDepth: 16,
      codec: ext,
      bitrate: 320,
    };
  }

  static async loadLyrics(songPath: string) {
    const lrcPath = songPath.replace(/\.[^/.]+$/, ".lrc");
    try {
      const fileInfo = await FileSystem.getInfoAsync(lrcPath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(lrcPath);
        const parsed = parseLRC(content);
        usePlayerStore.getState().setLyrics(parsed);
      } else {
        usePlayerStore.getState().setLyrics([]);
      }
    } catch {
      usePlayerStore.getState().setLyrics([]);
    }
  }
}
