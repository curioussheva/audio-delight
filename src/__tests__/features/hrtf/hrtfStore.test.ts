// src/__tests__/features/hrtf/hrtfStore.test.ts
//
// Store HRTF (langkah 6): kunci persist sendiri, dorongan ke native
// lewat spec. Store mengimpor spec native + AsyncStorage, jadi keduanya
// di-mock di sini — yang diuji hanya logika store-nya.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockSetHrtfEnabled = jest.fn(
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
    setHrtfEnabled: mockSetHrtfEnabled,
  },
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/hrtf/store/hrtfStore")
    .useHrtfStore as typeof import("@/features/hrtf/store/hrtfStore").useHrtfStore;
};

describe("hrtfStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default OFF", () => {
    const store = loadStore();
    expect(store.getState().isHrtfEnabled).toBe(false);
  });

  it("setHrtfEnabled(true) menyimpan state + mendorong ke native dengan sessionId", async () => {
    const store = loadStore();
    await store.getState().setHrtfEnabled(true);
    expect(store.getState().isHrtfEnabled).toBe(true);
    expect(mockCreateAudioSession).toHaveBeenCalled();
    expect(mockSetHrtfEnabled).toHaveBeenCalledWith(true, 7);
  });

  it("setHrtfEnabled(false) menyimpan state + mendorong false ke native", async () => {
    const store = loadStore();
    await store.getState().setHrtfEnabled(true);
    await store.getState().setHrtfEnabled(false);
    expect(store.getState().isHrtfEnabled).toBe(false);
    expect(mockSetHrtfEnabled).toHaveBeenLastCalledWith(false, 7);
  });

  it("sessionId -1 -> native tidak dipanggil, state tetap tersimpan", async () => {
    mockCreateAudioSession.mockResolvedValueOnce({
      sessionId: -1,
      isNew: false,
    });
    const store = loadStore();
    await store.getState().setHrtfEnabled(true);
    expect(store.getState().isHrtfEnabled).toBe(true);
    expect(mockSetHrtfEnabled).not.toHaveBeenCalled();
  });

  it("native menolak -> state tetap tersimpan (niat user), tidak throw", async () => {
    mockSetHrtfEnabled.mockRejectedValueOnce(new Error("bridge belum siap"));
    const store = loadStore();
    await expect(
      store.getState().setHrtfEnabled(true),
    ).resolves.toBeUndefined();
    expect(store.getState().isHrtfEnabled).toBe(true);
  });
});
