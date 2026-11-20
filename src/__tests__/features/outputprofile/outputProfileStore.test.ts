// src/__tests__/features/outputprofile/outputProfileStore.test.ts
//
// Store Profil per Output: kunci persist sendiri, default OFF, pemetaan
// default, ubah per kategori, reset. Pola crossfadeStore.test.ts (mock
// AsyncStorage; store ini tidak mengimpor native).

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
  return require("@/features/outputprofile/store/outputProfileStore")
    .useOutputProfileStore as typeof import("@/features/outputprofile/store/outputProfileStore").useOutputProfileStore;
};

describe("outputProfileStore", () => {
  it("default OFF + speaker -> Flat, sisanya tanpa perubahan", () => {
    const store = loadStore();
    const state = store.getState();
    expect(state.enabled).toBe(false);
    expect(state.mapping).toEqual({
      wired: null,
      usb: null,
      bluetooth: null,
      speaker: "flat",
      line_out: null,
    });
  });

  it("setEnabled(true) menyalakan fitur", () => {
    const store = loadStore();
    store.getState().setEnabled(true);
    expect(store.getState().enabled).toBe(true);
    store.getState().setEnabled(false);
    expect(store.getState().enabled).toBe(false);
  });

  it("setProfileForCategory menyimpan preset per kategori tanpa menyentuh yang lain", () => {
    const store = loadStore();
    store.getState().setProfileForCategory("wired", "clarity");
    store.getState().setProfileForCategory("bluetooth", "bass-boost");
    expect(store.getState().mapping).toEqual({
      wired: "clarity",
      usb: null,
      bluetooth: "bass-boost",
      speaker: "flat",
      line_out: null,
    });
  });

  it("setProfileForCategory(null) = tanpa perubahan untuk kategori itu", () => {
    const store = loadStore();
    store.getState().setProfileForCategory("speaker", null);
    expect(store.getState().mapping.speaker).toBeNull();
    expect(store.getState().mapping.wired).toBeNull();
  });

  it("resetToDefaults mengembalikan pemetaan default (enabled tidak berubah)", () => {
    const store = loadStore();
    store.getState().setEnabled(true);
    store.getState().setProfileForCategory("wired", "rock");
    store.getState().setProfileForCategory("speaker", null);
    store.getState().resetToDefaults();
    expect(store.getState().mapping).toEqual({
      wired: null,
      usb: null,
      bluetooth: null,
      speaker: "flat",
      line_out: null,
    });
    expect(store.getState().enabled).toBe(true);
  });
});
