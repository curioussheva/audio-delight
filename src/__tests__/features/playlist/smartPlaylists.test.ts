/**
 * Smart playlist — aturan keanggotaan & urutan (logika murni atas Song[]).
 * Cermin SQL di PlaylistService: bila aturan di sini berubah, SQL-nya
 * (service.ts: getSmartPlaylist*) harus berubah berpasangan.
 */
import type { Song } from "@/shared/types/audio";
import {
  SMART_PLAYLIST_DEFS,
  SMART_PLAYLIST_IDS,
  isLosslessSong,
  isSmartPlaylistId,
  selectLossless,
  selectMostPlayed,
  selectNeverPlayed,
  selectRecentlyAdded,
  selectSmartPlaylistSongs,
} from "@/features/playlist/utils/smartPlaylists";

const song = (over: Partial<Song> & { id: string }): Song =>
  ({
    title: `Lagu ${over.id}`,
    artist: "Artis",
    album: "Album",
    duration: 60,
    uri: `file://${over.id}`,
    ...over,
  }) as Song;

describe("SMART_PLAYLIST_DEFS", () => {
  it("ada tepat 4 auto-playlist sesuai spek (recent, most-played, lossless, never-played)", () => {
    expect(SMART_PLAYLIST_IDS).toEqual([
      "smart:recent",
      "smart:most-played",
      "smart:lossless",
      "smart:never-played",
    ]);
    for (const id of SMART_PLAYLIST_IDS) {
      expect(SMART_PLAYLIST_DEFS[id].name).toBeTruthy();
      expect(SMART_PLAYLIST_DEFS[id].description).toBeTruthy();
    }
  });

  it("isSmartPlaylistId: hanya id smart:* yang lolos — bukan id playlist DB / favorites", () => {
    expect(isSmartPlaylistId("smart:recent")).toBe(true);
    expect(isSmartPlaylistId("smart:most-played")).toBe(true);
    expect(isSmartPlaylistId("smart:lossless")).toBe(true);
    expect(isSmartPlaylistId("smart:never-played")).toBe(true);
    expect(isSmartPlaylistId("favorites")).toBe(false);
    expect(isSmartPlaylistId("1700000000000")).toBe(false);
    expect(isSmartPlaylistId("smart:lain")).toBe(false);
    expect(isSmartPlaylistId(undefined)).toBe(false);
    expect(isSmartPlaylistId(null)).toBe(false);
  });
});

