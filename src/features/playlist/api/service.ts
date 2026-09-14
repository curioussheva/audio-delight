import { db } from "@/shared/lib/sqlite";
import {
  Playlist,
  CreatePlaylistDTO,
  UpdatePlaylistDTO,
} from "@/features/playlist/types";
import { Song } from "@/shared/types/audio";

class PlaylistService {
  // Cache promise inisialisasi supaya PRAGMA tidak diulang di setiap
  // pemanggilan, tapi tetap aman dipanggil dari mana saja.
  private initPromise: Promise<void> | null = null;

  // PENTING: tabel `playlists` dan `playlist_songs` SUDAH dibuat oleh
  // src/services/sqlite.ts (satu-satunya sumber skema untuk kedua
  // tabel ini — lihat komentar di file itu). Method ini TIDAK BOLEH
  // membuat ulang tabel dengan skema berbeda — itu penyebab bug
  // sebelumnya (kolom description/updatedAt tidak ketemu, index
  // dibuat ke nama kolom yang salah karena camelCase vs snake_case).
  // Di sini cuma mengaktifkan foreign keys per koneksi.
  async initialize(): Promise<void> {
    db.execute("PRAGMA foreign_keys = ON;");
  }

  // Dipanggil di awal setiap method publik yang menyentuh tabel
  // playlists/playlist_songs. Memoized supaya PRAGMA cuma jalan
  // sekali secara nyata, tapi tetap aman terhadap urutan pemanggilan
  // dari mana saja (mis. sebelum useEffect di usePlaylists selesai).
  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  // ===== METHOD DASAR =====

