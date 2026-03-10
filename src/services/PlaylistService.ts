import * as SQLite from 'expo-sqlite';
import { Playlist, CreatePlaylistDTO, UpdatePlaylistDTO } from '@/types/playlist';
import { Song } from '@/types/audio';
import { usePlayerStore } from '@/store/playerStore';

const db = SQLite.openDatabaseSync('pristineaudio.db');

class PlaylistService {
  async initialize() {
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
  }

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
}

export default new PlaylistService();