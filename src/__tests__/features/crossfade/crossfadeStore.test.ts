// src/__tests__/features/crossfade/crossfadeStore.test.ts
//
// Store Crossfade: kunci persist sendiri, dorongan ke native lewat
// spec. Store mengimpor spec native + AsyncStorage, jadi keduanya
// di-mock di sini — yang diuji hanya logika store-nya. Pola
// hrtfStore.test.ts.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockSetCrossfadeSeconds = jest.fn(
  async (_seconds: number, _sessionId: number) => true,
);
const mockCreateAudioSession = jest.fn(async () => ({
  sessionId: 7,
  isNew: false,
}));

jest.mock("@/specs/NativeDSPModule", () => ({
  __esModule: true,
  default: {
    createAudioSession: mockCreateAudioSession,
    setCrossfadeSeconds: mockSetCrossfadeSeconds,
  },
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = (publishSession = true) => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("@/features/crossfade/store/crossfadeStore")
    .useCrossfadeStore as typeof import("@/features/crossfade/store/crossfadeStore").useCrossfadeStore;
  if (publishSession) {
    // EQ-17: pushDsp menunggu token sesi — terbitkan 7 untuk modul
    // dspSession yang segar (require sesudah resetModules).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/dspSession").setDspSessionId(7);
  }
  return store;
};

describe("crossfadeStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default 0 (mati)", () => {
    const store = loadStore();
    expect(store.getState().crossfadeSeconds).toBe(0);
  });

  it("setCrossfadeSeconds(5) menyimpan state + mendorong ke native dengan sessionId", async () => {
    const store = loadStore();
    await store.getState().setCrossfadeSeconds(5);
    expect(store.getState().crossfadeSeconds).toBe(5);
    // EQ-17: tanpa createAudioSession per push — token sesi dipakai
    // ulang, setter tetap menerima sessionId yang sama.
    expect(mockCreateAudioSession).not.toHaveBeenCalled();
    expect(mockSetCrossfadeSeconds).toHaveBeenCalledWith(5, 7);
  });

  it("setCrossfadeSeconds(20) di-clamp ke 12 sebelum disimpan + didorong", async () => {
    const store = loadStore();
    await store.getState().setCrossfadeSeconds(20);
    expect(store.getState().crossfadeSeconds).toBe(12);
    expect(mockSetCrossfadeSeconds).toHaveBeenCalledWith(12, 7);
  });

  it("setCrossfadeSeconds(-2) di-clamp ke 0", async () => {
    const store = loadStore();
    await store.getState().setCrossfadeSeconds(-2);
    expect(store.getState().crossfadeSeconds).toBe(0);
    expect(mockSetCrossfadeSeconds).toHaveBeenCalledWith(0, 7);
  });

  it("restoreToNative mendorong nilai tersimpan (tanpa mengubah state)", async () => {
    const store = loadStore();
    await store.getState().setCrossfadeSeconds(3);
    jest.clearAllMocks();
    await store.getState().restoreToNative();
    expect(store.getState().crossfadeSeconds).toBe(3);
    expect(mockSetCrossfadeSeconds).toHaveBeenCalledWith(3, 7);
  });

  it("engine belum siap (tanpa token sesi) -> state tetap tersimpan, tanpa throw", async () => {
    // EQ-17: push menunggu token sesi (maks 10 detik) lalu melewati
    // dorongan bila engine tak kunjung siap — state (niat user) tetap
    // tersimpan, tidak ada throw.
    jest.useFakeTimers();
    try {
      const store = loadStore(false);
      const done = store.getState().setCrossfadeSeconds(4);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      expect(store.getState().crossfadeSeconds).toBe(4);
      expect(mockSetCrossfadeSeconds).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
