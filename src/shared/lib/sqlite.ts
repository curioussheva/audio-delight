// src/services/sqlite.ts
import { open } from "react-native-quick-sqlite";

export const db = open({ name: "pristine_audio.db" });

const SQLiteService = {
  db,

  initDatabase: () => {
    try {
      db.execute(`
        CREATE TABLE IF NOT EXISTS songs (
          -- Identitas Dasar
          id                  TEXT PRIMARY KEY NOT NULL,
          uri                 TEXT UNIQUE NOT NULL,
          originalUri         TEXT,
          filename            TEXT,
          folder              TEXT,
          
          -- Metadata Musik (ID3 Tags)
          title               TEXT,
          artist              TEXT,
          album               TEXT,
          genre               TEXT,
          composer            TEXT,
          lyricist            TEXT,
          conductor           TEXT,
          publisher           TEXT,
          label               TEXT,
          language            TEXT,
          mood                TEXT,
          
          -- Teknis Audio
          duration            INTEGER,
          sampleRate          INTEGER,
          bitDepth            INTEGER,
          codec               TEXT,
          bitrate             INTEGER,
          fileSize            INTEGER,
          channels            INTEGER DEFAULT 2,
          
          -- Track Info
          trackNumber         INTEGER DEFAULT 0,
          trackTotal          INTEGER DEFAULT 0,
          discNumber          INTEGER DEFAULT 0,
          discTotal           INTEGER DEFAULT 0,
          year                INTEGER DEFAULT 0,
          tempo               INTEGER DEFAULT 0,
          key_of_song         TEXT,
          
          -- Lirik
          lyrics              TEXT,
          lyrics_synced       TEXT,
          
          -- Artwork & Enrichment
          artwork             TEXT,
          artist_image_url    TEXT,   -- Dari MusicBrainz / Cover Art Archive
          artist_bio          TEXT,   -- Dari Wikipedia via MusicBrainz
          album_artwork       TEXT,
          
          -- User Data
          playCount           INTEGER DEFAULT 0,
          lastPlayedAt        INTEGER DEFAULT 0,
          isFavorite          INTEGER DEFAULT 0,
          rating              INTEGER DEFAULT 0,
          
          -- Metadata Enrichment
          isEnriched          INTEGER DEFAULT 0,
          last_enriched_at    INTEGER DEFAULT 0,
          lastSeenAt          INTEGER DEFAULT 0,
          
          -- Additional
          compilation         INTEGER DEFAULT 0,
          explicit            INTEGER DEFAULT 0,
          dateAdded           INTEGER DEFAULT 0
        );
      `);

      db.execute(`
        CREATE TABLE IF NOT EXISTS playlists (
          id        TEXT PRIMARY KEY NOT NULL,
          name      TEXT NOT NULL,
          type      TEXT DEFAULT 'user',
          artwork   TEXT,
          createdAt INTEGER DEFAULT 0,
          songCount INTEGER DEFAULT 0
        );
      `);

      db.execute(`
        CREATE TABLE IF NOT EXISTS playlist_songs (
          playlist_id TEXT,
          song_id     TEXT,
          position    INTEGER,
          addedAt     INTEGER DEFAULT 0,
          PRIMARY KEY (playlist_id, song_id),
          FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
          FOREIGN KEY(song_id)     REFERENCES songs(id)     ON DELETE CASCADE
        );
      `);

      /**
       * artist_cache: Cache hasil enrichment dari MusicBrainz + Wikipedia.
       *
       * Kolom yang DIISI oleh OnlineMetadataService:
       *   artist_name, bio, image_url, last_fetched
       *
       * Kolom yang TIDAK DIISI (reserved untuk integrasi masa depan):
       *   mb_artist_id    → MBID dari MusicBrainz (bisa disimpan untuk re-fetch lebih cepat)
       *   tags            → Genre tags dari MusicBrainz (belum di-fetch)
       *   similar_artists → Tidak tersedia di MusicBrainz secara gratis
       *   popularity      → Tidak tersedia di MusicBrainz
       */
      db.execute(`
        CREATE TABLE IF NOT EXISTS artist_cache (
          artist_name     TEXT PRIMARY KEY,
          mb_artist_id    TEXT,             -- MusicBrainz Artist ID (MBID)
          bio             TEXT,             -- Wikipedia extract
          image_url       TEXT,             -- Cover Art Archive URL
          tags            TEXT,             -- JSON array (untuk masa depan)
          similar_artists TEXT,             -- JSON array (untuk masa depan)
          last_fetched    INTEGER,
          popularity      INTEGER DEFAULT 0
        );
      `);

      db.execute(`
        CREATE TABLE IF NOT EXISTS recent_plays (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          song_id       TEXT,
          played_at     INTEGER,
          play_duration INTEGER,
          source        TEXT,
          FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
        );
      `);

      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_songs_folder       ON songs(folder);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_artist       ON songs(artist);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_album        ON songs(album);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_uri          ON songs(uri);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_enriched     ON songs(isEnriched);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_favorite     ON songs(isFavorite);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_rating       ON songs(rating);`,
        `CREATE INDEX IF NOT EXISTS idx_songs_lastPlayed   ON songs(lastPlayedAt);`,
        `CREATE INDEX IF NOT EXISTS idx_recent_plays_date  ON recent_plays(played_at);`,
        `CREATE INDEX IF NOT EXISTS idx_artist_cache_name  ON artist_cache(artist_name);`,
        `CREATE INDEX IF NOT EXISTS idx_artist_cache_mbid  ON artist_cache(mb_artist_id);`,
      ];

      indexes.forEach((sql) => db.execute(sql));

      console.log("✅ [SQLite] Pristine Database Initialized");
    } catch (error) {
      console.error("❌ [SQLite] Critical Init Error:", error);
    }
  },
};

SQLiteService.initDatabase();

// ─── Migrations ───────────────────────────────────────────────────────────────
// Setiap migration dijalankan dengan silent ignore jika kolom sudah ada.
// Tambahkan migration baru di BAWAH, jangan pernah ubah yang sudah ada.

const runMigrations = () => {
  const migrations = [
    // v1: Extended metadata
    `ALTER TABLE songs ADD COLUMN composer TEXT;`,
    `ALTER TABLE songs ADD COLUMN lyricist TEXT;`,
    `ALTER TABLE songs ADD COLUMN conductor TEXT;`,
    `ALTER TABLE songs ADD COLUMN publisher TEXT;`,
    `ALTER TABLE songs ADD COLUMN label TEXT;`,
    `ALTER TABLE songs ADD COLUMN language TEXT;`,
    `ALTER TABLE songs ADD COLUMN mood TEXT;`,
    `ALTER TABLE songs ADD COLUMN tempo INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN key_of_song TEXT;`,
    `ALTER TABLE songs ADD COLUMN lyrics TEXT;`,
    `ALTER TABLE songs ADD COLUMN lyrics_synced TEXT;`,
    `ALTER TABLE songs ADD COLUMN rating INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN lastPlayedAt INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN channels INTEGER DEFAULT 2;`,
    `ALTER TABLE songs ADD COLUMN trackTotal INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN discTotal INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN compilation INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN explicit INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN album_artwork TEXT;`,

    // v2: Enrichment (MusicBrainz)
    `ALTER TABLE songs ADD COLUMN artist_image_url TEXT;`,
    `ALTER TABLE songs ADD COLUMN artist_bio TEXT;`,
    `ALTER TABLE songs ADD COLUMN last_enriched_at INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN isEnriched INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN lastSeenAt INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN year INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN trackNumber INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN discNumber INTEGER DEFAULT 0;`,

    // v3: Playlist enhancements
    `ALTER TABLE playlists ADD COLUMN artwork TEXT;`,
    `ALTER TABLE playlists ADD COLUMN createdAt INTEGER DEFAULT 0;`,
    `ALTER TABLE playlists ADD COLUMN songCount INTEGER DEFAULT 0;`,
    `ALTER TABLE playlist_songs ADD COLUMN addedAt INTEGER DEFAULT 0;`,

    // v4: artist_cache — tambah MBID (migrasi dari skema Last.fm lama)
    `ALTER TABLE artist_cache ADD COLUMN mb_artist_id TEXT;`,
  ];

  for (const sql of migrations) {
    try {
      db.execute(sql);
    } catch {
      // Silent: kolom sudah ada — normal pada re-init
    }
  }

  console.log("✅ [SQLite] Migrations complete");
};

runMigrations();

// ─── Utility Queries ──────────────────────────────────────────────────────────

export const SongQueries = {
  incrementPlayCount: (songId: string, duration: number) => {
    db.execute(
      `UPDATE songs SET playCount = playCount + 1, lastPlayedAt = ? WHERE id = ?`,
      [Date.now(), songId]
    );
    db.execute(
      `INSERT INTO recent_plays (song_id, played_at, play_duration) VALUES (?, ?, ?)`,
      [songId, Date.now(), duration]
    );
  },

  getRecentPlays: (limit: number = 50) => {
    return db.execute(
      `SELECT s.*, rp.played_at, rp.play_duration
       FROM recent_plays rp
       JOIN songs s ON rp.song_id = s.id
       ORDER BY rp.played_at DESC
       LIMIT ?`,
      [limit]
    );
  },

  searchSongs: (query: string) => {
    const searchTerm = `%${query}%`;
    return db.execute(
      `SELECT * FROM songs
       WHERE title    LIKE ?
          OR artist   LIKE ?
          OR album    LIKE ?
          OR composer LIKE ?
          OR genre    LIKE ?
       ORDER BY
         CASE
           WHEN title  LIKE ? THEN 1
           WHEN artist LIKE ? THEN 2
           ELSE 3
         END
       LIMIT 100`,
      [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
       searchTerm, searchTerm]
    );
  },

  getTopPlayed: (limit: number = 20) => {
    return db.execute(
      `SELECT * FROM songs
       WHERE playCount > 0
       ORDER BY playCount DESC, lastPlayedAt DESC
       LIMIT ?`,
      [limit]
    );
  },

  getByRating: (minRating: number = 4) => {
    return db.execute(
      `SELECT * FROM songs WHERE rating >= ? ORDER BY rating DESC`,
      [minRating]
    );
  },

  /** Ambil semua lagu yang belum di-enrich (isEnriched = 0) */
  getUnenrichedSongs: (limit: number = 50) => {
    return db.execute(
      `SELECT id, artist FROM songs WHERE isEnriched = 0 LIMIT ?`,
      [limit]
    );
  },
};

export default SQLiteService;
 