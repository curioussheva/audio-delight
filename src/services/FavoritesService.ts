import { db } from "./database/SQLiteService"; // Pastikan path ke SQLiteService benar
import { Song } from "@/types/audio";

class FavoritesService {
  async initialize() {
    // Menggunakan execute (JSI) untuk pembuatan tabel
    db.execute(`
      CREATE TABLE IF NOT EXISTS favorites (
        songId TEXT PRIMARY KEY,
        addedAt INTEGER NOT NULL
      );
    `);

    // Tambahkan index agar pengecekan isFavorite super cepat
    db.execute(
      `CREATE INDEX IF NOT EXISTS idx_favorites_songId ON favorites(songId);`,
    );
  }

  async addFavorite(songId: string) {
    db.execute(
      "INSERT OR REPLACE INTO favorites (songId, addedAt) VALUES (?, ?)",
      [songId, Date.now()],
    );
  }

  async removeFavorite(songId: string) {
    db.execute("DELETE FROM favorites WHERE songId = ?", [songId]);
  }

  async isFavorite(songId: string): Promise<boolean> {
    const result = db.execute(
      "SELECT COUNT(*) as count FROM favorites WHERE songId = ?",
      [songId],
    );
    const count = result.rows?._array[0]?.count || 0;
    return count > 0;
  }

  async getAllFavorites(): Promise<string[]> {
    const result = db.execute(
      "SELECT songId FROM favorites ORDER BY addedAt DESC",
    );
    const rows = result.rows?._array || [];
    return rows.map((r: any) => r.songId);
  }

  /**
   * Mengambil objek Song lengkap yang ada di daftar favorit
   * Dioptimasi dengan JOIN langsung ke tabel songs
   */
  async getFavoriteSongs(): Promise<Song[]> {
    const result = db.execute(`
      SELECT s.* FROM favorites f
      JOIN songs s ON f.songId = s.id
      ORDER BY f.addedAt DESC
    `);

    const rows = result.rows?._array || [];

    // Mapping ke interface Song (termasuk format object)
    return rows.map(
      (row: any) =>
        ({
          id: row.id,
          title: row.title,
          artist: row.artist,
          album: row.album,
          uri: row.uri,
          duration: row.duration,
          artwork: row.artwork,
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
}

export default new FavoritesService();
