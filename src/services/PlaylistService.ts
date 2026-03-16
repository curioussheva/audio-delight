import * as SQLite from 'expo-sqlite';
import { Playlist, CreatePlaylistDTO, UpdatePlaylistDTO } from '@/types/playlist';
import { Song } from '@/types/audio';

const db = SQLite.openDatabaseSync('pristineaudio.db');

class PlaylistService {
  async initialize() {
  // 1. Aktifkan Foreign Keys terlebih dahulu
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // 2. Jalankan pembuatan tabel dalam satu blok transaksi
  await db.execAsync(`
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

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlistId TEXT NOT NULL,
      songId TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (playlistId) REFERENCES playlists (id) ON DELETE CASCADE,
      PRIMARY KEY (playlistId, songId)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlistId ON playlist_songs(playlistId);
    CREATE INDEX IF NOT EXISTS idx_playlist_songs_songId ON playlist_songs(songId);
  `);
  
  // 3. Inisialisasi tabel songs
  await this.initializeSongsTable();
}


  private async initializeSongsTable() {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        duration INTEGER NOT NULL,
        uri TEXT UNIQUE NOT NULL,
        artwork TEXT,
        format_codec TEXT,
        format_sampleRate INTEGER,
        format_bitDepth INTEGER,
        format_bitrate INTEGER,
        dateAdded INTEGER NOT NULL,
        dateModified INTEGER,
        year INTEGER,
        genre TEXT,
        trackNumber INTEGER,
        discNumber INTEGER,
        composer TEXT,
        rating INTEGER DEFAULT 0,
        playCount INTEGER DEFAULT 0,
        lastPlayed INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
      CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
      CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
      CREATE INDEX IF NOT EXISTS idx_songs_uri ON songs(uri);
    `);
  }

  // ===== METHOD DASAR =====
  
  async createPlaylist(dto: CreatePlaylistDTO): Promise<Playlist> {
    const id = Date.now().toString();
    const now = Date.now();
    
    const playlist: Playlist = {
      id,
      name: dto.name,
      description: dto.description,
      songs: [],
      songIds: dto.songIds || [],
      createdAt: now,
      updatedAt: now,
      songCount: dto.songIds?.length || 0,
      duration: 0,
    };

    await db.runAsync(
      'INSERT INTO playlists (id, name, description, createdAt, updatedAt, songCount) VALUES (?, ?, ?, ?, ?, ?)',
      [id, dto.name, dto.description || null, now, now, playlist.songCount]
    );

    // Add songs if any
    if (dto.songIds?.length) {
      for (let i = 0; i < dto.songIds.length; i++) {
        await db.runAsync(
          'INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)',
          [id, dto.songIds[i], i]
        );
      }
    }

    return playlist;
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    const playlists = await db.getAllAsync<Playlist>('SELECT * FROM playlists ORDER BY name');
    
    // Load songs for each playlist
    for (const playlist of playlists) {
      const songs = await db.getAllAsync<Song>(`
        SELECT s.* FROM playlist_songs ps
        JOIN songs s ON s.id = ps.songId
        WHERE ps.playlistId = ?
        ORDER BY ps.position
      `, [playlist.id]);
      
      playlist.songs = songs;
      playlist.songIds = songs.map(s => s.id);
      playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);
    }
    
    return playlists;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const playlist = await db.getFirstAsync<Playlist>('SELECT * FROM playlists WHERE id = ?', [id]);
    if (!playlist) return null;

    const songs = await db.getAllAsync<Song>(`
      SELECT s.* FROM playlist_songs ps
      JOIN songs s ON s.id = ps.songId
      WHERE ps.playlistId = ?
      ORDER BY ps.position
    `, [id]);

    playlist.songs = songs;
    playlist.songIds = songs.map(s => s.id);
    playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);
    
    return playlist;
  }

  async addToPlaylist(playlistId: string, songIds: string[]) {
    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const currentCount = playlist.songs.length;
    
    for (let i = 0; i < songIds.length; i++) {
      await db.runAsync(
        'INSERT OR IGNORE INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)',
        [playlistId, songIds[i], currentCount + i]
      );
    }

    await db.runAsync(
      'UPDATE playlists SET songCount = songCount + ?, updatedAt = ? WHERE id = ?',
      [songIds.length, Date.now(), playlistId]
    );
  }

  async removeFromPlaylist(playlistId: string, songId: string) {
    await db.runAsync(
      'DELETE FROM playlist_songs WHERE playlistId = ? AND songId = ?',
      [playlistId, songId]
    );

    await db.runAsync(
      'UPDATE playlists SET songCount = songCount - 1, updatedAt = ? WHERE id = ?',
      [Date.now(), playlistId]
    );
  }

  async deletePlaylist(id: string) {
    await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
    // Cascade delete akan menghapus playlist_songs
  }

  async updatePlaylist(id: string, dto: UpdatePlaylistDTO) {
    const updates: string[] = [];
    const values: any[] = [];

    if (dto.name) {
      updates.push('name = ?');
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      updates.push('description = ?');
      values.push(dto.description);
    }

    updates.push('updatedAt = ?');
    values.push(Date.now());
    values.push(id);

    await db.runAsync(
      `UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  // ===== METHOD UNTUK SONG =====
  
  async addSong(song: Song): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO songs (
        id, title, artist, album, duration, uri, artwork,
        format_codec, format_sampleRate, format_bitDepth, format_bitrate,
        dateAdded, dateModified, year, genre, trackNumber, discNumber,
        composer, rating, playCount, lastPlayed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        song.id, song.title, song.artist || null, song.album || null,
        song.duration, song.uri, song.artwork || null,
        song.format?.codec || null, song.format?.sampleRate || null,
        song.format?.bitDepth || null, song.format?.bitrate || null,
        song.dateAdded || Date.now(), song.dateModified || null,
        song.year || null, song.genre || null, song.trackNumber || null,
        song.discNumber || null, song.composer || null,
        song.rating || 0, song.playCount || 0, song.lastPlayed || null
      ]
    );
  }

  async addSongs(songs: Song[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const song of songs) {
      await this.addSong(song);
    }
  });
}


  async getAllSongs(): Promise<Song[]> {
    const songs = await db.getAllAsync<any>('SELECT * FROM songs ORDER BY title');
    
    return songs.map(row => this.mapRowToSong(row));
  }

  async getSongByUri(uri: string): Promise<Song | null> {
    const row = await db.getFirstAsync<any>('SELECT * FROM songs WHERE uri = ?', [uri]);
    return row ? this.mapRowToSong(row) : null;
  }

  async getSongById(id: string): Promise<Song | null> {
    const row = await db.getFirstAsync<any>('SELECT * FROM songs WHERE id = ?', [id]);
    return row ? this.mapRowToSong(row) : null;
  }

  async updatePlayCount(songId: string): Promise<void> {
    const now = Date.now();
    await db.runAsync(
      `UPDATE songs SET 
        playCount = playCount + 1,
        lastPlayed = ?
      WHERE id = ?`,
      [now, songId]
    );
  }

  async updateRating(songId: string, rating: number): Promise<void> {
    await db.runAsync(
      'UPDATE songs SET rating = ? WHERE id = ?',
      [rating, songId]
    );
  }

  private mapRowToSong(row: any): Song {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || '',
      duration: row.duration,
      uri: row.uri,
      artwork: row.artwork || undefined,
      format: {
        codec: row.format_codec || 'Unknown',
        sampleRate: row.format_sampleRate || 44100,
        bitDepth: row.format_bitDepth || 16,
        bitrate: row.format_bitrate,
      },
      dateAdded: row.dateAdded,
      dateModified: row.dateModified,
      year: row.year,
      genre: row.genre,
      trackNumber: row.trackNumber,
      discNumber: row.discNumber,
      composer: row.composer,
      rating: row.rating,
      playCount: row.playCount,
      lastPlayed: row.lastPlayed,
    };
  }

  // ===== M3U IMPORT/EXPORT =====
  
  async importM3U(content: string): Promise<Playlist> {
    const lines = content.split('\n');
    const songIds: string[] = [];
    let currentSong: Partial<Song> = {};
    
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        // Parse EXTINF line
        const match = line.match(/#EXTINF:(\d+),(.+)/);
        if (match) {
          currentSong = {
            duration: parseInt(match[1]),
            title: match[2].trim(),
          };
        }
      } else if (line && !line.startsWith('#')) {
        // Ini adalah path file
        const uri = line.trim();
        const song = await this.getSongByUri(uri);
        if (song) {
          songIds.push(song.id);
        }
      }
    }
    
    // Buat playlist baru
    return this.createPlaylist({
      name: `Imported ${new Date().toLocaleDateString()}`,
      description: 'Imported from M3U',
      songIds,
    });
  }

  async exportM3U(playlist: Playlist): Promise<string> {
    let m3uContent = '#EXTM3U\n';
    
    for (const song of playlist.songs) {
      m3uContent += `#EXTINF:${song.duration},${song.artist} - ${song.title}\n`;
      m3uContent += `${song.uri}\n`;
    }
    
    return m3uContent;
  }

  // ===== SMART PLAYLIST =====
  
  async createSmartPlaylist(name: string, criteria: {
    minBitrate?: number;
    isLossless?: boolean;
    minDynamicRange?: number;
    artist?: string;
    genre?: string;
    minRating?: number;
    minPlayCount?: number;
    fromYear?: number;
    toYear?: number;
  }) {
    // Ambil semua lagu
    const allSongs = await this.getAllSongs();
    let filtered = allSongs;

    if (criteria.minBitrate) {
      filtered = filtered.filter(s => (s.format?.bitrate || 0) >= criteria.minBitrate!);
    }

    if (criteria.isLossless !== undefined) {
      filtered = filtered.filter(s => 
        (s.format?.bitrate || 0) > 800 || 
        (s.format?.codec === 'FLAC' || s.format?.codec === 'ALAC')
      );
    }

    if (criteria.minRating) {
      filtered = filtered.filter(s => (s.rating || 0) >= criteria.minRating!);
    }

    if (criteria.minPlayCount) {
      filtered = filtered.filter(s => (s.playCount || 0) >= criteria.minPlayCount!);
    }

    if (criteria.fromYear) {
      filtered = filtered.filter(s => (s.year || 0) >= criteria.fromYear!);
    }

    if (criteria.toYear) {
      filtered = filtered.filter(s => (s.year || 0) <= criteria.toYear!);
    }

    if (criteria.artist) {
      filtered = filtered.filter(s => s.artist === criteria.artist);
    }

    if (criteria.genre) {
      filtered = filtered.filter(s => s.genre === criteria.genre);
    }

    // Buat playlist dari hasil filter
    return this.createPlaylist({
      name,
      description: 'Smart playlist based on quality criteria',
      songIds: filtered.map(s => s.id),
    });
  }

  // ===== STATISTIK =====
  
  async getTotalSongs(): Promise<number> {
    const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM songs');
    return result?.count || 0;
  }

  async getTotalDuration(): Promise<number> {
    const result = await db.getFirstAsync<{ total: number }>('SELECT SUM(duration) as total FROM songs');
    return result?.total || 0;
  }

  async getMostPlayed(limit: number = 10): Promise<Song[]> {
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM songs ORDER BY playCount DESC, lastPlayed DESC LIMIT ?',
      [limit]
    );
    return rows.map(row => this.mapRowToSong(row));
  }

  async getRecentlyAdded(limit: number = 20): Promise<Song[]> {
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM songs ORDER BY dateAdded DESC LIMIT ?',
      [limit]
    );
    return rows.map(row => this.mapRowToSong(row));
  }
}

export default new PlaylistService();