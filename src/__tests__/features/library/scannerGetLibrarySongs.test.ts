/**
 * N3: getLibrarySongs gagal -> LEMPAR, bukan [].
 *
 * Regresi yang dikunci: catch di getLibrarySongs dulu mengembalikan [],
 * dan pemanggil (refreshLibrary, handleRetryLoad, initialScan)
 * memperlakukannya sebagai "library kosong" — satu galat SQLite sesaat
 * menimpa tracks dengan [] sampai refresh berikutnya berhasil.
 * Sekarang galat dilempar supaya pemanggil bisa membedakan "gagal" dari
 * "kosong" dan membiarkan daftar lama tetap tampil.
 *
 * Pola mock mengikuti scannerUpdateMetadata.test.ts: modul native +
 * sqlite di-mock, LibraryScanner yang asli diuji.
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

describe("N3 — getLibrarySongs membedakan galat dari kosong", () => {
  beforeEach(() => {
    executeMock.mockClear();
    executeMock.mockImplementation(() => ({ rows: { _array: [] } }));
  });

  it("query gagal -> melempar (bukan [])", async () => {
    executeMock.mockImplementation(() => {
      throw new Error("database disk image is malformed");
    });

    await expect(LibraryScanner.getLibrarySongs()).rejects.toThrow(
      "database disk image is malformed",
    );
  });

  it("query berhasil tapi 0 baris -> [] (memang kosong)", async () => {
    const songs = await LibraryScanner.getLibrarySongs();
    expect(songs).toEqual([]);
  });

  it("query berhasil -> baris dipetakan ke Song", async () => {
    executeMock.mockImplementation(() => ({
      rows: {
        _array: [
          {
            id: "1",
            uri: "content://a",
            title: "Lagu",
            artist: "Artis",
            album: "Album",
            duration: 180,
          },
        ],
      },
    }));

    const songs = await LibraryScanner.getLibrarySongs();
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: "1",
      title: "Lagu",
      artist: "Artis",
    });
  });
});

describe("LIB-37 — searchField diterjemahkan ke SQL (chip filter Search)", () => {
  beforeEach(() => {
    executeMock.mockClear();
    executeMock.mockImplementation(() => ({ rows: { _array: [] } }));
  });

  const lastCall = () => {
    const [sql, params] = executeMock.mock.calls[0] as [string, any[]];
    return { sql, params };
  };

  it("searchField title -> hanya title LIKE ?", async () => {
    await LibraryScanner.getLibrarySongs({
      searchQuery: "beat",
      searchField: "title",
    });
    const { sql, params } = lastCall();
    expect(sql).toContain("title LIKE ?");
    expect(sql).not.toContain("artist LIKE ?");
    expect(sql).not.toContain("album LIKE ?");
    expect(params).toContain("%beat%");
  });

  it("searchField artist -> hanya artist LIKE ?", async () => {
    await LibraryScanner.getLibrarySongs({
      searchQuery: "beat",
      searchField: "artist",
    });
    const { sql } = lastCall();
    expect(sql).toContain("artist LIKE ?");
    expect(sql).not.toContain("title LIKE ?");
    expect(sql).not.toContain("album LIKE ?");
  });

  it("searchField album -> hanya album LIKE ?", async () => {
    await LibraryScanner.getLibrarySongs({
      searchQuery: "beat",
      searchField: "album",
    });
    const { sql } = lastCall();
    expect(sql).toContain("album LIKE ?");
    expect(sql).not.toContain("title LIKE ?");
    expect(sql).not.toContain("artist LIKE ?");
  });

  it("default (all) -> title OR artist OR album, 3 param", async () => {
    await LibraryScanner.getLibrarySongs({ searchQuery: "beat" });
    const { sql, params } = lastCall();
    expect(sql).toContain("(title LIKE ? OR artist LIKE ? OR album LIKE ?)");
    expect(params.filter((p) => p === "%beat%")).toHaveLength(3);
  });
});
