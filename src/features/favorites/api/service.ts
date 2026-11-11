import { db } from "@/shared/lib/sqlite";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";

/**
 * FavoritesService — API fitur favorit.
 *
 * U-P1-17: dulu layanan ini punya sumber kebenaran sendiri (tabel
 * `favorites` terpisah) yang tidak pernah sinkron dengan kolom
 * `songs.isFavorite` — hati tab Songs dan hati Song Detail hidup di dua
 * dunia berbeda, dan getFavoriteSongs() selalu [] karena satu-satunya
 * penulis kolom itu (LibraryScanner.toggleFavorite) tidak pernah
 * dipanggil. Sekarang SATU-SATUNYA sumber kebenaran adalah kolom
 * `songs.isFavorite`; semua tulis di sini didelegasikan ke
 * LibraryScanner (penulis tunggal), semua baca dari kolom yang sama.
 * Tabel `favorites` lama tidak lagi dibuat/dibaca/ditulis — dibiarkan
 * begitu saja di DB perangkat lama (tanpa migrasi/skema baru).
 */
class FavoritesService {
  async addFavorite(songId: string) {
    LibraryScanner.setFavorite(songId, true);
  }

  async removeFavorite(songId: string) {
    LibraryScanner.setFavorite(songId, false);
  }

  async isFavorite(songId: string): Promise<boolean> {
    return LibraryScanner.getSongById(songId)?.isFavorite ?? false;
  }

  async getAllFavorites(): Promise<string[]> {
    const songs = await this.getFavoriteSongs();
    return songs.map((s) => s.id);
  }

  /**
   * Mengambil objek Song lengkap yang ada di daftar favorit.
   * Query-nya memang sudah membaca kolom yang benar
   * (`WHERE isFavorite = 1`); yang dulu salah adalah tidak ada penulis
   * kolom itu, plus mapping-nya menghilangkan flag isFavorite.
   */
  async getFavoriteSongs(): Promise<Song[]> {
    const result = db.execute("SELECT * FROM songs WHERE isFavorite = 1");
    const rows = result.rows?._array || [];
    return rows.map((row: any) => LibraryScanner.dbRowToSong(row));
  }
}

export default new FavoritesService();
