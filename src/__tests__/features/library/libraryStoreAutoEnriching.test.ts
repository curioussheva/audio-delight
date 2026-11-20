// src/__tests__/features/library/libraryStoreAutoEnriching.test.ts
//
// Auto Enriching default OFF (keputusan csheva 2026-11-20):
// - fresh install -> isAutoEnrichingEnabled === false
// - instalasi lama (persist v1, tersimpan ON) -> migrasi v1→v2 memaksa OFF
// - yang sudah OFF eksplisit tetap OFF; yang ON di v2 (user menyalakan
//   sesudah perubahan) TIDAK ikut dimigrasi — tetap ON.
//
// Harness mengikuti brainwaveStore.test.ts: resetModules per test supaya
// tiap test mendapat instance store segar + storage AsyncStorage yang
// bisa di-seed lebih dulu.

const backing = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => backing.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      backing.delete(key);
    }),
  },
}));

jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: {},
}));

const STORAGE_KEY = "@pristineaudio/library";

function seedStoredState(state: Record<string, unknown>, version: number) {
  backing.set(STORAGE_KEY, JSON.stringify({ state, version }));
}

async function loadStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLibraryStore } = require("@/features/library/store/libraryStore");
  // Rehydrate eksplisit: tanpa ini, state awal (default kode) yang
  // terbaca — migrasi hanya jalan saat rehydrate membaca storage.
  await useLibraryStore.persist.rehydrate();
  return useLibraryStore;
}

describe("libraryStore — Auto Enriching default OFF", () => {
  beforeEach(() => {
    backing.clear();
    jest.clearAllMocks();
  });

  it("fresh install (storage kosong) -> default OFF", async () => {
    const store = await loadStore();
    expect(store.getState().isAutoEnrichingEnabled).toBe(false);
  });

  it("migrasi v1→v2: tersimpan ON di v1 -> OFF sesudah rehydrate", async () => {
    seedStoredState(
      {
        isAutoEnrichingEnabled: true,
        isAutoScanEnabled: false,
        hasCompletedInitialScan: true,
        lastScanAt: 123,
        lastEnrichmentAt: null,
        unenrichedCount: 5,
      },
      1,
    );
    const store = await loadStore();
    expect(store.getState().isAutoEnrichingEnabled).toBe(false);
  });

  it("migrasi v1→v2: tersimpan OFF di v1 -> tetap OFF", async () => {
    seedStoredState(
      {
        isAutoEnrichingEnabled: false,
        isAutoScanEnabled: false,
        hasCompletedInitialScan: true,
      },
      1,
    );
    const store = await loadStore();
    expect(store.getState().isAutoEnrichingEnabled).toBe(false);
  });

  it("migrasi v1→v2: kunci lain dipertahankan, `tracks` lama tetap dibuang", async () => {
    seedStoredState(
      {
        isAutoEnrichingEnabled: true,
        isAutoScanEnabled: false,
        hasCompletedInitialScan: true,
        unenrichedCount: 7,
        tracks: [{ id: "basi", uri: "content://basi" }],
      },
      1,
    );
    const store = await loadStore();
    const state = store.getState();
    expect(state.isAutoEnrichingEnabled).toBe(false);
    expect(state.hasCompletedInitialScan).toBe(true);
    expect(state.unenrichedCount).toBe(7);
    expect(state.tracks).toEqual([]);
  });

  it("v2 tersimpan ON (user menyalakan sesudah perubahan) -> tetap ON", async () => {
    seedStoredState(
      {
        isAutoEnrichingEnabled: true,
        isAutoScanEnabled: false,
        hasCompletedInitialScan: true,
      },
      2,
    );
    const store = await loadStore();
    expect(store.getState().isAutoEnrichingEnabled).toBe(true);
  });

  it("toggle tetap bekerja bolak-balik dari default OFF", async () => {
    const store = await loadStore();
    expect(store.getState().isAutoEnrichingEnabled).toBe(false);
    store.getState().toggleAutoEnrichingEnabled();
    expect(store.getState().isAutoEnrichingEnabled).toBe(true);
    store.getState().toggleAutoEnrichingEnabled();
    expect(store.getState().isAutoEnrichingEnabled).toBe(false);
  });
});
