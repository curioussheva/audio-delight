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
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/gapless/store/gaplessStore")
    .useGaplessStore as typeof import("@/features/gapless/store/gaplessStore").useGaplessStore;
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
    expect(mockCreateAudioSession).toHaveBeenCalled();
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

  it("native gagal (sessionId -1) -> state tetap tersimpan, tanpa throw", async () => {
    mockCreateAudioSession.mockResolvedValueOnce({
      sessionId: -1,
      isNew: false,
    });
    const store = loadStore();
    await expect(
      store.getState().setGaplessEnabled(false),
    ).resolves.toBeUndefined();
    expect(store.getState().gaplessEnabled).toBe(false);
    expect(mockSetGaplessEnabled).not.toHaveBeenCalled();
  });
});
