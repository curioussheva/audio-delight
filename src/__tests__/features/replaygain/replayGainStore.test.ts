// src/__tests__/features/replaygain/replayGainStore.test.ts
//
// Store ReplayGain: default OFF, toggle/mode persist, tag aktif, dan
// gain efektif (user × RG). Store ini sengaja tipis — TIDAK menyentuh
// file/DB/native (lihat komentar di store) — jadi yang diuji di sini
// hanya logika state-nya. Resolusi tag per lagu diuji di
// replayGainApply.test.ts.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/replaygain/store/replayGainStore") as typeof import(
    "@/features/replaygain/store/replayGainStore"
  );
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

describe("replayGainStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default OFF, mode track", () => {
    const { useReplayGainStore } = loadStore();
    const s = useReplayGainStore.getState();
    expect(s.isReplayGainEnabled).toBe(false);
    expect(s.replayGainMode).toBe("track");
    expect(s.currentTags).toBeNull();
  });

  it("setReplayGainEnabled(true) menyimpan state", () => {
    const { useReplayGainStore } = loadStore();
    useReplayGainStore.getState().setReplayGainEnabled(true);
    expect(useReplayGainStore.getState().isReplayGainEnabled).toBe(true);
  });

  it("setReplayGainEnabled(false) membersihkan tag aktif", () => {
    const { useReplayGainStore } = loadStore();
    useReplayGainStore.getState().setReplayGainEnabled(true);
    useReplayGainStore.setState({
      currentSongId: "s1",
      currentTags: { trackGainDb: -6 },
    });
    useReplayGainStore.getState().setReplayGainEnabled(false);
    expect(useReplayGainStore.getState().currentTags).toBeNull();
    expect(useReplayGainStore.getState().currentSongId).toBeNull();
  });

  it("setReplayGainMode('album') menyimpan mode", () => {
    const { useReplayGainStore } = loadStore();
    useReplayGainStore.getState().setReplayGainMode("album");
    expect(useReplayGainStore.getState().replayGainMode).toBe("album");
  });

  it("setCurrentTags menetapkan lagu + tag aktif", () => {
    const { useReplayGainStore } = loadStore();
    useReplayGainStore
      .getState()
      .setCurrentTags("s1", { trackGainDb: -6 });
    const s = useReplayGainStore.getState();
    expect(s.currentSongId).toBe("s1");
    expect(s.currentTags).toEqual({ trackGainDb: -6 });
  });

  it("getEffectiveMasterGain: RG mati / tanpa tag -> gain user; RG nyala -> user × RG", () => {
    const { useReplayGainStore, getEffectiveMasterGain } = loadStore();
    // RG mati.
    expect(getEffectiveMasterGain(1.0)).toBe(1.0);
    // RG nyala tapi lagu tanpa tag.
    useReplayGainStore.getState().setReplayGainEnabled(true);
    expect(getEffectiveMasterGain(1.0)).toBe(1.0);
    // RG nyala + tag -6 dB.
    useReplayGainStore.setState({
      currentSongId: "s1",
      currentTags: { trackGainDb: -6 },
    });
    expect(getEffectiveMasterGain(1.0)).toBeCloseTo(Math.pow(10, -6 / 20));
    // Mode album memakai album gain.
    useReplayGainStore.setState({
      currentTags: { trackGainDb: -6, albumGainDb: -2 },
      replayGainMode: "album",
    });
    expect(getEffectiveMasterGain(1.0)).toBeCloseTo(Math.pow(10, -2 / 20));
  });

  it("tagsFromSong: hanya field yang ada yang ikut", () => {
    const { tagsFromSong } = loadStore();
    expect(tagsFromSong(makeSong())).toBeNull();
    expect(
      tagsFromSong(
        makeSong({ replaygainTrackGainDb: -6, replaygainAlbumPeak: 0.8 }),
      ),
    ).toEqual({ trackGainDb: -6, albumPeak: 0.8 });
  });
});
