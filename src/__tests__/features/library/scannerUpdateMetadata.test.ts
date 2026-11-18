/**
 * I1 (G1): label & publisher harus benar-benar tersimpan (round-trip).
 *
 * Regresi yang dikunci: keduanya ada di form edit [id].tsx dan dikirim
 * handleSaveEdit/handleApplyMetadata, tapi dulu diam-diam dibuang
 * updateMetadata karena tidak ada di `allowedFields` — mode lihat
 * selalu "-". Kolom DB-nya sudah ada (sqlite.ts + migrasi v1) dan
 * dbRowToSong sudah memetakannya, jadi yang diperbaiki hanya
 * `allowedFields` di scanner.ts.
 *
 * Pola mock mengikuti ScanDiffEngine.test.ts: modul native + sqlite
 * di-mock, LibraryScanner yang asli diuji.
 */
jest.mock("@/features/library/api/metadata", () => ({}));
jest.mock("@/features/library/native/MediaStoreModule", () => ({
  MediaStore: { queryAudioFiles: jest.fn() },
}));
jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn(() => ({ rows: { _array: [] } })) },
}));

import { LibraryScanner } from "@/features/library/api/scanner";
import { db } from "@/shared/lib/sqlite";

const executeMock = db.execute as jest.Mock;

describe("I1 — updateMetadata menyimpan label & publisher", () => {
  beforeEach(() => {
    executeMock.mockClear();
    executeMock.mockImplementation(() => ({ rows: { _array: [] } }));
  });

  it("REGRESI G1: label + publisher ikut tertulis di UPDATE", async () => {
    await LibraryScanner.updateMetadata("1", {
      label: "XL Recordings",
      publisher: "Sony Music",
    });

    const updateCall = executeMock.mock.calls.find(([sql]: [string]) =>
      sql.startsWith("UPDATE songs SET"),
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall as [string, any[]];
    expect(sql).toContain("label = ?");
    expect(sql).toContain("publisher = ?");
    expect(params).toContain("XL Recordings");
    expect(params).toContain("Sony Music");
    // songId selalu parameter terakhir
    expect(params[params.length - 1]).toBe("1");
  });

  it("tidak menulis label/publisher bila tidak dikirim", async () => {
    await LibraryScanner.updateMetadata("1", { title: "Baru" });

    const updateCall = executeMock.mock.calls.find(([sql]: [string]) =>
      sql.startsWith("UPDATE songs SET"),
    );
    expect(updateCall).toBeDefined();
    const [sql] = updateCall as [string, any[]];
    expect(sql).toContain("title = ?");
    expect(sql).not.toContain("label = ?");
    expect(sql).not.toContain("publisher = ?");
  });

  it("round-trip baca: dbRowToSong memetakan label & publisher", () => {
    const song = LibraryScanner.dbRowToSong({
      id: "1",
      uri: "content://media/external/audio/media/1",
      title: "t",
      artist: "a",
      album: "al",
      duration: 1,
      label: "XL Recordings",
      publisher: "Sony Music",
    });
    expect(song.label).toBe("XL Recordings");
    expect(song.publisher).toBe("Sony Music");
  });
});

describe("L1 — updateMetadata menyimpan lyrics & lyrics_synced", () => {
  beforeEach(() => {
    executeMock.mockClear();
    executeMock.mockImplementation(() => ({ rows: { _array: [] } }));
  });

  it("lyrics + lyricsSynced ikut tertulis di UPDATE (lyricsSynced → lyrics_synced)", async () => {
    await LibraryScanner.updateMetadata("1", {
      lyrics: "baris satu\nbaris dua",
      lyricsSynced: "[00:01.00]la",
    });

    const updateCall = executeMock.mock.calls.find(([sql]: [string]) =>
      sql.startsWith("UPDATE songs SET"),
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall as [string, any[]];
    expect(sql).toContain("lyrics = ?");
    expect(sql).toContain("lyrics_synced = ?");
    expect(params).toContain("baris satu\nbaris dua");
    expect(params).toContain("[00:01.00]la");
    expect(params[params.length - 1]).toBe("1");
  });

  it("round-trip baca: dbRowToSong memetakan lyrics & lyricsSynced", () => {
    const song = LibraryScanner.dbRowToSong({
      id: "1",
      uri: "content://media/external/audio/media/1",
      title: "t",
      artist: "a",
      album: "al",
      duration: 1,
      lyrics: "polos",
      lyrics_synced: "[00:01.00]sync",
    });
    expect(song.lyrics).toBe("polos");
    expect(song.lyricsSynced).toBe("[00:01.00]sync");
  });
});
