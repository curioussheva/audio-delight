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
