import { db } from "@/shared/lib/sqlite";
import {
  Playlist,
  CreatePlaylistDTO,
  UpdatePlaylistDTO,
} from "@/features/playlist/types";
import { Song } from "@/shared/types/audio";

class PlaylistService {
  async initialize() {
    // 1. Aktifkan Foreign Keys
    db.execute("PRAGMA foreign_keys = ON;");

    // 2. Jalankan pembuatan tabel playlist (Songs diinisiasi di shared/lib/sqlite.ts)
    db.execute(`
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        artwork TEXT,
        songCount INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0
      );
    `);

    db.execute(`
      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlistId TEXT NOT NULL,
        songId TEXT NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY (playlistId) REFERENCES playlists (id) ON DELETE CASCADE,
        FOREIGN KEY (songId) REFERENCES songs (id) ON DELETE CASCADE,
        PRIMARY KEY (playlistId, songId)
      );
    `);

    db.execute(`CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlistId ON playlist_songs(playlistId);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_playlist_songs_songId ON playlist_songs(songId);`);
  }

  // ===== METHOD DASAR =====

  async createPlaylist(dto: CreatePlaylistDTO): Promise<Playlist> {
    const id = Date.now().toString();
    const now = Date.now();
    const songIds = dto.songIds || [];

    const playlist: Playlist = {
      id,
      name: dto.name,
      description: dto.description,
      songs: [],
      songIds,
      createdAt: now,
      updatedAt: now,
      songCount: songIds.length,
      duration: 0,
    };

    db.execute(
      "INSERT INTO playlists (id, name, description, createdAt, updatedAt, songCount) VALUES (?, ?, ?, ?, ?, ?)",
      [id, dto.name, dto.description || null, now, now, playlist.songCount],
    );

    if (songIds.length > 0) {
      db.transaction((tx) => {
        songIds.forEach((songId, i) => {
          tx.execute(
            "INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)",
            [id, songId, i],
          );
        });
      });
    }

    return playlist;
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    const result = db.execute("SELECT * FROM playlists ORDER BY name");
    const playlists: Playlist[] = result.rows?._array || [];

    for (const playlist of playlists) {
      const songResult = db.execute(
        `SELECT s.* FROM playlist_songs ps
         JOIN songs s ON s.id = ps.songId
         WHERE ps.playlistId = ?
         ORDER BY ps.position`,
        [playlist.id],
      );

      const songs = (songResult.rows?._array || []).map((row) => this.mapRowToSong(row));
      playlist.songs = songs;
      playlist.songIds = songs.map((s) => s.id);
      playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);
    }

    return playlists;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const result = db.execute("SELECT * FROM playlists WHERE id = ?", [id]);
    const playlist = result.rows?._array[0] as Playlist | undefined;

    if (!playlist) return null;

    const songResult = db.execute(
      `SELECT s.* FROM playlist_songs ps
       JOIN songs s ON s.id = ps.songId
       WHERE ps.playlistId = ?
       ORDER BY ps.position`,
      [id],
    );

