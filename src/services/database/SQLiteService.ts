import { open } from 'react-native-quick-sqlite';

export const db = open({ name: 'pristine_audio.db' });


const SQLiteService = {
  db,
  initDatabase: () => {
  // Tabel Lagu
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
      isHiRes INTEGER
    );
  `);

  // Tabel Playlist
  db.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'user' -- 'user' atau 'm3u'
    );
  `);

  // Tabel Relasi Lagu & Playlist
  db.execute(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT,
      track_id TEXT,
      position INTEGER,
      FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );
  `);

db.execute(`
  ALTER TABLE tracks ADD COLUMN parent_path TEXT;
  ALTER TABLE tracks ADD COLUMN extension TEXT; -- flac, dsf, wav, dll
  CREATE INDEX IF NOT EXISTS idx_path ON tracks(parent_path);
  CREATE INDEX IF NOT EXISTS idx_ext ON tracks(extension);
   `);
  }
};

export default SQLiteService; // Tambahkan default export ini
