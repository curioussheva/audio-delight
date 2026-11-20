// src/__tests__/features/player/visualizerArm.test.ts
//
// Visualizer arm dari playSong (2026-11-20): session di-arm begitu native
// play() sukses, supaya visualizer siap jalan bareng audio tanpa menunggu
// Player screen mount + efek start (dugaan "missing start" csheva).
// Store mengimpor banyak modul (scanner, sqlite, native), jadi semuanya
// di-mock di sini — pola harness mengikuti solfeggioThrottle.test.ts
// (resetModules per test supaya state module-level selalu segar).
// visualizerService di-mock (bukan service asli): yang dibuktikan di sini
// hanya playSong memanggil start() di saat yang tepat dengan id yang tepat;
// perilaku service sendiri (dedupe, pendingSessionId) sudah diuji
// VisualizerService.test.ts.

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockAudioEngine = { getSessionId: jest.fn(() => 123) };

jest.mock("@/features/player/api/engine", () => ({
  audioEngine: mockAudioEngine,
}));

jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: { getSongById: jest.fn(async () => null) },
}));

jest.mock("@/features/library/services/lyricsSource", () => ({
  songLyricsToLines: jest.fn(() => []),
  loadLyricsForSong: jest.fn(async () => []),
}));

jest.mock("@/shared/lib/sqlite", () => ({ SongQueries: {}, db: {} }));

const mockPlayback = {
  setQueue: jest.fn(async () => {}),
  play: jest.fn(async () => {}),
  updateMetadata: jest.fn(),
  updatePlaybackState: jest.fn(),
  updateShuffleMode: jest.fn(),
  updateRepeatMode: jest.fn(),
  seek: jest.fn(async () => {}),
};

jest.mock("@/specs/NativePlaybackService", () => ({
  __esModule: true,
  default: mockPlayback,
}));

const mockNative = {};

jest.mock("@/features/equalizer/api/nativeInterface", () => ({
  __esModule: true,
  default: mockNative,
  NativeDSPModule: mockNative,
}));

jest.mock("@/features/replaygain/apply", () => ({
  applyReplayGainForSong: jest.fn(async () => {}),
}));

const mockVisualizerService = { start: jest.fn(async () => true) };

jest.mock("@/features/visualizer/services/VisualizerService", () => ({
  visualizerService: mockVisualizerService,
}));

jest.mock("@/shared/utils/queueNavigation", () => ({
  findSongByUri: jest.fn(() => null),
  isPlayingFromStatus: jest.fn(() => false),
  shouldCorrectDuration: jest.fn(() => false),
  shouldRestartInsteadOfPrevious: jest.fn(() => false),
  uriMatches: jest.fn(() => false),
  validateQueueIndex: jest.fn(() => 0),
}));

jest.mock("@/shared/utils/audioQuality", () => ({
  isHiRes: () => false,
}));

// Muat ulang modul store per test supaya state module-level (dedupe
// playSong) selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/player/store/playerStore")
    .usePlayerStore as typeof import("@/features/player/store/playerStore").usePlayerStore;
};

import type { Song } from "@/shared/types/audio";

const SONG: Song = {
  id: "s1",
  uri: "file:///music/s1.mp3",
  title: "Lagu Tes",
  artist: "Artis Tes",
  album: "Album Tes",
  duration: 180,
};

describe("visualizer arm dari playSong (2026-11-20)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAudioEngine.getSessionId.mockReturnValue(123);
    mockPlayback.play.mockResolvedValue(undefined);
    mockPlayback.setQueue.mockResolvedValue(undefined);
    mockVisualizerService.start.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("play sukses → visualizerService.start dipanggil sekali dengan session id store", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(123);
    const ok = await store.getState().playSong(SONG, [SONG]);
    expect(ok).toBe(true);
    expect(mockVisualizerService.start).toHaveBeenCalledTimes(1);
    expect(mockVisualizerService.start).toHaveBeenCalledWith(123);
  });

  it("store diutamakan atas engine bila keduanya ada dan berbeda", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(123);
    mockAudioEngine.getSessionId.mockReturnValue(456);
    const ok = await store.getState().playSong(SONG, [SONG]);
    expect(ok).toBe(true);
    expect(mockVisualizerService.start).toHaveBeenCalledTimes(1);
    expect(mockVisualizerService.start).toHaveBeenCalledWith(123);
  });

  it("fallback ke engine bila store null", async () => {
    const store = loadStore();
    mockAudioEngine.getSessionId.mockReturnValue(456);
    const ok = await store.getState().playSong(SONG, [SONG]);
    expect(ok).toBe(true);
    expect(mockVisualizerService.start).toHaveBeenCalledTimes(1);
    expect(mockVisualizerService.start).toHaveBeenCalledWith(456);
  });

  it("session id invalid (store + engine null) → start TIDAK dipanggil, play tetap sukses", async () => {
    const store = loadStore();
    mockAudioEngine.getSessionId.mockReturnValue(null);
    const ok = await store.getState().playSong(SONG, [SONG]);
    expect(ok).toBe(true);
    expect(mockVisualizerService.start).not.toHaveBeenCalled();
  });

  it("play gagal (native play reject) → start TIDAK dipanggil", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(123);
    mockPlayback.play.mockRejectedValueOnce(new Error("decoder gagal"));
    const ok = await store.getState().playSong(SONG, [SONG]);
    expect(ok).toBe(false);
    expect(mockVisualizerService.start).not.toHaveBeenCalled();
  });
});
