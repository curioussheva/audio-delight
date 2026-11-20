// src/__tests__/features/library/scanBatchWriter.test.ts
//
// Tes murni untuk builder batch insert/update library — tanpa DB, tanpa
// runtime. Menjaga agar builder tetap cerminan `insertNewSong` /
// `updateExistingSong` (satu sumber) dan agar klasifikasi insert-vs-update
// (by id — PRIMARY KEY) tidak bergeser.
import {
  INSERT_SONG_SQL,
  buildInsertParams,
  buildUpdateStatement,
  classifyWriteBatch,
} from "@/features/library/api/scanBatchWriter";

const song = (over: Record<string, any> = {}) => ({
  id: "42",
  uri: "content://media/external/audio/media/42",
  filename: "lagu.mp3",
  title: "Judul",
  artist: "Artis",
  album: "Album",
  genre: "Pop",
  folder: "Music",
  artwork: "content://artwork/42",
  duration: 180,
  codec: "MP3",
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 320,
  fileSize: 123456,
  dateAdded: 1700000000000,
  ...over,
});

describe("buildInsertParams — cermin insertNewSong", () => {
  it("26 param, urutan kolom sama dengan SQL", () => {
    const params = buildInsertParams(song());
    expect(params).not.toBeNull();
    expect(params!.length).toBe(26);
    expect(INSERT_SONG_SQL).toContain("INSERT INTO songs");
    // Spot-check posisi kunci.
    expect(params![0]).toBe("42"); // id
    expect(params![1]).toBe("Judul"); // title
    expect(params![7]).toBe("content://media/external/audio/media/42"); // uri
    expect(params![8]).toBe("content://media/external/audio/media/42"); // originalUri fallback = uri
    expect(params![9]).toBe("content://artwork/42"); // artwork
    expect(params![10]).toBe(180); // duration
    expect(params![20]).toBe(0); // isEnriched
    expect(params![21]).toBe(0); // isFavorite
    expect(params![22]).toBe(0); // playCount
    expect(params![23]).toBe(0); // rating
    expect(params![24]).toBe(1700000000000); // dateAdded
    expect(typeof params![25]).toBe("number"); // lastSeenAt
  });

  it("default saat field kosong — sama seperti insertNewSong", () => {
    const params = buildInsertParams({ id: "7" });
    expect(params).not.toBeNull();
    expect(params![1]).toBe("Unknown Title");
    expect(params![2]).toBe("Unknown Artist");
    expect(params![3]).toBe("Unknown Album");
    expect(params![4]).toBe("Unknown Genre");
    expect(params![5]).toBe("Music");
    expect(params![6]).toBe("Unknown File");
    expect(params![7]).toBe("content://media/external/audio/media/7");
    expect(params![9]).toBeNull(); // artwork
    expect(params![13]).toBe("UNKNOWN"); // codec
    expect(params![16]).toBe(2); // channels
  });

  it("artworkUri dipakai bila artwork kosong", () => {
    const params = buildInsertParams({
      id: "7",
      artworkUri: "content://artwork/7",
    } as any);
    expect(params![9]).toBe("content://artwork/7");
  });

  it("null bila tanpa id", () => {
    expect(buildInsertParams({ title: "x" } as any)).toBeNull();
    expect(buildInsertParams({} as any)).toBeNull();
  });
});

describe("buildUpdateStatement — cermin updateExistingSong", () => {
  it("UPDATE ... WHERE id = ?, lastSeenAt selalu ikut", () => {
    const stmt = buildUpdateStatement(song(), undefined);
    expect(stmt).not.toBeNull();
    const [sql, params] = stmt!;
    expect(sql).toMatch(/^UPDATE songs SET /);
    expect(sql).toContain("lastSeenAt = ?");
    expect(sql).toContain("WHERE id = ?");
    expect(params[params.length - 1]).toBe("42");
    expect(typeof params[params.length - 2]).toBe("number"); // lastSeenAt
  });

  it("field yang ditandai edited tidak ditimpa", () => {
    const stmt = buildUpdateStatement(song(), ["title", "artist"]);
    const [sql] = stmt!;
    expect(sql).not.toContain("title = ?");
    expect(sql).not.toContain("artist = ?");
    expect(sql).toContain("album = ?");
    expect(sql).toContain("lastSeenAt = ?");
  });

  it("semua field edited → hanya lastSeenAt yang ditulis", () => {
    const all = [
      "title", "artist", "album", "genre", "folder", "filename", "uri",
      "originalUri", "artwork", "duration", "sampleRate", "bitDepth",
      "codec", "bitrate", "fileSize", "channels", "year", "trackNumber",
      "discNumber",
    ];
    const stmt = buildUpdateStatement(song(), all);
    const [sql, params] = stmt!;
    expect(sql).toBe("UPDATE songs SET lastSeenAt = ? WHERE id = ?");
    expect(params.length).toBe(2);
  });

  it("null bila tanpa id", () => {
    expect(buildUpdateStatement({} as any, undefined)).toBeNull();
  });
});

describe("classifyWriteBatch — pisah INSERT vs UPDATE by id", () => {
  it("skenario kunci: 289 lagu baru → satu tuple INSERT, 289 baris param", () => {
    const songs = Array.from({ length: 289 }, (_, i) =>
      song({ id: String(1000 + i) }),
    );
    const batch = classifyWriteBatch(songs, new Set(), new Map());
    expect(batch.inserts.length).toBe(289);
    expect(batch.updates.length).toBe(0);
    expect(batch.skipped).toBe(0);
    // Satu tuple [INSERT_SONG_SQL, inserts] cukup untuk seluruh fase.
    expect(Array.isArray(batch.inserts[0])).toBe(true);
    expect(batch.inserts[0]!.length).toBe(26);
  });

  it("campuran baru + lama: insert dan update terpisah", () => {
    const songs = [
      song({ id: "1" }),
      song({ id: "2", title: "Baru" }),
      song({ id: "3" }),
    ];
    const batch = classifyWriteBatch(
      songs,
      new Set(["1", "3"]),
      new Map([["1", ["title"]]]),
    );
    expect(batch.inserts.length).toBe(1); // id 2
    expect(batch.inserts[0]![0]).toBe("2");
    expect(batch.updates.length).toBe(2); // id 1, 3
    expect(batch.updates[0]![0]).not.toContain("title = ?"); // id 1 edited
    expect(batch.updates[1]![0]).toContain("title = ?"); // id 3 tidak edited
    expect(batch.skipped).toBe(0);
  });

  it("lagu tanpa id dilewati, bukan menggagalkan batch", () => {
    const batch = classifyWriteBatch(
      [song({ id: "1" }), { title: "tanpa id" } as any, song({ id: "2" })],
      new Set(),
      new Map(),
    );
    expect(batch.inserts.length).toBe(2);
    expect(batch.skipped).toBe(1);
  });

  it("kosong → batch kosong (pemanggil tidak boleh panggil executeBatch)", () => {
    const batch = classifyWriteBatch([], new Set(), new Map());
    expect(batch.inserts).toEqual([]);
    expect(batch.updates).toEqual([]);
    expect(batch.skipped).toBe(0);
  });
});
