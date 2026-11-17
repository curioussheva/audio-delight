// src/__tests__/features/equalizer/equalizerStore.test.ts
//
// Fix G: throttle update store di setBandGain (leading + trailing, 100 ms).
// Store mengimpor react-native / AsyncStorage / modul native, jadi semuanya
// di-mock di sini — yang diuji hanya logika throttle store-nya. Native
// apply (J1-2) tidak berubah dan EQ dimatikan di test ini, jadi tidak ada
// panggilan native yang terlibat.

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("@/features/player/api/engine", () => ({ audioEngine: {} }));

jest.mock("@/features/equalizer/api/nativeInterface", () => ({
  __esModule: true,
  NativeDSPModule: {
    setFullEqualizer: jest.fn(async () => true),
    createAudioSession: jest.fn(async () => ({ sessionId: -1, isNew: false })),
  },
}));

// Muat ulang modul store per test supaya state throttle module-level
// (_eqStoreLastAt / timer / pending) selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/equalizer/store/equalizerStore")
    .useEqualizerStore as typeof import("@/features/equalizer/store/equalizerStore").useEqualizerStore;
};

describe("setBandGain store throttle (Fix G)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const gainAt = (store: ReturnType<typeof loadStore>, i: number) =>
    store.getState().bands[i]?.gain;

  it("leading: tick pertama langsung masuk store", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 5);
    expect(gainAt(store, 0)).toBe(5);
    expect(store.getState().activePresetId).toBe("custom");
  });

  it("tick cepat dalam satu jendela digabung: store tidak update sampai trailing flush, nilai terakhir yang menang", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(0, 2);
    store.getState().setBandGain(0, 3);
    store.getState().setBandGain(0, 4);
    expect(gainAt(store, 0)).toBe(1); // belum update di tiap tick
    jest.advanceTimersByTime(99);
    expect(gainAt(store, 0)).toBe(1); // belum flush
    jest.advanceTimersByTime(1);
    expect(gainAt(store, 0)).toBe(4); // trailing: nilai terbaru
  });

  it("perubahan band berbeda dalam satu jendela sama-sama kebawa flush", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(1, 7); // pending, band lain
    store.getState().setBandGain(0, 2); // pending, band sama
    jest.advanceTimersByTime(100);
    expect(gainAt(store, 0)).toBe(2);
    expect(gainAt(store, 1)).toBe(7);
  });

  it("clamp ±10 tetap berlaku pada nilai pending (trailing)", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 0); // leading
    store.getState().setBandGain(0, 50);
    jest.advanceTimersByTime(100);
    expect(gainAt(store, 0)).toBe(10);
  });

  it("setelah jendela habis, tick berikutnya leading lagi", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1);
    store.getState().setBandGain(0, 2);
    jest.advanceTimersByTime(100); // flush -> 2
    expect(gainAt(store, 0)).toBe(2);
    jest.advanceTimersByTime(100); // jendela baru
    store.getState().setBandGain(0, 3);
    expect(gainAt(store, 0)).toBe(3); // langsung, tanpa tunggu timer
  });

  it("applyPreset membatalkan pending: flush basi tidak menimpa preset", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(0, 9); // pending
    store.getState().applyPreset("flat");
    expect(gainAt(store, 0)).toBe(0);
    jest.advanceTimersByTime(500);
    expect(gainAt(store, 0)).toBe(0); // tetap flat, bukan 9
    expect(store.getState().activePresetId).toBe("flat");
  });
});
