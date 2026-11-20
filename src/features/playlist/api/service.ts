import { db } from "@/shared/lib/sqlite";
import {
  Playlist,
  CreatePlaylistDTO,
  UpdatePlaylistDTO,
  SmartPlaylistSummary,
} from "@/features/playlist/types";
import { Song } from "@/shared/types/audio";
import {
  SMART_PLAYLIST_DEFS,
  SMART_PLAYLIST_LIMITS,
  SmartPlaylistId,
} from "@/features/playlist/utils/smartPlaylists";
import { LOSSLESS_CODECS_SQL_LIST } from "@/shared/utils/audioQuality";

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

    // B1: db.transaction() di react-native-quick-sqlite ASYNC (Promise) —
    // HARUS di-await. Tanpa await, createPlaylist return sebelum INSERT
    // playlist_songs commit; loadPlaylists() yang jalan sesudahnya membaca
    // JOIN kosong → detail "0 track" sampai relaunch.
    if (songIds.length > 0) {
      await db.transaction((tx) => {
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

    // B1: await transaction (lihat createPlaylist) — tanpa await,
    // loadPlaylists() di hook bisa membaca sebelum INSERT commit.
    await db.transaction((tx) => {
      songIds.forEach((songId, i) => {
        tx.execute(
          "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, addedAt) VALUES (?, ?, ?, ?)",
          [playlistId, songId, currentCount + i, now],
        );
      });

      // songCount dihitung ulang dari isi sebenarnya — INSERT OR IGNORE
      // tidak menambah baris untuk lagu duplikat, jadi `songCount +
      // songIds.length` membuat hitungan drift di atas isi playlist.
      tx.execute(
        "UPDATE playlists SET songCount = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?), updatedAt = ? WHERE id = ?",
        [playlistId, now, playlistId],
      );
    });
  }

  async removeFromPlaylist(playlistId: string, songId: string) {
    await this.ensureInitialized();

    // B1: await transaction (lihat createPlaylist).
    await db.transaction((tx) => {
      tx.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
        [playlistId, songId],
      );
      // Hitung ulang dari isi sebenarnya — DELETE 0 baris (lagu memang
      // tidak ada di playlist) tidak boleh menurunkan songCount.
      tx.execute(
        "UPDATE playlists SET songCount = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?), updatedAt = ? WHERE id = ?",
        [playlistId, Date.now(), playlistId],
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
    // B1: await transaction (lihat createPlaylist).
    await db.transaction((tx) => {
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

  // Fallback matching untuk import M3U/M3U8 dari sumber eksternal
  // (AIMP, SnapTube, dll). Path di file M3U eksternal biasanya berupa
  // path filesystem absolut (/storage/emulated/0/...), sementara
  // `songs.uri` hasil scan library Pristine (berbasis MediaStore di
  // Android scoped storage) berbentuk content:// URI — dua skema ini
  // TIDAK PERNAH match lewat exact string equality walau menunjuk ke
  // file fisik yang sama. Fallback ke nama file (kolom `filename`,
  // atau LIKE terhadap `uri`) supaya matching tetap berhasil lintas
  // skema URI.
  async getSongByPathOrFilename(path: string): Promise<Song | null> {
    // 1. Coba exact match ke `uri` dulu (berhasil kalau kebetulan
    // sama-sama pakai skema URI yang sama, atau untuk M3U yang
    // di-export dari Pristine sendiri).
    const exact = await this.getSongByUri(path);
    if (exact) return exact;

    // 2. Coba exact match ke `originalUri` — kalau library scanner
    // menyimpan path filesystem asli di kolom ini (terpisah dari
    // `uri` yang dipakai untuk akses runtime lewat content://),
    // ini exact match yang jauh lebih andal daripada tebak nama
    // file di langkah 3. Aman dijalankan meski kolom ini kosong
    // untuk semua baris — query sekadar tidak match, tidak error.
    const origResult = db.execute(
      "SELECT * FROM songs WHERE originalUri = ? LIMIT 1",
      [path],
    );
    const origRow = origResult.rows?._array[0];
    if (origRow) return this.mapRowToSong(origRow);

    // 3. Fallback terakhir: cocokkan lewat nama file saja.
    const filename = path.split(/[\\/]/).pop();
    if (!filename) return null;

    const result = db.execute(
      "SELECT * FROM songs WHERE filename = ? OR uri LIKE ? LIMIT 1",
      [filename, `%${filename}`],
    );
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
      // ReplayGain (2026-11-20).
      replaygainTrackGainDb:
        row.replaygain_track_gain ?? undefined,
      replaygainAlbumGainDb:
        row.replaygain_album_gain ?? undefined,
      replaygainTrackPeak: row.replaygain_track_peak ?? undefined,
      replaygainAlbumPeak: row.replaygain_album_peak ?? undefined,
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
      const song = await this.getSongByPathOrFilename(path);
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
        const song = await this.getSongByPathOrFilename(uri);
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
  // LEGACY (2026-11-20): createSmartPlaylist di bawah membuat SNAPSHOT
  // statis sekali jalan (playlist DB biasa) — isinya basi begitu library
  // berubah. JANGAN dipakai untuk auto-playlist baru; yang live adalah
  // getSmartPlaylist/getSmartPlaylistSummaries di seksi STATISTIK.
  // Method ini dipertahankan supaya perilaku lama tidak berubah.

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

  // Smart playlist LIVE (virtual — bukan baris `playlists`): tiap
  // pemanggilan membaca SQLite saat itu juga, jadi isi selalu segar
  // mengikuti library + riwayat putar. Aturan di sini adalah cermin SQL
  // dari selector murni di utils/smartPlaylists.ts — ubah berpasangan.
  //
  // PERBAIKAN 2026-11-20: getMostPlayed lama mengurutkan pakai kolom
  // `lastPlayed` yang TIDAK ADA di skema (kolomnya `lastPlayedAt`,
  // lihat shared/lib/sqlite.ts) — query itu pasti melempar begitu
  // dipanggil; selama ini tidak ada pemanggil sehingga tidak ketahuan.
  // Sekaligus: hanya lagu yang pernah diputar (playCount > 0) yang
  // masuk — selaras dengan SongQueries.getTopPlayed.
  async getMostPlayed(limit: number = 10): Promise<Song[]> {
    const result = db.execute(
      "SELECT * FROM songs WHERE playCount > 0 ORDER BY playCount DESC, lastPlayedAt DESC LIMIT ?",
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

  // Lossless ditentukan codec saja (LOSSLESS_CODECS_SQL_LIST — daftar
  // yang sama dengan isLosslessCodec di audioQuality.ts). UPPER(codec)
  // supaya codec yang tersimpan huruf kecil tetap ketemu — SQL `IN`
  // case-sensitive, sementara helper murni menormalkan huruf besar.
  async getLosslessSongs(limit?: number): Promise<Song[]> {
    const sql =
      `SELECT * FROM songs WHERE UPPER(codec) IN (${LOSSLESS_CODECS_SQL_LIST}) ORDER BY title ASC` +
      (limit !== undefined ? " LIMIT ?" : "");
    const result = db.execute(
      sql,
      limit !== undefined ? [limit] : [],
    );
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }

  async getNeverPlayedSongs(limit?: number): Promise<Song[]> {
    const sql =
      "SELECT * FROM songs WHERE playCount IS NULL OR playCount = 0 ORDER BY dateAdded DESC, title ASC" +
      (limit !== undefined ? " LIMIT ?" : "");
    const result = db.execute(
      sql,
      limit !== undefined ? [limit] : [],
    );
    const rows = result.rows?._array || [];
    return rows.map((row) => this.mapRowToSong(row));
  }

  // Satu smart playlist lengkap (dipakai detail view saat user tap
  // barisnya). `createdAt`/`updatedAt` 0: virtual, bukan dibuat user.
  async getSmartPlaylist(id: SmartPlaylistId): Promise<Playlist> {
    await this.ensureInitialized();

    const def = SMART_PLAYLIST_DEFS[id];
    let songs: Song[];
    switch (id) {
      case "smart:recent":
        songs = await this.getRecentlyAdded(
          SMART_PLAYLIST_LIMITS["smart:recent"],
        );
        break;
      case "smart:most-played":
        songs = await this.getMostPlayed(
          SMART_PLAYLIST_LIMITS["smart:most-played"],
        );
        break;
      case "smart:lossless":
        songs = await this.getLosslessSongs();
        break;
      case "smart:never-played":
        songs = await this.getNeverPlayedSongs();
        break;
    }

    return {
      id,
      name: def.name,
      description: def.description,
      songs,
      songIds: songs.map((s) => s.id),
      createdAt: 0,
      updatedAt: 0,
      songCount: songs.length,
      duration: songs.reduce((sum, s) => sum + s.duration, 0),
      isSmart: true,
    };
  }

  // Hitungan tiap smart playlist untuk baris daftar (COUNT(*) saja —
  // tanpa memuat lagu). Count recent/most-played dibatasi limit
  // tampilannya, supaya angka di baris = jumlah lagu yang akan dibuka.
  async getSmartPlaylistSummaries(): Promise<SmartPlaylistSummary[]> {
    await this.ensureInitialized();

    const count = (sql: string, params: unknown[] = []): number => {
      const result = db.execute(sql, params);
      return result.rows?._array[0]?.count || 0;
    };

    const recentTotal = count("SELECT COUNT(*) as count FROM songs");
    const mostPlayedTotal = count(
      "SELECT COUNT(*) as count FROM songs WHERE playCount > 0",
    );
    const losslessTotal = count(
      `SELECT COUNT(*) as count FROM songs WHERE UPPER(codec) IN (${LOSSLESS_CODECS_SQL_LIST})`,
    );
    const neverPlayedTotal = count(
      "SELECT COUNT(*) as count FROM songs WHERE playCount IS NULL OR playCount = 0",
    );

    const counts: Record<SmartPlaylistId, number> = {
      "smart:recent": Math.min(
        recentTotal,
        SMART_PLAYLIST_LIMITS["smart:recent"],
      ),
      "smart:most-played": Math.min(
        mostPlayedTotal,
        SMART_PLAYLIST_LIMITS["smart:most-played"],
      ),
      "smart:lossless": losslessTotal,
      "smart:never-played": neverPlayedTotal,
    };

    return (Object.keys(SMART_PLAYLIST_DEFS) as SmartPlaylistId[]).map(
      (id) => ({
        id,
        name: SMART_PLAYLIST_DEFS[id].name,
        description: SMART_PLAYLIST_DEFS[id].description,
        count: counts[id],
      }),
    );
  }
}

export default new PlaylistService();
 