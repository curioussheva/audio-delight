// src/__tests__/features/player/brainwaveStore.test.ts
//
// Denyut binaural (2026-11-20): store brainwaveFreq — default 0 (mati),
// persist kunci "brainwave_freq", dorong native lewat jendela throttle
// Solfeggio yang sama, reset native ke 0 saat keluar immersive dan
// dorong lagi nilai tersimpan saat masuk immersive.
// Pola harness mengikuti solfeggioThrottle.test.ts (resetModules per test
// supaya state throttle module-level selalu segar).

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  // initStore membuat satu NativeEventEmitter (singleton globalThis)
  // dan mendaftarkan AppState listener.
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: () => {} }),
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("@/features/player/api/engine", () => ({
  audioEngine: {
    setProcessingMode: jest.fn(),
    toggleExclusiveMode: jest.fn(async () => {}),
    getSessionId: jest.fn(() => 0),
  },
}));

jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: { getSongById: jest.fn(async () => null) },
}));

jest.mock("@/features/library/services/lyricsSource", () => ({
  songLyricsToLines: jest.fn(() => []),
  loadLyricsForSong: jest.fn(async () => []),
}));

jest.mock("@/shared/lib/sqlite", () => ({ SongQueries: {}, db: {} }));

jest.mock("@/specs/NativePlaybackService", () => ({
  __esModule: true,
  default: {},
}));

// playerStore kini mengimpor visualizerService (arm dari playSong); spec
// TurboModule-nya memanggil getEnforcing di import time — mock di sini
// supaya store bisa dimuat di env node.
jest.mock("../../../specs/NativeVisualizerBridge", () => ({
  __esModule: true,
  default: {
    startVisualizer: jest.fn(async () => true),
    stopVisualizer: jest.fn(() => {}),
    getFFTData: jest.fn(async () => Array.from({ length: 128 }, () => 0)),
  },
}));

const mockNative = {
  setSolfeggioFreq: jest.fn(),
  setResonanceIntensity: jest.fn(),
  setBrainwaveFreq: jest.fn(),
};

jest.mock("@/features/equalizer/api/nativeInterface", () => ({
  __esModule: true,
  default: mockNative,
  NativeDSPModule: mockNative,
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

// Muat ulang modul store per test supaya state throttle module-level
// (_solfeggioLastAt / timer / pending) selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/player/store/playerStore")
    .usePlayerStore as typeof import("@/features/player/store/playerStore").usePlayerStore;
};

const storage = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage").default as {
    getItem: jest.Mock;
    setItem: jest.Mock;
  };

const native = () => mockNative;

const engine = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/features/player/api/engine").audioEngine as {
    setProcessingMode: jest.Mock;
  };

describe("brainwaveFreq store (denyut binaural)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("default 0 (mati, sama dengan default native)", async () => {
    const store = loadStore();
    expect(store.getState().brainwaveFreq).toBe(0);
    expect(native().setBrainwaveFreq).not.toHaveBeenCalled();
  });

  it("setBrainwaveFreq: store + native + storage kunci brainwave_freq", async () => {
    const store = loadStore();
    await store.getState().setBrainwaveFreq(10);
    expect(store.getState().brainwaveFreq).toBe(10);
    expect(native().setBrainwaveFreq).toHaveBeenCalledWith(10);
    expect(storage().setItem).toHaveBeenCalledWith("brainwave_freq", "10");
  });

  it("frekuensi dijepit 0–40 sebelum dorong native", async () => {
    const store = loadStore();
    await store.getState().setBrainwaveFreq(50);
    expect(store.getState().brainwaveFreq).toBe(40);
    expect(native().setBrainwaveFreq).toHaveBeenCalledWith(40);
    await store.getState().setBrainwaveFreq(-5);
    expect(store.getState().brainwaveFreq).toBe(0);
    // Ketuk kedua masuk jendela throttle yang sama — dorong native-nya
    // tertunda sampai trailing fire (pola yang sama dengan tes jepit
    // Solfeggio).
    jest.advanceTimersByTime(100);
    expect(native().setBrainwaveFreq).toHaveBeenLastCalledWith(0);
  });

  it("ketuk cepat berbagi jendela throttle: native leading + trailing nilai akhir", async () => {
    const store = loadStore();
    await store.getState().setBrainwaveFreq(6); // leading
    await store.getState().setBrainwaveFreq(10); // pending
    expect(native().setBrainwaveFreq).toHaveBeenCalledTimes(1);
    expect(native().setBrainwaveFreq).toHaveBeenCalledWith(6);
    jest.advanceTimersByTime(99);
    expect(native().setBrainwaveFreq).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(native().setBrainwaveFreq).toHaveBeenCalledTimes(2);
    expect(native().setBrainwaveFreq).toHaveBeenLastCalledWith(10);
    expect(storage().setItem).toHaveBeenLastCalledWith(
      "brainwave_freq",
      "10",
    );
  });

  it("keluar immersive: native di-reset ke 0, preferensi tersimpan dipertahankan", async () => {
    const store = loadStore();
    await store.getState().setBrainwaveFreq(10);
    await store.getState().setAudioMode("immersive");
    jest.clearAllMocks();
    await store.getState().setAudioMode("dsp");
    expect(engine().setProcessingMode).toHaveBeenCalledWith("dsp");
    expect(native().setBrainwaveFreq).toHaveBeenCalledWith(0);
    expect(store.getState().brainwaveFreq).toBe(10);
  });

  it("masuk immersive: nilai tersimpan didorong lagi ke native", async () => {
    const store = loadStore();
    await store.getState().setBrainwaveFreq(10);
    jest.clearAllMocks();
    await store.getState().setAudioMode("immersive");
    expect(engine().setProcessingMode).toHaveBeenCalledWith("immersive");
    expect(native().setBrainwaveFreq).toHaveBeenCalledWith(10);
  });

  it("masuk immersive dengan denyut mati: tidak ada dorongan native", async () => {
    const store = loadStore();
    await store.getState().setAudioMode("immersive");
    expect(native().setBrainwaveFreq).not.toHaveBeenCalled();
  });

  it("initStore memulihkan denyut tersimpan", async () => {
    const store = loadStore();
    storage().getItem.mockImplementation(async (key: string) =>
      key === "brainwave_freq" ? "10" : null,
    );
    await store.getState().initStore();
    expect(store.getState().brainwaveFreq).toBe(10);
  });
});
