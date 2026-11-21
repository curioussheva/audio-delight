/**
 * Cache hasil analyzeBitDepth (item 8 optimasi render).
 *
 * Modul murni TS — tidak menyeret react-native / expo, jadi bisa jalan
 * di setup Jest repo ini (logika murni saja, lihat jest.config.cjs).
 *
 * TIDAK diuji di sini: debounce timer di AnalyzerScreen — effect React
 * tidak bisa diuji tanpa @testing-library/react-native, yang tidak ada
 * di repo dan sengaja tidak ditambahkan (jest.config.cjs: "Kalau nanti
 * mau menguji komponen, buat project Jest terpisah"). Debounce
 * diverifikasi lewat baca kode + tsc/oxlint saja.
 */
import {
  BIT_DEPTH_CACHE_MAX_ENTRIES,
  clearBitDepthCache,
  getBitDepthCacheKey,
  getCachedBitDepth,
  setCachedBitDepth,
} from "../../../features/audio/api/bitDepthCache";
import type { BitDepthAnalysis } from "../../../features/audio/api/BitDepthVerifier";
import type { Song } from "@/shared/types/audio";

const makeSong = (over: Partial<Song> = {}): Song =>
  ({
    id: "s1",
    uri: "file:///music/lagu.flac",
    filename: "lagu.flac",
    title: "Lagu",
    artist: "A",
    album: "Al",
    duration: 100,
    bitDepth: 24,
    sampleRate: 96000,
    bitrate: 3000000,
    codec: "flac",
    fileSize: 12345678,
    ...over,
  }) as Song;

const makeResult = (over: Partial<BitDepthAnalysis> = {}): BitDepthAnalysis => ({
  declaredDepth: 24,
  realDepth: 24,
  isFake: false,
  confidence: 90,
  paddingRatio: 0,
  warnings: [],
  spectral: null,
  spectralVerdict: "consistent",
  ...over,
});

beforeEach(() => {
  clearBitDepthCache();
});

describe("getBitDepthCacheKey", () => {
  it("lagu yang sama -> key yang sama", () => {
    expect(getBitDepthCacheKey(makeSong())).toBe(getBitDepthCacheKey(makeSong()));
  });

  it.each([
    ["id", { id: "s2" }],
    ["uri", { uri: "file:///music/lain.flac" }],
    ["filename", { filename: "lain.flac" }],
    ["bitDepth", { bitDepth: 16 }],
    ["sampleRate", { sampleRate: 44100 }],
    ["bitrate", { bitrate: 1411000 }],
    ["codec", { codec: "mp3" }],
    ["fileSize", { fileSize: 999 }],
  ])("key berubah kalau %s berubah (edit metadata menginvalidasi cache)", (_label, over) => {
    expect(getBitDepthCacheKey(makeSong(over))).not.toBe(
      getBitDepthCacheKey(makeSong()),
    );
  });

  it("key TIDAK berubah kalau hanya title berubah (title bukan input analisis)", () => {
    expect(getBitDepthCacheKey(makeSong({ title: "Judul Baru" }))).toBe(
      getBitDepthCacheKey(makeSong()),
    );
  });
});

describe("get/set cache", () => {
  it("miss sebelum disimpan, hit sesudahnya — objek yang sama", () => {
    const key = getBitDepthCacheKey(makeSong());
    expect(getCachedBitDepth(key)).toBeUndefined();
    const result = makeResult();
    setCachedBitDepth(key, result);
    // Hit kedua: hasil yang sama tanpa analisis ulang.
    expect(getCachedBitDepth(key)).toBe(result);
  });

  it("lagu lain (key lain) tetap miss", () => {
    setCachedBitDepth(getBitDepthCacheKey(makeSong()), makeResult());
    expect(
      getCachedBitDepth(getBitDepthCacheKey(makeSong({ id: "s2" }))),
    ).toBeUndefined();
  });

  it("edit metadata (fileSize berubah) -> miss, hasil lama tidak dipakai", () => {
    const before = makeResult({ confidence: 90 });
    setCachedBitDepth(getBitDepthCacheKey(makeSong()), before);
    expect(
      getCachedBitDepth(getBitDepthCacheKey(makeSong({ fileSize: 1 }))),
    ).toBeUndefined();
  });

  it("melebihi kapasitas -> entri tertua dibuang (FIFO)", () => {
    const firstKey = getBitDepthCacheKey(makeSong({ id: "first" }));
    setCachedBitDepth(firstKey, makeResult());
    for (let i = 0; i < BIT_DEPTH_CACHE_MAX_ENTRIES; i++) {
      setCachedBitDepth(
        getBitDepthCacheKey(makeSong({ id: `s-${i}` })),
        makeResult(),
      );
    }
    expect(getCachedBitDepth(firstKey)).toBeUndefined();
    expect(
      getCachedBitDepth(getBitDepthCacheKey(makeSong({ id: "s-0" }))),
    ).toBeDefined();
  });

  it("clearBitDepthCache mengosongkan semua", () => {
    setCachedBitDepth(getBitDepthCacheKey(makeSong()), makeResult());
    clearBitDepthCache();
    expect(getCachedBitDepth(getBitDepthCacheKey(makeSong()))).toBeUndefined();
  });
});
