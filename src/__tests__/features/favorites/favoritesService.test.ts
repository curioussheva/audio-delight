/**
 * U-P1-17 — FavoritesService mendelegasikan semua tulis ke
 * LibraryScanner (penulis tunggal kolom songs.isFavorite) dan membaca
 * dari kolom yang sama. Tabel `favorites` terpisah tidak lagi dipakai.
 */

import { db } from "@/shared/lib/sqlite";

jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: {
    setFavorite: jest.fn(),
    getSongById: jest.fn(),
    dbRowToSong: jest.fn((row: any) => ({
      ...row,
      isFavorite: Boolean(row.isFavorite),
    })),
  },
}));
jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn() },
}));

import FavoritesService from "@/features/favorites/api/service";
import { LibraryScanner } from "@/features/library/api/scanner";

const mockedExecute = db.execute as jest.Mock;
const mockedSetFavorite = LibraryScanner.setFavorite as jest.Mock;
const mockedGetSongById = LibraryScanner.getSongById as jest.Mock;

beforeEach(() => {
  mockedExecute.mockReset();
  mockedSetFavorite.mockReset();
  mockedGetSongById.mockReset();
});

describe("FavoritesService (delegasi ke LibraryScanner)", () => {
  it("addFavorite menulis lewat setFavorite(id, true)", async () => {
    await FavoritesService.addFavorite("s1");
    expect(mockedSetFavorite).toHaveBeenCalledWith("s1", true);
    expect(mockedSetFavorite).toHaveBeenCalledTimes(1);
  });

  it("removeFavorite menulis lewat setFavorite(id, false)", async () => {
    await FavoritesService.removeFavorite("s1");
    expect(mockedSetFavorite).toHaveBeenCalledWith("s1", false);
    expect(mockedSetFavorite).toHaveBeenCalledTimes(1);
  });

  it("isFavorite membaca flag lagu dari scanner", async () => {
    mockedGetSongById.mockReturnValue({ id: "s1", isFavorite: true });
    await expect(FavoritesService.isFavorite("s1")).resolves.toBe(true);
    mockedGetSongById.mockReturnValue(null);
    await expect(FavoritesService.isFavorite("hilang")).resolves.toBe(false);
  });

  it("getFavoriteSongs membaca songs WHERE isFavorite = 1 (tidak lagi [])", async () => {
    mockedExecute.mockReturnValue({
      rows: {
        _array: [
          { id: "s1", title: "A", isFavorite: 1 },
          { id: "s2", title: "B", isFavorite: 1 },
        ],
      },
    });

    const songs = await FavoritesService.getFavoriteSongs();
    expect(mockedExecute.mock.calls[0][0]).toContain(
      "SELECT * FROM songs WHERE isFavorite = 1",
    );
    expect(songs.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(songs.every((s) => s.isFavorite)).toBe(true);
  });

  it("getAllFavorites mengembalikan id dari getFavoriteSongs", async () => {
    mockedExecute.mockReturnValue({
      rows: { _array: [{ id: "s9", title: "Z", isFavorite: 1 }] },
    });
    await expect(FavoritesService.getAllFavorites()).resolves.toEqual(["s9"]);
  });
});
