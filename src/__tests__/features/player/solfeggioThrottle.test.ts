// src/__tests__/features/player/solfeggioThrottle.test.ts
//
// P2 audit BitPerfect/Solfeggio 2026-11-20: slider Solfeggio dulu tanpa
// throttle + tulis AsyncStorage per tick drag. Store mengimpor banyak modul
// (scanner, sqlite, native), jadi semuanya di-mock di sini — yang diuji
// hanya logika throttle + persist tertunda. Pola harness mengikuti
// equalizerStore.test.ts (resetModules per test supaya state throttle
// module-level selalu segar).

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  // playerStore kini mengimpor visualizerService (arm dari playSong);
  // konstruktor service mendaftarkan AppState listener di import time.
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("@/features/player/api/engine", () => ({ audioEngine: {} }));

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
    setItem: jest.Mock;
  };

const native = () => mockNative;

describe("Solfeggio slider throttle + persist tertunda (P2 audit)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("leading: tick pertama langsung masuk store + dorong native, storage belum ditulis", async () => {
    const store = loadStore();
    await store.getState().setResonanceIntensity(0.7);
    expect(store.getState().resonanceIntensity).toBe(0.7);
    expect(native().setResonanceIntensity).toHaveBeenCalledTimes(1);
    expect(native().setResonanceIntensity).toHaveBeenCalledWith(0.7);
    expect(storage().setItem).not.toHaveBeenCalled();
  });

  it("tick cepat dalam satu jendela digabung: native leading + trailing nilai akhir; storage hanya saat trailing", async () => {
    const store = loadStore();
    await store.getState().setResonanceIntensity(0.1); // leading
    await store.getState().setResonanceIntensity(0.2);
    await store.getState().setResonanceIntensity(0.3);
    await store.getState().setResonanceIntensity(0.4);
    await store.getState().setResonanceIntensity(0.5);
    // Store live per tick (UI responsif); native + storage tidak.
    expect(store.getState().resonanceIntensity).toBe(0.5);
    expect(native().setResonanceIntensity).toHaveBeenCalledTimes(1);
    expect(storage().setItem).not.toHaveBeenCalled();
    jest.advanceTimersByTime(99);
    expect(native().setResonanceIntensity).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    // Trailing flush menulis 2 key lewat await berurutan — beri giliran
    // microtask supaya semua setItem tercatat sebelum assert.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(native().setResonanceIntensity).toHaveBeenCalledTimes(2);
    expect(native().setResonanceIntensity).toHaveBeenLastCalledWith(0.5);
    // Trailing flush menulis nilai akhir (intensitas + template).
    const written = storage().setItem.mock.calls.map((c) => c[0]);
    expect(written).toContain("resonance_intensity");
    expect(written).toContain("solfeggio_template");
    expect(storage().setItem).toHaveBeenCalledWith(
      "resonance_intensity",
      "0.5",
    );
  });

  it("persistSolfeggioNow menulis nilai tertunda; panggilan kedua tidak menulis apa-apa", async () => {
    const store = loadStore();
    await store.getState().setSolfeggioFreq(600);
    expect(storage().setItem).not.toHaveBeenCalled();
    await store.getState().persistSolfeggioNow();
    expect(storage().setItem).toHaveBeenCalledWith("solfeggio_freq", "600");
    storage().setItem.mockClear();
    await store.getState().persistSolfeggioNow();
    expect(storage().setItem).not.toHaveBeenCalled();
  });

  it("setSolfeggioTemplate menulis storage langsung (aksi ketuk, bukan drag)", async () => {
    const store = loadStore();
    await store.getState().setSolfeggioTemplate("fokus");
    expect(store.getState().solfeggioFreq).toBe(528);
    expect(store.getState().resonanceIntensity).toBe(0.5);
    expect(store.getState().solfeggioTemplateId).toBe("fokus");
    expect(storage().setItem).toHaveBeenCalledWith(
      "solfeggio_template",
      "fokus",
    );
    expect(storage().setItem).toHaveBeenCalledWith("solfeggio_freq", "528");
    expect(storage().setItem).toHaveBeenCalledWith(
      "resonance_intensity",
      "0.5",
    );
  });

  it("frekuensi dijepit 100–2000 sebelum dorong native", async () => {
    const store = loadStore();
    await store.getState().setSolfeggioFreq(50);
    expect(store.getState().solfeggioFreq).toBe(100);
    expect(native().setSolfeggioFreq).toHaveBeenCalledWith(100);
    await store.getState().setSolfeggioFreq(5000);
    jest.advanceTimersByTime(100);
    expect(store.getState().solfeggioFreq).toBe(2000);
    expect(native().setSolfeggioFreq).toHaveBeenLastCalledWith(2000);
  });

  it("kedua slider berbagi satu jendela throttle", async () => {
    const store = loadStore();
    await store.getState().setSolfeggioFreq(600); // leading
    await store.getState().setResonanceIntensity(0.8); // pending
    expect(native().setSolfeggioFreq).toHaveBeenCalledTimes(1);
    expect(native().setResonanceIntensity).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(native().setResonanceIntensity).toHaveBeenCalledTimes(1);
    expect(native().setResonanceIntensity).toHaveBeenCalledWith(0.8);
  });
});