  async createPlaylist(dto: CreatePlaylistDTO): Promise<Playlist> {
    await this.ensureInitialized();

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
            "INSERT INTO playlist_songs (playlist_id, song_id, position, addedAt) VALUES (?, ?, ?, ?)",
            [id, songId, i, now],
          );
        });
      });
    }

    return playlist;
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    await this.ensureInitialized();

    const result = db.execute("SELECT * FROM playlists ORDER BY name");
    const playlists: Playlist[] = result.rows?._array || [];

    for (const playlist of playlists) {
      const songResult = db.execute(
        `SELECT s.* FROM playlist_songs ps
         JOIN songs s ON s.id = ps.song_id
         WHERE ps.playlist_id = ?
         ORDER BY ps.position`,
        [playlist.id],
      );

      const songs = (songResult.rows?._array || []).map((row) =>
        this.mapRowToSong(row),
      );
      playlist.songs = songs;
      playlist.songIds = songs.map((s) => s.id);
      playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);
    }

    return playlists;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    await this.ensureInitialized();

    const result = db.execute("SELECT * FROM playlists WHERE id = ?", [id]);
    const playlist = result.rows?._array[0] as Playlist | undefined;

    if (!playlist) return null;

    const songResult = db.execute(
      `SELECT s.* FROM playlist_songs ps
       JOIN songs s ON s.id = ps.song_id
       WHERE ps.playlist_id = ?
       ORDER BY ps.position`,
      [id],
    );

    const songs = (songResult.rows?._array || []).map((row) =>
      this.mapRowToSong(row),
    );
    playlist.songs = songs;
    playlist.songIds = songs.map((s) => s.id);
    playlist.duration = songs.reduce((sum, s) => sum + s.duration, 0);

    return playlist;
  }

  async addToPlaylist(playlistId: string, songIds: string[]) {
    await this.ensureInitialized();

    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    const currentCount = playlist.songs.length;
    const now = Date.now();

    db.transaction((tx) => {
      songIds.forEach((songId, i) => {
        tx.execute(
          "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, addedAt) VALUES (?, ?, ?, ?)",
          [playlistId, songId, currentCount + i, now],
        );
      });

      tx.execute(
        "UPDATE playlists SET songCount = songCount + ?, updatedAt = ? WHERE id = ?",
        [songIds.length, now, playlistId],
      );
    });
  }

  async removeFromPlaylist(playlistId: string, songId: string) {
    await this.ensureInitialized();

    db.transaction((tx) => {
      tx.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
        [playlistId, songId],
      );
      tx.execute(
        "UPDATE playlists SET songCount = songCount - 1, updatedAt = ? WHERE id = ?",
        [Date.now(), playlistId],
      );
    });
  }

  async deletePlaylist(id: string) {
    await this.ensureInitialized();
    db.execute("DELETE FROM playlists WHERE id = ?", [id]);
  }

  async updatePlaylist(id: string, dto: UpdatePlaylistDTO) {
    await this.ensureInitialized();

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
      db.execute(
        `UPDATE playlists SET ${updates.join(", ")} WHERE id = ?`,
        values,
      );
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
        song.id,
        song.title,
        song.artist || "Unknown Artist",
        song.album || "Unknown Album",
        song.duration,
        song.uri,
        song.artwork || null,
        song.codec,
        song.sampleRate,
        song.bitDepth || null,
        song.bitrate || null,
        song.isHiRes ? 1 : 0,
        song.dateAdded || Date.now(),
        song.dateModified || null,
        song.year || null,
        song.genre || "Unknown",
        song.folder || "Unknown",
        song.filename || "Unknown",
        song.trackNumber || null,
        song.discNumber || null,
        song.rating || 0,
        song.playCount || 0,
        song.lastPlayed || null,
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
            song.id,
            song.title,
            song.artist || "Unknown Artist",
            song.album || "Unknown Album",
            song.duration,
            song.uri,
            song.artwork || null,
            song.codec,
            song.sampleRate,
            song.bitDepth || null,
            song.bitrate || null,
            song.isHiRes ? 1 : 0,
            song.dateAdded || Date.now(),
            song.dateModified || null,
            song.year || null,
            song.genre || "Unknown",
            song.folder || "Unknown",
            song.filename || "Unknown",
            song.trackNumber || null,
            song.discNumber || null,
            song.rating || 0,
            song.playCount || 0,
            song.lastPlayed || null,
          ],
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
    db.execute(
      `UPDATE songs SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?`,
      [Date.now(), songId],
    );
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
      isEnriched: false,
      lastSeenAt: Date.now(),
      isFavorite: false,
    };
  }

  // ===== M3U IMPORT/EXPORT =====

  // Menerima path lagu (URI) langsung — hasil parse M3U (lihat api/m3u.ts).
  // Setiap path di-resolve ke songId lewat getSongByUri(); path yang
  // tidak ketemu di tabel songs (belum di-scan/tidak dikenal) dilewati.
  async importM3UPaths(
    name: string,
    paths: string[],
    description?: string,
  ): Promise<Playlist> {
    const songIds: string[] = [];

    for (const path of paths) {
      const song = await this.getSongByUri(path);
      if (song) songIds.push(song.id);
    }

    return this.createPlaylist({
      name,
      description: description ?? "Imported from M3U",
      songIds,
    });
  }

  // Menerima isi mentah file M3U (dipakai kalau caller sudah punya
  // string content, bukan array path yang sudah di-parse).
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
      filtered = filtered.filter(
        (s) => (s.bitrate || 0) >= criteria.minBitrate!,
      );
    }

    if (criteria.isLossless !== undefined) {
      filtered = filtered.filter(
        (s) =>
          (s.bitrate || 0) > 800 || s.codec === "FLAC" || s.codec === "ALAC",
      );
    }

    if (criteria.minRating) {
      filtered = filtered.filter((s) => (s.rating || 0) >= criteria.minRating!);
    }

    if (criteria.minPlayCount) {
      filtered = filtered.filter(
        (s) => (s.playCount || 0) >= criteria.minPlayCount!,
      );
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
    const result = db.execute(
      "SELECT * FROM songs ORDER BY playCount DESC, lastPlayed DESC LIMIT ?",
      [limit],
    );
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }

  async getRecentlyAdded(limit: number = 20): Promise<Song[]> {
    const result = db.execute(
      "SELECT * FROM songs ORDER BY dateAdded DESC LIMIT ?",
      [limit],
    );
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }
}

export default new PlaylistService();
 