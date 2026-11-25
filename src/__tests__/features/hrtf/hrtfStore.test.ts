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
const loadStore = (publishSession = true) => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("@/features/hrtf/store/hrtfStore")
    .useHrtfStore as typeof import("@/features/hrtf/store/hrtfStore").useHrtfStore;
  if (publishSession) {
    // EQ-17: pushDsp menunggu token sesi — terbitkan 7 untuk modul
    // dspSession yang segar (require sesudah resetModules).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/dspSession").setDspSessionId(7);
  }
  return store;
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
    // EQ-17: tanpa createAudioSession per push — token sesi dipakai
    // ulang, setter tetap menerima sessionId yang sama.
    expect(mockCreateAudioSession).not.toHaveBeenCalled();
    expect(mockSetHrtfEnabled).toHaveBeenCalledWith(true, 7);
  });

  it("setHrtfEnabled(false) menyimpan state + mendorong false ke native", async () => {
    const store = loadStore();
    await store.getState().setHrtfEnabled(true);
    await store.getState().setHrtfEnabled(false);
    expect(store.getState().isHrtfEnabled).toBe(false);
    expect(mockSetHrtfEnabled).toHaveBeenLastCalledWith(false, 7);
  });

  it("engine belum siap (tanpa token sesi) -> native tidak dipanggil, state tetap tersimpan", async () => {
    // EQ-17: push menunggu token sesi (maks 10 detik) lalu melewati
    // dorongan bila engine tak kunjung siap.
    jest.useFakeTimers();
    try {
      const store = loadStore(false);
      const done = store.getState().setHrtfEnabled(true);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      expect(store.getState().isHrtfEnabled).toBe(true);
      expect(mockSetHrtfEnabled).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
