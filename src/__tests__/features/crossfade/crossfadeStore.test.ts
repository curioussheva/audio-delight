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
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/crossfade/store/crossfadeStore")
    .useCrossfadeStore as typeof import("@/features/crossfade/store/crossfadeStore").useCrossfadeStore;
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
    expect(mockCreateAudioSession).toHaveBeenCalled();
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

  it("native gagal (sessionId -1) -> state tetap tersimpan, tanpa throw", async () => {
    mockCreateAudioSession.mockResolvedValueOnce({
      sessionId: -1,
      isNew: false,
    });
    const store = loadStore();
    await expect(
      store.getState().setCrossfadeSeconds(4),
    ).resolves.toBeUndefined();
    expect(store.getState().crossfadeSeconds).toBe(4);
    expect(mockSetCrossfadeSeconds).not.toHaveBeenCalled();
  });
});
