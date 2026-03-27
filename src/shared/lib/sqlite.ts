import { open } from "react-native-quick-sqlite";

// Membuka koneksi database secara sinkron (High Performance)
export const db = open({ name: "pristine_audio.db" });

const SQLiteService = {
  db,
  initDatabase: () => {
<<<<<<< Updated upstream
    // Gunakan 'songs' agar sinkron dengan LibraryScanner.ts
    db.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT,
        artist      TEXT,
        album       TEXT,
        genre       TEXT,
        folder      TEXT,            -- Ini 'parent_path' Anda
        filename    TEXT,
        uri         TEXT UNIQUE NOT NULL,
        originalUri TEXT,            -- Penting untuk backup content://
        artwork     TEXT,
        duration    INTEGER,
        sampleRate  INTEGER,
        bitDepth    INTEGER,
        codec       TEXT,            -- Ini 'format' atau 'extension' Anda
        bitrate     INTEGER,
        fileSize    INTEGER,
        dateAdded   INTEGER,
        playCount   INTEGER DEFAULT 0,
        isFavorite  INTEGER DEFAULT 0
      );
    `);
=======
    try {
      // Jalankan dalam satu batch jika memungkinkan, atau satu per satu
      
      // Tabel Utama: Songs
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
>>>>>>> Stashed changes

    // Tabel Playlist
    db.execute(`
      CREATE TABLE IF NOT EXISTS playlists (
        id   TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'user'
      );
    `);

    // Tabel Relasi Playlist & Songs
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

    // Indexing untuk Performa (Wajib untuk library > 1000 lagu)
    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_folder ON songs(folder);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_album  ON songs(album);`);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_songs_uri    ON songs(uri);`);
  },
};

<<<<<<< Updated upstream
=======
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

>>>>>>> Stashed changes
export default SQLiteService;
 