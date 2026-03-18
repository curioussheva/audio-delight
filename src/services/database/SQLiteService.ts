import { open } from "react-native-quick-sqlite";

export const db = open({ name: "pristine_audio.db" });

const SQLiteService = {
  db,
  initDatabase: () => {
    // 1. Tabel Utama
    db.execute(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        uri TEXT UNIQUE,
        duration REAL,
        sampleRate INTEGER,
        bitDepth INTEGER,
        bitrate INTEGER,
        format TEXT,
        isHiRes INTEGER,
        parent_path TEXT,    -- Tambahkan langsung di sini agar aman
        extension TEXT       -- Tambahkan langsung di sini agar aman
      );
    `);

    db.execute(`
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'user'
      );
    `);

    db.execute(`
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT,
        track_id TEXT,
        position INTEGER,
        PRIMARY KEY (playlist_id, track_id), -- Mencegah duplikasi lagu di playlist yang sama
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
    `);

    // 2. Indexing untuk Pencarian Cepat (Sangat penting untuk Library besar)
    db.execute(`CREATE INDEX IF NOT EXISTS idx_path ON tracks(parent_path);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_ext ON tracks(extension);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);`);
  },
};

export default SQLiteService;
