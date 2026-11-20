/**
 * J2-1 (sisa) — buildNativeSongMap: peta uri -> NativeSong untuk
 * enrichment. Modul murni (nativeSongCache.ts): tanpa dependensi
 * runtime, jadi diuji langsung tanpa mock native/store.
 */
import { buildNativeSongMap } from "@/features/library/services/nativeSongCache";
import type { NativeSong } from "@/features/library/native/MediaStoreModule";

function song(uri: string, id = "1"): NativeSong {
  return {
    id,
    uri,
    filename: "song.mp3",
    title: "Lagu",
    artist: "Artis",
    album: "Album",
    albumId: 7,
    artwork: "",
    artworkUri: "",
    folder: "Music",
    genre: "Pop",
    codec: "MP3",
    mimeType: "audio/mpeg",
    duration: 200,
    dateAdded: 0,
    fileSize: 1000,
    year: 2020,
    trackNumber: 1,
    discNumber: 1,
    bitrate: 320,
    sampleRate: 44100,
    bitDepth: 16,
    isEnriched: false,
    isFavorite: false,
    playCount: 0,
  };
}

describe("buildNativeSongMap (J2-1)", () => {
  it("daftar kosong / null / undefined -> map kosong", () => {
    expect(buildNativeSongMap([]).size).toBe(0);
    expect(buildNativeSongMap(null).size).toBe(0);
    expect(buildNativeSongMap(undefined).size).toBe(0);
  });

  it("satu lagu per uri, lookup di memori", () => {
    const a = song("content://media/external/audio/media/1", "1");
    const b = song("content://media/external/audio/media/2", "2");
    const map = buildNativeSongMap([a, b]);
    expect(map.size).toBe(2);
    expect(map.get(a.uri)).toBe(a);
    expect(map.get(b.uri)).toBe(b);
    expect(map.get("content://media/external/audio/media/9")).toBeUndefined();
  });

  it("entri tanpa uri / null dilewati, tidak merusak map", () => {
    const a = song("content://media/external/audio/media/1", "1");
    const noUri = { ...a, id: "x", uri: "" };
    const map = buildNativeSongMap([a, noUri, null, undefined]);
    expect(map.size).toBe(1);
    expect(map.get(a.uri)).toBe(a);
  });

  it("uri duplikat: yang terakhir menang (satu entri per uri)", () => {
    const first = song("content://media/external/audio/media/1", "1");
    const last = {
      ...song("content://media/external/audio/media/1", "1"),
      title: "Baru",
    };
    const map = buildNativeSongMap([first, last]);
    expect(map.size).toBe(1);
    expect(map.get(first.uri)).toBe(last);
  });
});
