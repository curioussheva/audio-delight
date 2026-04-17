// src/features/library/services/LibraryScanner.ts

import { db } from "@/shared/lib/sqlite";
import { Song } from "@/shared/types/audio";
import MetadataExtractor from "@/features/library/api/metadata";
import { MediaStore, NativeSong } from "@/features/library/native/MediaStoreModule";

export interface ScanProgress {
  current: number;
  total: number;
  phase: 'scanning' | 'saving' | 'complete';
  currentFile?: string;
}

export interface ScanResult {
  added: number;
  updated: number;
  deleted: number;
  total: number;
  errors: string[];
}

export class LibraryScanner {
  
  /**
   * FULL SCAN dari MediaStore Android
   */
  static async fullScan(
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    console.log("[LibraryScanner] Starting full scan...");

    const errors: string[] = [];
    let added = 0;
    let updated = 0;

    try {
      onProgress?.({ current: 0, total: 0, phase: 'scanning' });

      const songs = await MetadataExtractor.extractAll((current, total) => {
        onProgress?.({
          current,
          total,
          phase: 'scanning',
          currentFile: `Scanning \( {current}/ \){total}`,
        });
      });

      if (!songs?.length) {
        console.warn("[LibraryScanner] No songs found");
        return { added: 0, updated: 0, deleted: 0, total: 0, errors };
      }

      const existingUris = this.getExistingUris();
      const currentUris = new Set<string>();

      onProgress?.({ current: 0, total: songs.length, phase: 'saving' });

      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song?.uri) {
          errors.push(`Skipped song without URI at index ${i}`);
          continue;
        }

        currentUris.add(song.uri);
        const isExisting = existingUris.has(song.uri);

        try {
          // Pastikan artwork selalu diproses dengan benar
          const processedSong = this.normalizeArtwork(song);

          if (isExisting) {
            await this.updateExistingSong(processedSong);
            updated++;
          } else {
            await this.insertNewSong(processedSong);
            added++;
          }
        } catch (error: any) {
          errors.push(`Failed to save ${song.filename || 'unknown'}: ${error.message}`);
        }

        onProgress?.({
          current: i + 1,
          total: songs.length,
          phase: 'saving',
          currentFile: `Saving \( {i + 1}/ \){songs.length}`,
        });
      }

      const deleted = await this.markDeletedFiles(currentUris);

