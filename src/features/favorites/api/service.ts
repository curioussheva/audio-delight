import { db } from "@/shared/lib/sqlite";
import { Song } from "@/shared/types/audio";

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
  const result = db.execute("SELECT * FROM songs WHERE isFavorite = 1");
  const rows = result.rows?._array || [];

  // Gunakan .map() untuk mengubah array baris database menjadi array Song
  return rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    artist: row.artist || "Unknown Artist",
    album: row.album || "Unknown Album",
    uri: row.uri,
    duration: row.duration || 0,
    artwork: row.artwork,
    codec: row.codec || "Unknown",
    sampleRate: row.sampleRate || 44100,
    bitDepth: row.bitDepth || 16,
    bitrate: row.bitrate || 320,
    isHiRes: row.isHiRes === 1,
    dateAdded: row.dateAdded,
    genre: row.genre || "Unknown",
    folder: row.folder || "Unknown",
    filename: row.filename || "Unknown",
    playCount: row.playCount || 0,
  })) as Song[]; 
}

}

export default new FavoritesService();
 
 