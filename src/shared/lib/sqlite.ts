import { open } from "react-native-quick-sqlite";

// Membuka koneksi database secara sinkron (High Performance)
export const db = open({ name: "pristine_audio.db" });

const SQLiteService = {
  db,
  initDatabase: () => {
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

export default SQLiteService;
 