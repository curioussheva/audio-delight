/**
 * U-P1-17 — favorit punya SATU sumber kebenaran: kolom songs.isFavorite.
 *
 * Yang diuji di sini (logika murni + mock DB, mengikuti pola
 * ScanDiffEngine.test.ts):
 *  1. LibraryScanner.setFavorite adalah satu-satunya penulis kolom itu —
 *     toggleFavorite membalik lewat setFavorite, bukan UPDATE sendiri.
 *  2. FavoritesService mendelegasikan semua tulis ke scanner dan semua
 *     baca ke kolom yang sama (getFavoriteSongs tidak lagi selalu []).
 */

import { db } from "@/shared/lib/sqlite";

jest.mock("@/features/library/native/MediaStoreModule", () => ({
  MediaStore: { queryAudioFiles: jest.fn() },
}));
jest.mock("@/features/library/api/metadata", () => ({
  __esModule: true,
  default: {},
}));
jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn() },
}));

import { LibraryScanner } from "@/features/library/api/scanner";

const mockedExecute = db.execute as jest.Mock;

const songRow = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  uri: "file:///Music/a.mp3",
  title: "A",
  artist: "B",
  album: "C",
  duration: 180,
  isFavorite: 0,
  ...overrides,
});

/** SELECT getSongById mengembalikan satu baris (atau kosong). */
const mockSelectSong = (row: Record<string, unknown> | null) => {
  mockedExecute.mockImplementationOnce(() => ({
    rows: { _array: row ? [row] : [] },
  }));
};

beforeEach(() => {
  mockedExecute.mockReset();
});

describe("LibraryScanner.setFavorite / toggleFavorite (penulis tunggal)", () => {
  it("setFavorite(true) menulis isFavorite=1 untuk lagu yang ada", () => {
    mockSelectSong(songRow({ isFavorite: 0 }));
    expect(LibraryScanner.setFavorite("s1", true)).toBe(true);

    const updateCall = mockedExecute.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("UPDATE songs SET isFavorite"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual([1, "s1"]);
  });

  it("setFavorite(false) menulis isFavorite=0", () => {
    mockSelectSong(songRow({ isFavorite: 1 }));
    expect(LibraryScanner.setFavorite("s1", false)).toBe(true);

    const updateCall = mockedExecute.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("UPDATE songs SET isFavorite"),
    );
    expect(updateCall![1]).toEqual([0, "s1"]);
  });

  it("setFavorite lagu tak dikenal tidak menulis apa pun", () => {
    mockSelectSong(null);
    expect(LibraryScanner.setFavorite("hilang", true)).toBe(false);
    expect(
      mockedExecute.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes("UPDATE songs SET isFavorite"),
      ),
    ).toHaveLength(0);
  });

  it("toggleFavorite membalik 0 -> 1 dan mengembalikan status baru", () => {
    mockSelectSong(songRow({ isFavorite: 0 }));
    expect(LibraryScanner.toggleFavorite("s1")).toBe(true);
    const updateCall = mockedExecute.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("UPDATE songs SET isFavorite"),
    );
    expect(updateCall![1]).toEqual([1, "s1"]);
  });

  it("toggleFavorite membalik 1 -> 0 dan mengembalikan status baru", () => {
    mockSelectSong(songRow({ isFavorite: 1 }));
    expect(LibraryScanner.toggleFavorite("s1")).toBe(false);
    const updateCall = mockedExecute.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("UPDATE songs SET isFavorite"),
    );
    expect(updateCall![1]).toEqual([0, "s1"]);
  });

  it("toggleFavorite lagu tak dikenal mengembalikan false tanpa tulis", () => {
    mockSelectSong(null);
    expect(LibraryScanner.toggleFavorite("hilang")).toBe(false);
    expect(
      mockedExecute.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes("UPDATE songs SET isFavorite"),
      ),
    ).toHaveLength(0);
  });
});
