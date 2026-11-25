// src/__tests__/features/gapless/gaplessStore.test.ts
//
// Store Gapless: kunci persist sendiri, dorongan ke native lewat
// spec. Store mengimpor spec native + AsyncStorage, jadi keduanya
// di-mock di sini — yang diuji hanya logika store-nya. Pola
// crossfadeStore.test.ts.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockSetGaplessEnabled = jest.fn(
  async (_enabled: boolean, _sessionId: number) => true,
);
const mockCreateAudioSession = jest.fn(async () => ({
  sessionId: 7,
  isNew: false,
}));

jest.mock("@/specs/NativeDSPModule", () => ({
  __esModule: true,
  default: {
    createAudioSession: mockCreateAudioSession,
    setGaplessEnabled: mockSetGaplessEnabled,
  },
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = (publishSession = true) => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("@/features/gapless/store/gaplessStore")
    .useGaplessStore as typeof import("@/features/gapless/store/gaplessStore").useGaplessStore;
  if (publishSession) {
    // EQ-17: pushDsp menunggu token sesi — terbitkan 7 untuk modul
    // dspSession yang segar (require sesudah resetModules).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/dspSession").setDspSessionId(7);
  }
  return store;
};

describe("gaplessStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default ON (bukan mati seperti crossfade)", () => {
    const store = loadStore();
    expect(store.getState().gaplessEnabled).toBe(true);
  });

  it("setGaplessEnabled(false) menyimpan state + mendorong ke native dengan sessionId", async () => {
    const store = loadStore();
    await store.getState().setGaplessEnabled(false);
    expect(store.getState().gaplessEnabled).toBe(false);
    // EQ-17: tanpa createAudioSession per push — token sesi dipakai
    // ulang, setter tetap menerima sessionId yang sama.
    expect(mockCreateAudioSession).not.toHaveBeenCalled();
    expect(mockSetGaplessEnabled).toHaveBeenCalledWith(false, 7);
  });

  it("setGaplessEnabled(true) mendorong true ke native", async () => {
    const store = loadStore();
    await store.getState().setGaplessEnabled(false);
    jest.clearAllMocks();
    await store.getState().setGaplessEnabled(true);
    expect(store.getState().gaplessEnabled).toBe(true);
    expect(mockSetGaplessEnabled).toHaveBeenCalledWith(true, 7);
  });

  it("restoreToNative mendorong nilai tersimpan (tanpa mengubah state)", async () => {
    const store = loadStore();
    await store.getState().setGaplessEnabled(false);
    jest.clearAllMocks();
    await store.getState().restoreToNative();
    expect(store.getState().gaplessEnabled).toBe(false);
    expect(mockSetGaplessEnabled).toHaveBeenCalledWith(false, 7);
  });

  it("engine belum siap (tanpa token sesi) -> state tetap tersimpan, tanpa throw", async () => {
    // EQ-17: push menunggu token sesi (maks 10 detik) lalu melewati
    // dorongan bila engine tak kunjung siap — state (niat user) tetap
    // tersimpan, tidak ada throw.
    jest.useFakeTimers();
    try {
      const store = loadStore(false);
      const done = store.getState().setGaplessEnabled(false);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      expect(store.getState().gaplessEnabled).toBe(false);
      expect(mockSetGaplessEnabled).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
