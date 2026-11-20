// src/features/library/api/scanBatchWriter.ts
//
// Builder MURNI untuk tulis batch library (nol dependensi runtime — hanya
// `import type`, sama seperti pola graphProps.ts).
//
// Dipakai dua tempat:
//   - `LibraryScanner.insertNewSong` / `updateExistingSong` (jalur per-lagu,
//     dipakai fullScan) — supaya SQL + pemetaan param punya SATU sumber.
//   - `LibraryScanner.saveSongsBatched` (jalur live quickDiff /
//     runMediaStoreDiff) — kumpulkan semua tulis jadi SATU panggilan
//     `db.executeBatch`, bukan 289× `db.execute`.
//
// FAKTA NATIVE YANG MENENTUKAN DESAIN (baca sebelum mengubah):
// `executeBatch` di react-native-quick-sqlite 8.2.7 MEMBUKA TRANSAKSINYA
// SENDIRI — `cpp/sqlbatchexecutor.cpp:59` mengeluarkan
// `BEGIN EXCLUSIVE TRANSACTION` tanpa syarat, lalu `COMMIT` (:76), dan
// me-ROLLBACK seluruh batch bila satu perintah gagal. Akibatnya:
//   1. `executeBatch` TIDAK BOLEH dipanggil di dalam `BEGIN TRANSACTION`
//      eksplisit pemanggil — BEGIN bersarang gagal diam-diam (return value
//      `sqliteExecuteLiteral` dibuang), lalu COMMIT batch men-commit
//      transaksi luar lebih awal. Jadi fase tulis batch adalah SATU
//      panggilan `executeBatch` (yang adalah transaksinya sendiri),
//      BUKAN chunk di dalam transaksi luar.
//   2. Chunk per 25–50 dengan transaksi per chunk TIDAK dipakai di sini:
//      chunk yang sudah commit tidak bisa di-rollback bila chunk berikut
//      gagal — dan antrean enrichment HANYA dibangun dari hasil diff
//      (`handleResumeDiffResult` → `queueSongs(diffResult.newSongs)`;
//      `getUnenrichedTracks` tidak punya pemanggil). Lagu yang ter-commit
//      tapi diff-nya gagal tidak akan pernah diantre enrichment. Jadi
//      atomicity seluruh fase tulis dipertahankan: satu batch = satu
//      transaksi = all-or-nothing, sama seperti transaksi luar sebelumnya.
//   3. Satu batch untuk 289 lagu adalah satu blok sinkron singkat
//      (satu panggilan JSI + eksekusi native dalam satu transaksi) —
//      jauh di bawah biaya 289× (SELECT by id + INSERT + yield) yang
//      digantikan. Bila library tumbuh ke ribuan lagu baru dalam satu
//      diff, blok ini memanjang linear; saat itu chunking + penerimaan
//      partial commit jadi keputusan terpisah, bukan bagian fix ini.

import type { Song } from "@/shared/types/audio";
import type { NativeSong } from "@/features/library/native/MediaStoreModule";

/** Bentuk lagu yang ditulis: hasil `buildBasicSongInfo` / `NativeSong`. */
export type BatchSongInput = Partial<Song> | NativeSong;

/**
 * INSERT lagu baru — 26 kolom, SAMA PERSIS seperti `insertNewSong`
 * (dipindah ke sini supaya satu sumber; jangan ubah satu sisi saja).
 */
export const INSERT_SONG_SQL = `
  INSERT INTO songs (
    id, title, artist, album, genre, folder, filename,
    uri, originalUri, artwork, duration, sampleRate, bitDepth,
    codec, bitrate, fileSize, channels,
    year, trackNumber, discNumber,
    isEnriched, isFavorite, playCount, rating,
    dateAdded, lastSeenAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Bangun 26 param INSERT dari satu lagu — cerminan `insertNewSong`.
 * `null` = lagu tak bisa ditulis (tanpa id) — dilewati pemanggil, sama
 * seperti early return di `insertNewSong` / `saveBasicSongInfo`.
 */
export function buildInsertParams(song: BatchSongInput): any[] | null {
  const id = song.id?.toString();
  if (!id) return null;

  const finalUri = song.uri || `content://media/external/audio/media/${id}`;
  const now = Date.now();

  return [
    id,
    song.title || "Unknown Title",
    song.artist || "Unknown Artist",
    song.album || "Unknown Album",
    song.genre || "Unknown Genre",
    (song as any).folder || "Music",
    (song as any).filename || "Unknown File",
    finalUri,
    (song as any).originalUri || finalUri,
    (song as any).artwork || (song as any).artworkUri || null,
    song.duration || 0,
    song.sampleRate || 0,
    song.bitDepth || 0,
    song.codec || "UNKNOWN",
    song.bitrate || 0,
    song.fileSize || 0,
    (song as any).channels || 2,
    (song as any).year || 0,
    (song as any).trackNumber || 0,
    (song as any).discNumber || 0,
    0, // isEnriched
    0, // isFavorite
    0, // playCount
    0, // rating
    song.dateAdded || now,
    now, // lastSeenAt
  ];
}