describe("selectRecentlyAdded", () => {
  it("urut dateAdded terbaru dulu, dibatasi 50", () => {
    const songs = Array.from({ length: 60 }, (_, i) =>
      song({ id: `s${i}`, dateAdded: 1000 + i }),
    );
    const out = selectRecentlyAdded(songs);
    expect(out).toHaveLength(50);
    expect(out[0].id).toBe("s59");
    expect(out[49].id).toBe("s10");
  });

  it("lagu tanpa dateAdded dianggap paling lama (0) — tetap masuk, di bawah", () => {
    const out = selectRecentlyAdded([
      song({ id: "nodate" }),
      song({ id: "baru", dateAdded: 5000 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["baru", "nodate"]);
  });

  it("tidak mengubah array asal", () => {
    const songs = [
      song({ id: "a", dateAdded: 1 }),
      song({ id: "b", dateAdded: 2 }),
    ];
    selectRecentlyAdded(songs);
    expect(songs.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("selectMostPlayed", () => {
  it("urut playCount terbanyak dulu, tie-break terakhir diputar", () => {
    const out = selectMostPlayed([
      song({ id: "a", playCount: 3, lastPlayed: 100 }),
      song({ id: "b", playCount: 10 }),
      song({ id: "c", playCount: 3, lastPlayed: 200 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("lagu yang belum pernah diputar (playCount 0 / undefined) TIDAK masuk", () => {
    const out = selectMostPlayed([
      song({ id: "nol", playCount: 0 }),
      song({ id: "undef" }),
      song({ id: "satu", playCount: 1 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["satu"]);
  });

  it("dibatasi 50 teratas", () => {
    const songs = Array.from({ length: 60 }, (_, i) =>
      song({ id: `s${i}`, playCount: i + 1 }),
    );
    expect(selectMostPlayed(songs)).toHaveLength(50);
  });
});

describe("isLosslessSong / selectLossless", () => {
  it("lossless ditentukan codec saja: FLAC/ALAC/WAV/DSD lolos, MP3/AAC/M4A tidak", () => {
    expect(isLosslessSong(song({ id: "a", codec: "FLAC" }))).toBe(true);
    expect(isLosslessSong(song({ id: "b", codec: "flac" }))).toBe(true);
    expect(isLosslessSong(song({ id: "c", codec: "ALAC" }))).toBe(true);
    expect(isLosslessSong(song({ id: "d", codec: "WAV" }))).toBe(true);
    expect(isLosslessSong(song({ id: "e", codec: "DSD" }))).toBe(true);
    expect(isLosslessSong(song({ id: "f", codec: "MP3" }))).toBe(false);
    expect(isLosslessSong(song({ id: "g", codec: "AAC" }))).toBe(false);
    // "M4A" wadah ambigu (ALAC atau AAC) — sengaja TIDAK diklaim lossless.
    expect(isLosslessSong(song({ id: "h", codec: "M4A" }))).toBe(false);
  });

  it("bitDepth 16 pada MP3 TIDAK membuatnya lossless (bug U-P0-1)", () => {
    expect(
      isLosslessSong(song({ id: "a", codec: "MP3", bitDepth: 16 })),
    ).toBe(false);
    expect(
      isLosslessSong(song({ id: "b", codec: "MP3", bitDepth: 24 })),
    ).toBe(false);
  });

  it("selectLossless: semua lagu lossless masuk (tanpa batas), urut judul", () => {
    const out = selectLossless([
      song({ id: "z", title: "Zulu", codec: "FLAC" }),
      song({ id: "m", title: "Mike", codec: "MP3" }),
      song({ id: "a", title: "Alpha", codec: "ALAC" }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "z"]);
  });
});

describe("selectNeverPlayed", () => {
  it("hanya playCount 0 / undefined; yang terbaru ditambahkan dulu", () => {
    const out = selectNeverPlayed([
      song({ id: "lama", playCount: 0, dateAdded: 100 }),
      song({ id: "baru", playCount: 0, dateAdded: 900 }),
      song({ id: "undef", dateAdded: 500 }),
      song({ id: "pernah", playCount: 1, dateAdded: 999 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["baru", "undef", "lama"]);
  });

  it("tanpa batas: semua lagu yang belum diputar masuk", () => {
    const songs = Array.from({ length: 120 }, (_, i) =>
      song({ id: `s${i}`, playCount: 0 }),
    );
    expect(selectNeverPlayed(songs)).toHaveLength(120);
  });
});

describe("selectSmartPlaylistSongs — staleness: dihitung dari daftar saat ini", () => {
  it("setiap panggilan menghitung ulang — lagu yang baru diputar langsung pindah daftar", () => {
    const songs = [
      song({ id: "a", playCount: 0, dateAdded: 100 }),
      song({ id: "b", playCount: 5, dateAdded: 200 }),
    ];
    expect(
      selectSmartPlaylistSongs("smart:never-played", songs).map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      selectSmartPlaylistSongs("smart:most-played", songs).map((s) => s.id),
    ).toEqual(["b"]);

    // Simulasi: lagu "a" baru saja diputar sekali.
    const afterPlay = [
      song({ id: "a", playCount: 1, lastPlayed: 9999, dateAdded: 100 }),
      song({ id: "b", playCount: 5, dateAdded: 200 }),
    ];
    expect(
      selectSmartPlaylistSongs("smart:never-played", afterPlay).map(
        (s) => s.id,
      ),
    ).toEqual([]);
    expect(
      selectSmartPlaylistSongs("smart:most-played", afterPlay).map(
        (s) => s.id,
      ),
    ).toEqual(["b", "a"]);
  });
});