      console.log(`[LibraryScanner] Scan complete → +${added} added, ${updated} updated, ${deleted} deleted`);
      return { added, updated, deleted, total: songs.length, errors };

    } catch (error: any) {
      console.error("[LibraryScanner] Full scan failed:", error);
      errors.push(error.message);
      return { added, updated, deleted: 0, total: 0, errors };
    }
  }
  
  /**
   * Normalisasi Artwork - Ini bagian paling penting
   */
  private static normalizeArtwork(song: Partial<Song> | NativeSong): Partial<Song> | NativeSong {
    const artworkSources = [
      (song as any).artwork,           // dari MetadataExtractor
      (song as any).artworkUri,
      (song as any).albumArt,
      (song as any).embeddedArtwork,
      (song as any).thumbnail,         // fallback
    ].filter(Boolean);

    const finalArtwork = artworkSources[0] || null;

    return {
      ...song,
      artwork: finalArtwork,
    };
  }

  
  /**
   * INSERT new song (initial scan)
   */
  private static async insertNewSong(song: Partial<Song> | NativeSong): Promise<void> {
    const id = song.id?.toString();
    if (!id) {
      console.warn("[LibraryScanner] Cannot insert song without ID");
      return;
    }
    
    const finalUri = song.uri || `content://media/external/audio/media/${id}`;
    const now = Date.now();
    
    const sql = `
      INSERT INTO songs (
        id, title, artist, album, genre, folder, filename,
        uri, originalUri, artwork, duration, sampleRate, bitDepth,
        codec, bitrate, fileSize, channels,
        year, trackNumber, discNumber,
        isEnriched, isFavorite, playCount, rating,
        dateAdded, lastSeenAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      id,
      song.title || "Unknown Title",
      song.artist || "Unknown Artist",
      song.album || "Unknown Album",
      song.genre || "Unknown Genre",
      (song as any).folder || "Music",
      (song as any).filename || "Unknown File",
      finalUri,
      (song as any).originalUri || finalUri,
      (song as any).artwork || (song as any).artworkUri || null,
      song.duration || 0,
      song.sampleRate || 0,
      song.bitDepth || 0,
      song.codec || "UNKNOWN",
      song.bitrate || 0,
      song.fileSize || 0,
      (song as any).channels || 2,
      (song as any).year || 0,
      (song as any).trackNumber || 0,
      (song as any).discNumber || 0,
      0, // isEnriched
      0, // isFavorite
      0, // playCount
      0, // rating
      song.dateAdded || now,
      now, // lastSeenAt
    ];
    
    try {
      db.execute(sql, params);
      console.log(`[DB] Inserted new song: ${id}`);
    } catch (error) {
      console.error(`[LibraryScanner] Insert failed for ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * UPDATE existing song - PRESERVE user data
   */
  private static async updateExistingSong(song: Partial<Song> | NativeSong): Promise<void> {
    const id = song.id?.toString();
    if (!id) return;

    const now = Date.now();

    const sql = `
      UPDATE songs SET
        title = ?, artist = ?, album = ?, genre = ?, folder = ?, filename = ?,
        uri = ?, originalUri = ?, artwork = ?, duration = ?, sampleRate = ?,
        bitDepth = ?, codec = ?, bitrate = ?, fileSize = ?, channels = ?,
        year = ?, trackNumber = ?, discNumber = ?, lastSeenAt = ?
      WHERE id = ?
    `;

    const params = [
      song.title || "Unknown Title",
      song.artist || "Unknown Artist",
      song.album || "Unknown Album",
      song.genre || "Unknown Genre",
      (song as any).folder || "Music",
      (song as any).filename || "Unknown File",
      song.uri || `content://media/external/audio/media/${id}`,
      (song as any).originalUri || song.uri,
      song.artwork || null,                    // ← Artwork di-update
      song.duration || 0,
      song.sampleRate || 0,
      song.bitDepth || 0,
      song.codec || "UNKNOWN",
      song.bitrate || 0,
      song.fileSize || 0,
      (song as any).channels || 2,
      (song as any).year || 0,
      (song as any).trackNumber || 0,
      (song as any).discNumber || 0,
      now,
      id,
    ];

    db.execute(sql, params);
  }
  
  /**
   * Save single song - PUBLIC API
   */
  static async saveToDatabase(song: Partial<Song> | NativeSong): Promise<void> {
    const id = song.id?.toString();
    if (!id) {
      console.warn("[LibraryScanner] Cannot save song without ID");
      return;
    }
    
    const existing = this.getSongById(id);
    if (existing) {
      await this.updateExistingSong(song);
    } else {
      await this.insertNewSong(song);
    }
  }
  
  /**
   * Get all songs from database
   */
  static async getLibrarySongs(
    options: { 
      searchQuery?: string; 
      filterBy?: 'all' | 'lossless' | 'lossy' | 'hi-res';
      sortBy?: 'title-asc' | 'title-desc' | 'artist-asc' | 'date-added' | 'play-count';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Song[]> {
    try {
      const { 
        searchQuery = "", 
        filterBy = "all", 
        sortBy = "title-asc",
        limit = 1000,
        offset = 0
      } = options;
      
      let query = "SELECT * FROM songs WHERE uri IS NOT NULL AND uri != ''";
      const conditions: string[] = [];
      const params: any[] = [];
      
      if (searchQuery) {
        conditions.push("(title LIKE ? OR artist LIKE ? OR album LIKE ?)");
        params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
      }
      
      if (filterBy === "lossless") {
        conditions.push("codec IN ('FLAC', 'ALAC', 'WAV', 'AIFF', 'APE')");
      } else if (filterBy === "lossy") {
        conditions.push("codec IN ('MP3', 'AAC', 'OGG', 'MP4', 'M4A')");
      } else if (filterBy === "hi-res") {
        conditions.push("(sampleRate > 48000 OR bitDepth > 16)");
      }
      
      if (conditions.length > 0) {
        query += " AND " + conditions.join(" AND ");
      }
      
      switch (sortBy) {
        case "title-asc": query += " ORDER BY title ASC"; break;
        case "title-desc": query += " ORDER BY title DESC"; break;
        case "artist-asc": query += " ORDER BY artist ASC"; break;
        case "date-added": query += " ORDER BY dateAdded DESC"; break;
        case "play-count": query += " ORDER BY playCount DESC"; break;
        default: query += " ORDER BY title ASC";
      }
      
      query += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
      
      const result = db.execute(query, params);
      const rows = result.rows?._array ?? [];
      
      return rows.map((row: any) => this.dbRowToSong(row));
      
    } catch (error: any) {
      console.error("[LibraryScanner] Query error:", error.message);
      return [];
    }
  }
  
  /**
   * Get library statistics
   */
  static async getLibraryStats(): Promise<{
    totalSongs: number;
    totalDuration: number;
    totalSize: number;
    losslessCount: number;
    hiResCount: number;
    avgBitrate: number;
    artistsCount: number;
    albumsCount: number;
    genresCount: number;
  }> {
    try {
      const result = db.execute(`
        SELECT 
          COUNT(*) as totalSongs,
          SUM(duration) as totalDuration,
          SUM(fileSize) as totalSize,
          SUM(CASE WHEN codec IN ('FLAC', 'ALAC', 'WAV', 'AIFF', 'APE') THEN 1 ELSE 0 END) as losslessCount,
          SUM(CASE WHEN (sampleRate > 48000 OR bitDepth > 16) THEN 1 ELSE 0 END) as hiResCount,
          AVG(bitrate) as avgBitrate,
          COUNT(DISTINCT artist) as artistsCount,
          COUNT(DISTINCT album) as albumsCount,
          COUNT(DISTINCT genre) as genresCount
        FROM songs
      `);
      
      const row = result.rows?._array?.[0];
      
      return {
        totalSongs: row?.totalSongs || 0,
        totalDuration: row?.totalDuration || 0,
        totalSize: row?.totalSize || 0,
        losslessCount: row?.losslessCount || 0,
        hiResCount: row?.hiResCount || 0,
        avgBitrate: Math.round(row?.avgBitrate || 0),
        artistsCount: row?.artistsCount || 0,
        albumsCount: row?.albumsCount || 0,
        genresCount: row?.genresCount || 0,
      };
      
    } catch (error) {
      console.error("[LibraryScanner] Get stats failed:", error);
      return {
        totalSongs: 0,
        totalDuration: 0,
        totalSize: 0,
        losslessCount: 0,
        hiResCount: 0,
        avgBitrate: 0,
        artistsCount: 0,
        albumsCount: 0,
        genresCount: 0,
      };
    }
  }
  
  /**
   * Get single song by ID
   */
  static getSongById(id: string): Song | null {
    try {
      const result = db.execute("SELECT * FROM songs WHERE id = ? AND uri IS NOT NULL LIMIT 1", [id]);
      const row = result.rows?._array?.[0];
      return row ? this.dbRowToSong(row) : null;
    } catch (error) {
      console.error("[LibraryScanner] Get song by ID failed:", error);
      return null;
    }
  }
  
  /**
   * Get single song by URI
   */
  static getSongByUri(uri: string): Song | null {
    try {
      const result = db.execute("SELECT * FROM songs WHERE uri = ? LIMIT 1", [uri]);
      const row = result.rows?._array?.[0];
      return row ? this.dbRowToSong(row) : null;
    } catch (error) {
      console.error("[LibraryScanner] Get song by URI failed:", error);
      return null;
    }
  }
  
  /**
   * Get all existing URIs from database
   */
  static getExistingUris(): Set<string> {
    try {
      const result = db.execute("SELECT uri FROM songs WHERE uri IS NOT NULL AND uri != ''");
      const rows = result.rows?._array ?? [];
      return new Set(rows.map((r: any) => r.uri));
    } catch (error) {
      console.error("[LibraryScanner] Get existing URIs failed:", error);
      return new Set();
    }
  }
  
  /**
   * Delete songs by URIs
   */
  static async deleteSongsByUris(uris: string[]): Promise<void> {
    if (uris.length === 0) return;
    
    const batchSize = 100;
    for (let i = 0; i < uris.length; i += batchSize) {
      const batch = uris.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(", ");
      db.execute(`DELETE FROM songs WHERE uri IN (${placeholders})`, batch);
    }
    
    console.log(`[LibraryScanner] Deleted ${uris.length} songs`);
  }
  
  /**
   * Mark files as deleted
   */
  static async markDeletedFiles(currentUris: Set<string>): Promise<number> {
    try {
      const existingUris = this.getExistingUris();
      const deletedUris: string[] = [];
      
      for (const uri of existingUris) {
        if (!currentUris.has(uri)) {
          deletedUris.push(uri);
        }
      }
      
      if (deletedUris.length > 0) {
        await this.deleteSongsByUris(deletedUris);
      }
      
      return deletedUris.length;
      
    } catch (error) {
      console.error("[LibraryScanner] Mark deleted files failed:", error);
      return 0;
    }
  }
  
  /**
   * Clear entire library
   */
  static async clearLibrary(): Promise<void> {
    try {
      db.execute("DELETE FROM songs;");
      db.execute("DELETE FROM recent_plays;");
      db.execute("DELETE FROM playlists;");
      db.execute("DELETE FROM playlist_songs;");
      this.setLastScanTimestamp(0);
      console.log("[LibraryScanner] Library cleared completely");
    } catch (error) {
      console.error("[LibraryScanner] Clear library failed:", error);
    }
  }
  
  /**
   * Update metadata enrichment
   */
  static async updateMetadata(songId: string, metadata: Partial<Song>): Promise<void> {
  try {
    const fields: string[] = [];
    const params: any[] = [];

    const allowedFields = [
      'title', 'artist', 'album', 'genre', 'artwork', 'duration',
      'sampleRate', 'bitDepth', 'bitrate', 'codec', 'fileSize',
      'year', 'trackNumber', 'discNumber', 'composer', 'lyricist',
      'isEnriched', 'artistImageUrl', 'artistBio', 'lastEnrichedAt', // <-- tambahkan
    ];

    for (const field of allowedFields) {
      if (metadata[field as keyof Song] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(metadata[field as keyof Song]);
      }
    }

    if (fields.length === 0) return;

    params.push(songId);
    const sql = `UPDATE songs SET ${fields.join(", ")} WHERE id = ?`;
    db.execute(sql, params);
  } catch (error) {
    console.error(`[LibraryScanner] Failed to update metadata for ${songId}:`, error);
    throw error;
  }
}

  /**
   * Update enrichment data
   */
  static updateEnrichment(uri: string, data: any): void {
    const song = this.getSongByUri(uri);
    if (!song) {
      console.warn(`[LibraryScanner] Cannot find song with URI: ${uri}`);
      return;
    }
    
    const updates: Partial<Song> = { isEnriched: true };
    
    if (data.genre) updates.genre = data.genre;
    if (data.year) updates.year = data.year;
    if (data.mood) updates.mood = data.mood;
    if (data.tempo) updates.tempo = data.tempo;
    if (data.artistImageUrl) updates.artistImageUrl = data.artistImageUrl;
    if (data.artistBio) updates.artistBio = data.artistBio;
    if (data.artwork) updates.artwork = data.artwork;
    if (data.title) updates.title = data.title;
    if (data.artist) updates.artist = data.artist;
    if (data.album) updates.album = data.album;
    
    this.updateMetadata(song.id, updates);
  }
  
  /**
   * Get songs that need enrichment
   */
  static getUnenrichedTracks(limit = 50): Song[] {
    try {
      const result = db.execute(
        `SELECT * FROM songs 
         WHERE isEnriched = 0 
         AND (last_enriched_at IS NULL OR last_enriched_at < ?)
         LIMIT ?`,
        [Date.now() - 7 * 24 * 60 * 60 * 1000, limit]
      );
      
      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => this.dbRowToSong(row));
      
    } catch (error) {
      console.error("[LibraryScanner] Get unenriched tracks failed:", error);
      return [];
    }
  }
  
  /**
   * Reset enrichment flag
   */
  static resetEnrichment(): void {
    db.execute("UPDATE songs SET isEnriched = 0, last_enriched_at = NULL");
    console.log("[LibraryScanner] Enrichment reset for all songs");
  }
  
  /**
   * Increment play count
   */
  static incrementPlayCount(songId: string, duration?: number): void {
    try {
      db.execute(
        `UPDATE songs 
         SET playCount = playCount + 1, 
             lastPlayedAt = ?
         WHERE id = ?`,
        [Date.now(), songId]
      );
      
      if (duration) {
        db.execute(
          `INSERT INTO recent_plays (song_id, played_at, play_duration)
           VALUES (?, ?, ?)`,
          [songId, Date.now(), duration]
        );
      }
    } catch (error) {
      console.error("[LibraryScanner] Increment play count failed:", error);
    }
  }
  
  /**
   * Toggle favorite status
   */
  static toggleFavorite(songId: string): boolean {
    try {
      const song = this.getSongById(songId);
      if (!song) return false;
      
      const newStatus = !song.isFavorite;
      db.execute(
        "UPDATE songs SET isFavorite = ? WHERE id = ?",
        [newStatus ? 1 : 0, songId]
      );
      
      return newStatus;
    } catch (error) {
      console.error("[LibraryScanner] Toggle favorite failed:", error);
      return false;
    }
  }
  
  /**
   * Update rating
   */
  static updateRating(songId: string, rating: number): void {
    try {
      db.execute(
        "UPDATE songs SET rating = ? WHERE id = ?",
        [Math.min(5, Math.max(0, rating)), songId]
      );
    } catch (error) {
      console.error("[LibraryScanner] Update rating failed:", error);
    }
  }
  
  /**
   * Debug database - find and fix issues
   */
  static async debugDatabase(): Promise<void> {
    try {
      const result = db.execute("SELECT id, title, uri FROM songs WHERE uri IS NULL OR uri = ''");
      const invalidRows = result.rows?._array ?? [];
      
      if (invalidRows.length > 0) {
        console.warn(`[LibraryScanner] Found ${invalidRows.length} songs with missing URI:`);
        invalidRows.forEach((row: any) => {
          console.warn(`  - ID: ${row.id}, Title: ${row.title}`);
        });
        
        db.execute("DELETE FROM songs WHERE uri IS NULL OR uri = ''");
        console.log(`[LibraryScanner] Deleted ${invalidRows.length} invalid songs`);
      }
    } catch (error) {
      console.error("[LibraryScanner] Debug failed:", error);
    }
  }
  
  // ========== PRIVATE METHODS ==========
  
  private static uriToId(uri: string): string {
    let hash = 5381;
    for (let i = 0; i < uri.length; i++) {
      hash = (hash * 33) ^ uri.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }
  
  public static dbRowToSong(row: any): Song {
  return {
    // Required fields
    id: String(row.id || ""),
    uri: row.uri || "",
    title: row.title || "Unknown Title",
    artist: row.artist || "Unknown Artist",
    album: row.album || "Unknown Album",
    duration: Number(row.duration || 0),

    // Optional fields
    genre: row.genre || undefined,
    folder: row.folder || undefined,
    filename: row.filename || undefined,
    artwork: row.artwork || undefined,
    codec: row.codec || undefined,
    sampleRate: Number(row.sampleRate) || undefined,
    bitDepth: Number(row.bitDepth) || undefined,
    bitrate: Number(row.bitrate) || undefined,
    fileSize: Number(row.fileSize) || undefined,
    channels: Number(row.channels) || 2,
    year: Number(row.year) || undefined,
    trackNumber: Number(row.trackNumber) || undefined,
    discNumber: Number(row.discNumber) || undefined,
    
    // Boolean fields
    isEnriched: Boolean(row.isEnriched),
    isFavorite: Boolean(row.isFavorite),
    isHiRes: (Number(row.sampleRate) > 48000) || (Number(row.bitDepth) > 16),
    
    // Additional fields
    albumId: Number(row.albumId) || undefined,
    label: row.label || undefined,
    publisher: row.publisher || undefined,
    mood: row.mood || undefined,
    tempo: Number(row.tempo) || undefined,
    artistImageUrl: row.artistImageUrl || undefined,
    artistBio: row.artistBio || undefined,
    
    // ✅ Tambahan untuk PlaylistService
    playCount: Number(row.playCount) || 0,
    rating: Number(row.rating) || 0,
    lastPlayed: Number(row.lastPlayed) || undefined,
    dateModified: Number(row.dateModified) || undefined,
    lastSeenAt: Number(row.lastSeenAt) || Date.now(),
    lastEnrichedAt: Number(row.lastEnrichedAt) || undefined,
    
    // Timestamp
    dateAdded: Number(row.dateAdded) || Date.now(),
  };
}
  
  private static getLastScanTimestamp(): number {
    try {
      const result = db.execute("SELECT value FROM app_metadata WHERE key = 'last_scan'");
      const row = result.rows?._array?.[0];
      return row ? parseInt(row.value, 10) : 0;
    } catch {
      this.initMetadataTable();
      return 0;
    }
  }
  
  private static setLastScanTimestamp(timestamp: number): void {
    try {
      db.execute(
        `INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('last_scan', ?)`,
        [timestamp.toString()]
      );
    } catch {
      this.initMetadataTable();
      db.execute(`INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('last_scan', ?)`, 
        [timestamp.toString()]);
    }
  }
  
  private static initMetadataTable(): void {
    try {
      db.execute(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
    } catch (error) {
      console.error("[LibraryScanner] Init metadata table failed:", error);
    }
  }
}

export default LibraryScanner; 