/**
 * Daftar assignment UPDATE — cerminan `updateExistingSong`, termasuk
 * default tiap field dan ketiadaan fallback `artworkUri` (di update,
 * artwork hanya dari `song.artwork`, bukan `artworkUri` — asimetri yang
 * sudah ada, JANGAN "diperbaiki" di sini).
 */
const UPDATE_ASSIGNMENTS: Array<
  [field: string, value: (song: BatchSongInput, id: string) => any]
> = [
  ["title", (s) => s.title || "Unknown Title"],
  ["artist", (s) => s.artist || "Unknown Artist"],
  ["album", (s) => s.album || "Unknown Album"],
  ["genre", (s) => s.genre || "Unknown Genre"],
  ["folder", (s) => (s as any).folder || "Music"],
  ["filename", (s) => (s as any).filename || "Unknown File"],
  ["uri", (s, id) => s.uri || `content://media/external/audio/media/${id}`],
  ["originalUri", (s) => (s as any).originalUri || s.uri],
  ["artwork", (s) => s.artwork || null],
  ["duration", (s) => s.duration || 0],
  ["sampleRate", (s) => s.sampleRate || 0],
  ["bitDepth", (s) => s.bitDepth || 0],
  ["codec", (s) => s.codec || "UNKNOWN"],
  ["bitrate", (s) => s.bitrate || 0],
  ["fileSize", (s) => s.fileSize || 0],
  ["channels", (s) => (s as any).channels || 2],
  ["year", (s) => (s as any).year || 0],
  ["trackNumber", (s) => (s as any).trackNumber || 0],
  ["discNumber", (s) => (s as any).discNumber || 0],
];

/**
 * Bangun satu statement UPDATE dari satu lagu — cerminan
 * `updateExistingSong`. Field yang ditandai `editedFields` tidak
 * ditimpa; `lastSeenAt` selalu diperbarui. `null` = tanpa id.
 */
export function buildUpdateStatement(
  song: BatchSongInput,
  editedFields?: string[],
): [string, any[]] | null {
  const id = song.id?.toString();
  if (!id) return null;

  const edited = new Set(editedFields ?? []);
  const kept = UPDATE_ASSIGNMENTS.filter(([field]) => !edited.has(field));
  const setClauses = kept.map(([field]) => `${field} = ?`);
  setClauses.push("lastSeenAt = ?");

  const now = Date.now();
  const sql = `UPDATE songs SET ${setClauses.join(", ")} WHERE id = ?`;
  const params = [...kept.map(([, value]) => value(song, id)), now, id];
  return [sql, params];
}

export interface ClassifiedWriteBatch {
  /** Baris param INSERT — satu tuple `[INSERT_SONG_SQL, inserts]`. */
  inserts: any[][];
  /** Satu tuple `[sql, params]` per lagu yang di-update (SET dinamis). */
  updates: Array<[string, any[]]>;
  /** Lagu dilewati karena tanpa id (sama seperti early return lama). */
  skipped: number;
}

/**
 * Klasifikasi murni: pisah lagu jadi INSERT vs UPDATE.
 *
 * `existingIds` HARUS cerminan keputusan `saveToDatabase` (cek by id via
 * `getSongById`) — bukan klasifikasi diff by uri. Keduanya hampir selalu
 * sama (uri diturunkan dari id), tapi id-lah yang PRIMARY KEY: salah
 * klasifikasi = konflik constraint yang menggagalkan seluruh batch.
 */
export function classifyWriteBatch(
  songs: BatchSongInput[],
  existingIds: Set<string>,
  editedById: Map<string, string[] | undefined>,
): ClassifiedWriteBatch {
  const inserts: any[][] = [];
  const updates: Array<[string, any[]]> = [];
  let skipped = 0;

  for (const song of songs) {
    const id = song.id?.toString();
    if (!id) {
      skipped++;
      continue;
    }
    if (existingIds.has(id)) {
      const stmt = buildUpdateStatement(song, editedById.get(id));
      if (stmt) updates.push(stmt);
      else skipped++;
    } else {
      const params = buildInsertParams(song);
      if (params) inserts.push(params);
      else skipped++;
    }
  }

  return { inserts, updates, skipped };
}
