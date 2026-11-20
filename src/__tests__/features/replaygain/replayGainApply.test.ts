// src/__tests__/features/replaygain/replayGainApply.test.ts
//
// Orkestrasi applyReplayGainForSong: tag dari Song dulu (tanpa I/O),
// lalu cache sesi, lalu baca file + persist ke DB. Saat RG mati tidak
// ada I/O sama sekali.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockReadReplayGainTags = jest.fn(
  async (_uri: string, _filename?: string) => null as any,
);
jest.mock("@/features/replaygain/reader", () => ({
  __esModule: true,
  readReplayGainTags: (uri: string, filename?: string) =>
    mockReadReplayGainTags(uri, filename),
}));

const mockUpdateReplayGain = jest.fn();
jest.mock("@/shared/lib/sqlite", () => ({
  __esModule: true,
  SongQueries: { updateReplayGain: mockUpdateReplayGain },
  db: {},
}));

const loadModule = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("@/features/replaygain/store/replayGainStore") as typeof import(
    "@/features/replaygain/store/replayGainStore"
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const apply = require("@/features/replaygain/apply") as typeof import(
    "@/features/replaygain/apply"
  );
  return { ...store, ...apply };
};

const makeSong = (over: Record<string, unknown> = {}) =>
  ({
    id: "s1",
    uri: "file:///musik/lagu.flac",
    filename: "lagu.flac",
    title: "T",
    artist: "A",
    album: "Al",
    duration: 100,
    ...over,
  }) as any;

describe("applyReplayGainForSong", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadReplayGainTags.mockResolvedValue(null);
  });

  it("saat RG mati: tanpa I/O, tag null, store dibersihkan", async () => {
    const { useReplayGainStore, applyReplayGainForSong } = loadModule();
    useReplayGainStore.setState({
      currentSongId: "s1",
      currentTags: { trackGainDb: -6 },
    });
    const tags = await applyReplayGainForSong(
      makeSong({ replaygainTrackGainDb: -6 }),
    );
    expect(tags).toBeNull();
    expect(mockReadReplayGainTags).not.toHaveBeenCalled();
    expect(useReplayGainStore.getState().currentTags).toBeNull();
  });

  it("memakai tag dari Song tanpa baca file", async () => {
    const { useReplayGainStore, applyReplayGainForSong } = loadModule();
    useReplayGainStore.getState().setReplayGainEnabled(true);
    const tags = await applyReplayGainForSong(
      makeSong({ replaygainTrackGainDb: -6.23 }),
    );
    expect(tags).toEqual({ trackGainDb: -6.23 });
    expect(mockReadReplayGainTags).not.toHaveBeenCalled();
    expect(useReplayGainStore.getState().currentTags).toEqual({
      trackGainDb: -6.23,
    });
    expect(useReplayGainStore.getState().currentSongId).toBe("s1");
  });

  it("membaca file bila Song belum punya tag, lalu persist ke DB + tulis balik", async () => {
    const { useReplayGainStore, applyReplayGainForSong } = loadModule();
    mockReadReplayGainTags.mockResolvedValue({
      trackGainDb: -8,
      albumGainDb: -2,
      trackPeak: 0.9,
    });
    useReplayGainStore.getState().setReplayGainEnabled(true);
    const song = makeSong();
    const tags = await applyReplayGainForSong(song);
    expect(tags).toEqual({
      trackGainDb: -8,
      albumGainDb: -2,
      trackPeak: 0.9,
    });
    expect(mockReadReplayGainTags).toHaveBeenCalledWith(
      "file:///musik/lagu.flac",
      "lagu.flac",
    );
    expect(mockUpdateReplayGain).toHaveBeenCalledWith("s1", {
      trackGainDb: -8,
      albumGainDb: -2,
      trackPeak: 0.9,
    });
    // Tulis balik ke objek Song (antrean).
    expect(song.replaygainTrackGainDb).toBe(-8);
    expect(song.replaygainAlbumGainDb).toBe(-2);
    // Panggilan kedua memakai cache sesi — file tidak dibaca ulang.
    mockReadReplayGainTags.mockClear();
    await applyReplayGainForSong(makeSong());
    expect(mockReadReplayGainTags).not.toHaveBeenCalled();
  });

  it("applyReplayGainForSong(null) membersihkan tag aktif", async () => {
    const { useReplayGainStore, applyReplayGainForSong } = loadModule();
    useReplayGainStore.getState().setReplayGainEnabled(true);
    useReplayGainStore.setState({
      currentSongId: "s1",
      currentTags: { trackGainDb: -6 },
    });
    await applyReplayGainForSong(null);
    expect(useReplayGainStore.getState().currentTags).toBeNull();
  });
});
