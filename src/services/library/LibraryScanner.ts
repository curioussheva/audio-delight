// src/services/library/LibraryScanner.ts
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Song, AudioMetadata } from '@/types/audio';
import { parseLRC } from '@/utils/LrcParser';
// Tambahkan di bagian atas file:
import { usePlayerStore } from '@/store/playerStore';


// Gunakan openDatabaseSync untuk SDK terbaru
const db = SQLite.openDatabaseSync('pristineaudio.db');
const loadLyrics = async (songPath: string) => {
  const lrcPath = songPath.replace(/\.[^/.]+$/, ".lrc"); // Ganti .mp3/.flac ke .lrc
  
  try {
    const fileInfo = await FileSystem.getInfoAsync(lrcPath);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(lrcPath);
      const parsed = parseLRC(content);
      usePlayerStore.getState().setLyrics(parsed);
    } else {
      usePlayerStore.getState().setLyrics([]);
    }
  } catch (e) {
    usePlayerStore.getState().setLyrics([]);
  }
};

export class LibraryScanner {
  private static supportedFormats = ['flac', 'wav', 'alac', 'dsd', 'mp3', 'm4a'];

  static async initDatabase() {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        uri TEXT UNIQUE NOT NULL,
        duration INTEGER,
        sampleRate INTEGER,
        bitDepth INTEGER,
        codec TEXT,
        bitrate INTEGER,
        artwork TEXT,
        dateAdded INTEGER
      );
    `);

await db.execAsync(`
  CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
  CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
`);

  }

  /**
   * RECURSIVE SCANNER: Fungsi ini yang dicari oleh library.tsx
   */
  static async scanDirectory(path: string, onProgress?: (curr: number, total: number) => void) {
    try {
      const files = await FileSystem.readDirectoryAsync(path);
      const total = files.length;
      
      for (let i = 0; i < total; i++) {
        const file = files[i];
        const uri = `${path}${file}`;
        const info = await FileSystem.getInfoAsync(uri);

        if (info.isDirectory) {
          await this.scanDirectory(`${uri}/`, onProgress);
        } else {
          const ext = file.split('.').pop()?.toLowerCase();
          if (ext && this.supportedFormats.includes(ext)) {
            await this.processAudioFile(uri, file);
          }
        }
        onProgress?.(i + 1, total);
      }
    } catch (e) {
      console.error("Scan error:", e);
    }
  }

  private static async processAudioFile(uri: string, filename: string) {
    const metadata = await this.extractMetadata(uri, filename);
    const songId = btoa(uri).substring(0, 16); 

    await db.runAsync(
      `INSERT OR REPLACE INTO songs (id, title, artist, album, uri, duration, sampleRate, bitDepth, codec, bitrate, dateAdded) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [songId, metadata.title, metadata.artist, metadata.album, uri, metadata.duration, metadata.sampleRate, metadata.bitDepth, metadata.codec, metadata.bitrate, Date.now()]
    );
  }

  // ... (extractMetadata & getLibrarySongs tetap seperti kode Anda)
  static async getLibrarySongs(): Promise<Song[]> {
    return await db.getAllAsync<Song>('SELECT * FROM songs ORDER BY title ASC');
  }

  private static async extractMetadata(uri: string, filename: string): Promise<AudioMetadata> {
    const ext = filename.split('.').pop()?.toUpperCase() || 'UNKNOWN';
    return {
      title: filename.replace(/\.[^/.]+$/, ""),
      artist: "Unknown Artist",
      album: "Unknown Album",
      duration: 0,
      sampleRate: 44100,
      bitDepth: 16,
      codec: ext,
      bitrate: 320
    };
  }
}
