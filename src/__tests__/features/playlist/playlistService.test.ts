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

/**
 * Smart playlist LIVE (virtual) — isi dihitung dari SQLite tiap
 * pemanggilan, bukan snapshot. Tes mengunci SQL-nya (cermin selector
 * murni di smartPlaylists.test.ts).
 */
describe("PlaylistService smart playlist — SQL live", () => {
  const songsSql = (sql: string) => {
    if (sql.includes("ORDER BY playCount DESC")) {
      return { rows: { _array: [songRow("top1"), songRow("top2")] } };
    }
    if (sql.includes("ORDER BY dateAdded DESC")) {
      return { rows: { _array: [songRow("new1")] } };
    }
    if (sql.includes("UPPER(codec) IN")) {
      return { rows: { _array: [songRow("fl1"), songRow("fl2")] } };
    }
    if (sql.includes("playCount IS NULL OR playCount = 0")) {
      return { rows: { _array: [songRow("np1")] } };
    }
    return { rows: { _array: [] } };
  };

  beforeEach(() => {
    mockedExecute.mockImplementation(songsSql);
  });

  it("getMostPlayed: pakai kolom lastPlayedAt (bukan lastPlayed yang tidak ada di skema) + hanya playCount > 0", async () => {
    const songs = await PlaylistService.getMostPlayed(50);
    expect(songs).toHaveLength(2);

    const call = mockedExecute.mock.calls.find(([sql]: [string]) =>
      sql.includes("ORDER BY playCount DESC"),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain("WHERE playCount > 0");
    expect(call![0]).toContain("lastPlayedAt DESC");
    expect(call![0]).not.toContain("lastPlayed DESC");
    expect(call![1]).toEqual([50]);
  });

  it("getLosslessSongs: filter codec lossless (daftar kanonik) + urut judul", async () => {
    const songs = await PlaylistService.getLosslessSongs();
    expect(songs).toHaveLength(2);

    const call = mockedExecute.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPPER(codec) IN"),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain("'FLAC'");
    expect(call![0]).toContain("'ALAC'");
    expect(call![0]).toContain("ORDER BY title ASC");
  });

  it("getNeverPlayedSongs: playCount 0 / NULL, terbaru dulu", async () => {
    const songs = await PlaylistService.getNeverPlayedSongs();
    expect(songs).toHaveLength(1);

    const call = mockedExecute.mock.calls.find(([sql]: [string]) =>
      sql.includes("playCount IS NULL"),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain("ORDER BY dateAdded DESC, title ASC");
  });

  it("getSmartPlaylist: virtual (isSmart), nama dari definisi, durasi = jumlah lagu", async () => {
    const pl = await PlaylistService.getSmartPlaylist("smart:recent");
    expect(pl.isSmart).toBe(true);
    expect(pl.id).toBe("smart:recent");
    expect(pl.name).toBe("Baru Ditambahkan");
    expect(pl.songCount).toBe(1);
    expect(pl.duration).toBe(60);
    expect(pl.songIds).toEqual(["new1"]);
  });

  it("getSmartPlaylistSummaries: 4 ringkasan; recent/most-played dibatasi limit tampil", async () => {
    mockedExecute.mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT COUNT(*)")) {
        if (sql.includes("UPPER(codec)")) return { rows: { _array: [{ count: 5 }] } };
        if (sql.includes("WHERE playCount > 0")) return { rows: { _array: [{ count: 30 }] } };
        if (sql.includes("playCount IS NULL")) return { rows: { _array: [{ count: 25 }] } };
        return { rows: { _array: [{ count: 60 }] } };
      }
      return { rows: { _array: [] } };
    });

    const summaries = await PlaylistService.getSmartPlaylistSummaries();
    expect(summaries).toHaveLength(4);
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s.count]));
    expect(byId["smart:recent"]).toBe(50); // total 60, limit tampil 50
    expect(byId["smart:most-played"]).toBe(30);
    expect(byId["smart:lossless"]).toBe(5);
    expect(byId["smart:never-played"]).toBe(25);
  });
});
