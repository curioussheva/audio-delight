/**
 * filterSongsByQuery — logika pencarian modal tambah-ke-playlist
 * (AddSongsModal): cocok judul / artis / album, case-insensitive.
 */

import { filterSongsByQuery } from "@/features/playlist/utils/filterSongs";
import type { Song } from "@/shared/types/audio";

const song = (overrides: Partial<Song>): Song =>
  ({
    id: "x",
    title: "Judul",
    artist: "Artis",
    album: "Album",
    duration: 60,
    uri: "file://x.mp3",
    codec: "MP3",
    sampleRate: 44100,
    genre: "Unknown",
    folder: "Unknown",
    filename: "x.mp3",
    ...overrides,
  }) as Song;

const songs = [
  song({ id: "s1", title: "Dark Sky Island", artist: "Enya", album: "Dark Sky Island (Deluxe)" }),
  song({ id: "s2", title: "Skellig", artist: "Loreena McKennitt", album: "The Book of Secrets" }),
  song({ id: "s3", title: "Bounty Hunter", artist: "Lana Del Rey", album: "Greatest Hits" }),
];

describe("filterSongsByQuery", () => {
  it("query kosong mengembalikan semua lagu (referensi sama)", () => {
    expect(filterSongsByQuery(songs, "")).toBe(songs);
    expect(filterSongsByQuery(songs, "   ")).toBe(songs);
  });

  it("cocok judul, case-insensitive", () => {
    expect(filterSongsByQuery(songs, "skellig").map((s) => s.id)).toEqual([
      "s2",
    ]);
    expect(filterSongsByQuery(songs, "DARK").map((s) => s.id)).toEqual(["s1"]);
  });

  it("cocok artis dan album", () => {
    expect(filterSongsByQuery(songs, "enya").map((s) => s.id)).toEqual(["s1"]);
    expect(filterSongsByQuery(songs, "book of secrets").map((s) => s.id)).toEqual([
      "s2",
    ]);
  });

  it("tidak ada yang cocok → array kosong", () => {
    expect(filterSongsByQuery(songs, "zzz")).toEqual([]);
  });

  it("tidak crash bila field kosong", () => {
    const bare = [song({ id: "s9", title: "", artist: "", album: "" })];
    expect(filterSongsByQuery(bare, "a")).toEqual([]);
    expect(filterSongsByQuery(bare, "")).toBe(bare);
  });
});
