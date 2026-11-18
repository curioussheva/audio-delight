/**
 * PlaylistService — songCount dihitung ulang dari isi playlist_songs
 * (bukan +n / -1 tanpa syarat), supaya tidak drift dari isi sebenarnya.
 *
 * - addToPlaylist: INSERT OR IGNORE mengabaikan duplikat → hitungan
 *   tidak boleh naik untuk lagu yang sudah ada.
 * - removeFromPlaylist: DELETE 0 baris (lagu memang tidak ada) →
 *   hitungan tidak boleh turun.
 */

import { db } from "@/shared/lib/sqlite";

jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn(), transaction: jest.fn() },
}));

import PlaylistService from "@/features/playlist/api/service";

const mockedExecute = db.execute as jest.Mock;
const mockedTransaction = (db as any).transaction as jest.Mock;

const txExecute = jest.fn();
const playlistRow = (id: string) => ({
  id,
  name: "Test",
  songCount: 1,
  createdAt: 1,
  updatedAt: 1,
});
const songRow = (id: string) => ({
  id,
  title: `Lagu ${id}`,
  artist: "Artis",
  album: "Album",
  duration: 60,
  uri: `file://${id}.mp3`,
  codec: "MP3",
  sampleRate: 44100,
  genre: "Unknown",
  folder: "Unknown",
  filename: `${id}.mp3`,
});

beforeEach(() => {
  mockedExecute.mockReset();
  mockedTransaction.mockReset();
  txExecute.mockReset();

  // getPlaylist(): playlist ada (1 lagu) + JOIN lagu.
  mockedExecute.mockImplementation((sql: string) => {
    if (sql.startsWith("SELECT * FROM playlists WHERE id")) {
      return { rows: { _array: [playlistRow("p1")] } };
    }
    if (sql.includes("FROM playlist_songs")) {
      return { rows: { _array: [songRow("s1")] } };
    }
    return { rows: { _array: [] } };
  });

  mockedTransaction.mockImplementation(async (fn: (tx: any) => void) => {
    await fn({ execute: txExecute });
  });
});

function updateCall(): [string, any[]] | undefined {
  return txExecute.mock.calls.find(([sql]: [string]) =>
    sql.startsWith("UPDATE playlists SET songCount"),
  );
}

describe("PlaylistService.addToPlaylist — songCount tanpa drift", () => {
  it("hitung ulang dari playlist_songs, bukan songCount + jumlah input", async () => {
    await PlaylistService.addToPlaylist("p1", ["s1", "s2"]);

    // INSERT OR IGNORE tetap dipakai (duplikat diabaikan di baris).
    expect(txExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO playlist_songs"),
      expect.anything(),
    );
    // ...tetapi hitungan diambil dari isi sebenarnya.
    const update = updateCall();
    expect(update).toBeDefined();
    expect(update![0]).toContain(
      "songCount = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?)",
    );
    expect(update![0]).not.toContain("songCount +");
    expect(update![1]).toEqual(["p1", expect.any(Number), "p1"]);
  });

  it("lempar bila playlist tidak ada", async () => {
    mockedExecute.mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT * FROM playlists WHERE id")) {
        return { rows: { _array: [] } };
      }
      return { rows: { _array: [] } };
    });
    await expect(
      PlaylistService.addToPlaylist("hilang", ["s1"]),
    ).rejects.toThrow("Playlist not found");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});

describe("PlaylistService.removeFromPlaylist — songCount tanpa drift", () => {
  it("hitung ulang dari playlist_songs, bukan songCount - 1", async () => {
    await PlaylistService.removeFromPlaylist("p1", "sX");

    expect(txExecute).toHaveBeenCalledWith(
      "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
      ["p1", "sX"],
    );
    const update = updateCall();
    expect(update).toBeDefined();
    expect(update![0]).toContain(
      "songCount = (SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?)",
    );
    expect(update![0]).not.toContain("songCount - 1");
    expect(update![1]).toEqual(["p1", expect.any(Number), "p1"]);
  });
});