    const songs = (songResult.rows?._array || []).map((row) => this.mapRowToSong(row));
    playlist.songs = songs;
    playlist.songIds = songs.map((s) => s.id);
    playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);

    return playlist;
  }

  async addToPlaylist(playlistId: string, songIds: string[]) {
    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    const currentCount = playlist.songs.length;

    db.transaction((tx) => {
      songIds.forEach((songId, i) => {
        tx.execute(
          "INSERT OR IGNORE INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)",
          [playlistId, songId, currentCount + i],
        );
      });

      tx.execute(
        "UPDATE playlists SET songCount = songCount + ?, updatedAt = ? WHERE id = ?",
        [songIds.length, Date.now(), playlistId],
      );
    });
  }

  async removeFromPlaylist(playlistId: string, songId: string) {
    db.transaction((tx) => {
      tx.execute("DELETE FROM playlist_songs WHERE playlistId = ? AND songId = ?", [playlistId, songId]);
      tx.execute("UPDATE playlists SET songCount = songCount - 1, updatedAt = ? WHERE id = ?", [Date.now(), playlistId]);
    });
  }

  async deletePlaylist(id: string) {
    db.execute("DELETE FROM playlists WHERE id = ?", [id]);
  }

  async updatePlaylist(id: string, dto: UpdatePlaylistDTO) {
    const updates: string[] = [];
    const values: any[] = [];

    if (dto.name) {
      updates.push("name = ?");
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      updates.push("description = ?");
      values.push(dto.description);
    }

    updates.push("updatedAt = ?");
    values.push(Date.now());
    values.push(id);

    if (updates.length > 1) {
      db.execute(`UPDATE playlists SET ${updates.join(", ")} WHERE id = ?`, values);
    }
  }

  // ===== METHOD UNTUK SONG (Mendukung Struktur Flat & Fallback) =====

  async addSong(song: Song): Promise<void> {
    db.execute(
      `INSERT OR REPLACE INTO songs (
        id, title, artist, album, duration, uri, artwork,
        codec, sampleRate, bitDepth, bitrate, isHiRes,
        dateAdded, dateModified, year, genre, folder, filename, 
        trackNumber, discNumber, rating, playCount, lastPlayed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        song.id, song.title, song.artist || "Unknown Artist", song.album || "Unknown Album", 
        song.duration, song.uri, song.artwork || null,
        song.codec, song.sampleRate, song.bitDepth || null, song.bitrate || null, song.isHiRes ? 1 : 0,
        song.dateAdded || Date.now(), song.dateModified || null, song.year || null, song.genre || "Unknown", 
        song.folder || "Unknown", song.filename || "Unknown",
        song.trackNumber || null, song.discNumber || null,
        song.rating || 0, song.playCount || 0, song.lastPlayed || null,
      ],
    );
  }

  async addSongs(songs: Song[]): Promise<void> {
    db.transaction((tx) => {
      for (const song of songs) {
        tx.execute(
          `INSERT OR REPLACE INTO songs (
            id, title, artist, album, duration, uri, artwork,
            codec, sampleRate, bitDepth, bitrate, isHiRes,
            dateAdded, dateModified, year, genre, folder, filename,
            trackNumber, discNumber, rating, playCount, lastPlayed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            song.id, song.title, song.artist || "Unknown Artist", song.album || "Unknown Album", 
            song.duration, song.uri, song.artwork || null,
            song.codec, song.sampleRate, song.bitDepth || null, song.bitrate || null, song.isHiRes ? 1 : 0,
            song.dateAdded || Date.now(), song.dateModified || null, song.year || null, song.genre || "Unknown", 
            song.folder || "Unknown", song.filename || "Unknown",
            song.trackNumber || null, song.discNumber || null,
            song.rating || 0, song.playCount || 0, song.lastPlayed || null,
          ]
        );
      }
    });
  }

  async getAllSongs(): Promise<Song[]> {
    const result = db.execute("SELECT * FROM songs ORDER BY title");
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }

  async getSongByUri(uri: string): Promise<Song | null> {
    const result = db.execute("SELECT * FROM songs WHERE uri = ?", [uri]);
    const row = result.rows?._array[0];
    return row ? this.mapRowToSong(row) : null;
  }

  async getSongById(id: string): Promise<Song | null> {
    const result = db.execute("SELECT * FROM songs WHERE id = ?", [id]);
    const row = result.rows?._array[0];
    return row ? this.mapRowToSong(row) : null;
  }

  async updatePlayCount(songId: string): Promise<void> {
    db.execute(`UPDATE songs SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?`, [Date.now(), songId]);
  }

  async updateRating(songId: string, rating: number): Promise<void> {
    db.execute("UPDATE songs SET rating = ? WHERE id = ?", [rating, songId]);
  }

  private mapRowToSong(row: any): Song {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist || "Unknown Artist",
      album: row.album || "Unknown Album",
      duration: row.duration || 0,
      uri: row.uri,
      artwork: row.artwork || undefined,
      // Field Flat:
      codec: row.codec || "Unknown",
      sampleRate: row.sampleRate || 44100,
      bitDepth: row.bitDepth,
      bitrate: row.bitrate,
      isHiRes: row.isHiRes === 1,
      genre: row.genre || "Unknown",
      folder: row.folder || "Unknown",
      filename: row.filename || "Unknown",
      // Info Tambahan:
      dateAdded: row.dateAdded,
      dateModified: row.dateModified,
      year: row.year,
      trackNumber: row.trackNumber,
      discNumber: row.discNumber,
      rating: row.rating || 0,
      playCount: row.playCount || 0,
      lastPlayed: row.lastPlayed,
    };
  }

  // ===== M3U IMPORT/EXPORT =====

  async importM3U(content: string): Promise<Playlist> {
    const lines = content.split("\n");
    const songIds: string[] = [];

    for (const line of lines) {
      if (line && !line.startsWith("#")) {
        const uri = line.trim();
        const song = await this.getSongByUri(uri);
        if (song) songIds.push(song.id);
      }
    }

    return this.createPlaylist({
      name: `Imported ${new Date().toLocaleDateString()}`,
      description: "Imported from M3U",
      songIds,
    });
  }

  async exportM3U(playlist: Playlist): Promise<string> {
    let m3uContent = "#EXTM3U\n";
    for (const song of playlist.songs) {
      m3uContent += `#EXTINF:${song.duration},${song.artist} - ${song.title}\n`;
      m3uContent += `${song.uri}\n`;
    }
    return m3uContent;
  }

  // ===== SMART PLAYLIST =====

  async createSmartPlaylist(
    name: string,
    criteria: {
      minBitrate?: number;
      isLossless?: boolean;
      minDynamicRange?: number;
      artist?: string;
      genre?: string;
      minRating?: number;
      minPlayCount?: number;
      fromYear?: number;
      toYear?: number;
    },
  ) {
    const allSongs = await this.getAllSongs();
    let filtered = allSongs;

    if (criteria.minBitrate) {
      filtered = filtered.filter((s) => (s.bitrate || 0) >= criteria.minBitrate!);
    }

    if (criteria.isLossless !== undefined) {
      filtered = filtered.filter(
        (s) => (s.bitrate || 0) > 800 || s.codec === "FLAC" || s.codec === "ALAC",
      );
    }

    if (criteria.minRating) {
      filtered = filtered.filter((s) => (s.rating || 0) >= criteria.minRating!);
    }

    if (criteria.minPlayCount) {
      filtered = filtered.filter((s) => (s.playCount || 0) >= criteria.minPlayCount!);
    }

    if (criteria.fromYear) {
      filtered = filtered.filter((s) => (s.year || 0) >= criteria.fromYear!);
    }

    if (criteria.toYear) {
      filtered = filtered.filter((s) => (s.year || 0) <= criteria.toYear!);
    }

    if (criteria.artist) {
      filtered = filtered.filter((s) => s.artist === criteria.artist);
    }

    if (criteria.genre) {
      filtered = filtered.filter((s) => s.genre === criteria.genre);
    }

    return this.createPlaylist({
      name,
      description: "Smart playlist based on quality criteria",
      songIds: filtered.map((s) => s.id),
    });
  }

  // ===== STATISTIK =====

  async getTotalSongs(): Promise<number> {
    const result = db.execute("SELECT COUNT(*) as count FROM songs");
    return result.rows?._array[0]?.count || 0;
  }

  async getTotalDuration(): Promise<number> {
    const result = db.execute("SELECT SUM(duration) as total FROM songs");
    return result.rows?._array[0]?.total || 0;
  }

  async getMostPlayed(limit: number = 10): Promise<Song[]> {
    const result = db.execute("SELECT * FROM songs ORDER BY playCount DESC, lastPlayed DESC LIMIT ?", [limit]);
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }

  async getRecentlyAdded(limit: number = 20): Promise<Song[]> {
    const result = db.execute("SELECT * FROM songs ORDER BY dateAdded DESC LIMIT ?", [limit]);
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }
}

export default new PlaylistService();
 