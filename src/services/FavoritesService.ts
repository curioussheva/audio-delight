import * as SQLite from 'expo-sqlite';
import { Song } from '@/types/audio';

const db = SQLite.openDatabaseSync('pristineaudio.db');

class FavoritesService {
  async initialize() {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS favorites (
        songId TEXT PRIMARY KEY,
        addedAt INTEGER NOT NULL
      );
    `);
  }

  async addFavorite(songId: string) {
    await db.runAsync(
      'INSERT OR REPLACE INTO favorites (songId, addedAt) VALUES (?, ?)',
      [songId, Date.now()]
    );
  }

  async removeFavorite(songId: string) {
    await db.runAsync('DELETE FROM favorites WHERE songId = ?', [songId]);
  }

  async isFavorite(songId: string): Promise<boolean> {
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM favorites WHERE songId = ?',
      [songId]
    );
    return (result?.count || 0) > 0;
  }

  async getAllFavorites(): Promise<string[]> {
    const rows = await db.getAllAsync<{ songId: string }>(
      'SELECT songId FROM favorites ORDER BY addedAt DESC'
    );
    return rows.map(r => r.songId);
  }

  async getFavoriteSongs(allSongs: Song[]): Promise<Song[]> {
    const favoriteIds = await this.getAllFavorites();
    return allSongs.filter(song => favoriteIds.includes(song.id));
  }
}

export default new FavoritesService();