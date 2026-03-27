import { open } from "react-native-quick-sqlite";

// 1. Koneksi Tunggal
export const db = open({ name: "pristine_audio.db" });

const SQLiteService = {
  db,
  initDatabase: () => {
    try {
      db.execute(`
  CREATE TABLE IF NOT EXISTS songs (
    id          TEXT PRIMARY KEY NOT NULL,
    title       TEXT,
    artist      TEXT,
    album       TEXT,
    genre       TEXT,
    folder      TEXT,
    filename    TEXT,
    uri         TEXT UNIQUE NOT NULL,
    originalUri TEXT,
    artwork     TEXT,
    duration    INTEGER,
    sampleRate  INTEGER,
    bitDepth    INTEGER,
    codec       TEXT,
    bitrate     INTEGER,
    fileSize    INTEGER,
    dateAdded   INTEGER,
    playCount   INTEGER DEFAULT 0,
    isFavorite  INTEGER DEFAULT 0,
    isEnriched  INTEGER DEFAULT 0,   -- ← baru: 0=basic, 1=fully enriched
    lastSeenAt  INTEGER DEFAULT 0    -- ← baru: timestamp terakhir file terdeteksi
  );
`); 

      // Tabel Pendukung: Playlists & Relations
      db.execute(`
        CREATE TABLE IF NOT EXISTS playlists (
          id   TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'user'
        );
      `);

      db.execute(`
        CREATE TABLE IF NOT EXISTS playlist_songs (
          playlist_id TEXT,
          song_id     TEXT,
          position    INTEGER,
          PRIMARY KEY (playlist_id, song_id),
          FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
          FOREIGN KEY(song_id)     REFERENCES songs(id)     ON DELETE CASCADE
        );
      `);

      // Optimasi: Indexing (Penting untuk library musik besar)
      db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_folder ON songs(folder);`);
      db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);`);
      db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_album  ON songs(album);`);
      db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_uri    ON songs(uri);`);

      console.log("✅ [SQLite] Pristine Database System Initialized");
    } catch (error) {
      console.error("❌ [SQLite] Critical Init Error:", error);
    }
  },
};

// Auto-init saat aplikasi pertama kali memuat file ini
SQLiteService.initDatabase();

const runMigrations = () => {
  const migrations = [
    `ALTER TABLE songs ADD COLUMN isEnriched INTEGER DEFAULT 0;`,
    `ALTER TABLE songs ADD COLUMN lastSeenAt INTEGER DEFAULT 0;`,
  ];

  for (const sql of migrations) {
    try {
      db.execute(sql);
    } catch {
      // Kolom sudah ada — SQLite lempar error jika duplicate, abaikan saja
    }
  }
};

runMigrations();

export default SQLiteService;
 