// src/__tests__/features/player/artworkDisplayStore.test.ts
//
// Store tampilan sampul (2026-11-20): default contain, persist kunci
// sendiri. Store tidak mengimpor spec native — hanya AsyncStorage yang
// di-mock di sini, mengikuti pola hrtfStore.test.ts.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/player/store/artworkDisplayStore")
    .useArtworkDisplayStore as typeof import("@/features/player/store/artworkDisplayStore").useArtworkDisplayStore;
};

describe("artworkDisplayStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default contain — sampul tampil utuh (keputusan csheva 2026-11-20)", () => {
    const store = loadStore();
    expect(store.getState().artworkFit).toBe("contain");
  });

  it("setArtworkFit('cover') menyimpan pilihan; kembali ke 'contain' bisa", () => {
    const store = loadStore();
    store.getState().setArtworkFit("cover");
    expect(store.getState().artworkFit).toBe("cover");
    store.getState().setArtworkFit("contain");
    expect(store.getState().artworkFit).toBe("contain");
  });

  it("hanya artworkFit yang dipersist (fungsi tidak ikut disimpan)", async () => {
    const store = loadStore();
    // WAJIB sesudah loadStore: loadStore me-reset module registry, jadi
    // mock AsyncStorage yang dipakai store adalah instance BARU — require
    // sebelum loadStore menangkap instance lama yang tidak pernah ditulis.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    store.getState().setArtworkFit("cover");
    // Tulis persist berjalan async (rantai promise zustand) — satu
    // microtask tidak cukup; beri jeda timer singkat.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const written = (AsyncStorage.setItem as jest.Mock).mock.calls;
    expect(written.length).toBeGreaterThan(0);
    const lastValue = JSON.parse(
      written[written.length - 1][1] as string,
    ) as { state: { artworkFit: string } };
    expect(lastValue.state.artworkFit).toBe("cover");
    expect(Object.keys(lastValue.state)).toEqual(["artworkFit"]);
  });
});
