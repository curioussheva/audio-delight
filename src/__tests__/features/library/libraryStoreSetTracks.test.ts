// src/__tests__/features/library/libraryStoreSetTracks.test.ts
//
// Item 2 — spike completion scan: `setTracks` dengan daftar yang isinya
// SAMA PERSIS tidak boleh memberitahu subscriber (nol re-render, nol
// tulis persist); daftar yang BERUBAH memberitahu SEKALI dan memakai
// kembali referensi objek lama untuk lagu yang tidak berubah.
//
// Harness mengikuti libraryStoreAutoEnriching.test.ts: resetModules per
// test supaya tiap test mendapat instance store segar + storage
// AsyncStorage yang bisa di-seed lebih dulu.

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

async function loadStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLibraryStore } = require("@/features/library/store/libraryStore");
  await useLibraryStore.persist.rehydrate();
  return useLibraryStore;
}

const track = (over: Record<string, unknown> = {}) => ({
  id: "1",
  uri: "content://media/1",
  filename: "lagu.mp3",
  title: "Judul",
  artist: "Artis",
  album: "Album",
  genre: "Pop",
  duration: 180,
  codec: "MP3",
  sampleRate: 44100,
  bitDepth: 16,
  folder: "Music",
  dateAdded: 1700000000000,
  playCount: 0,
  isFavorite: false,
  isEnriched: false,
  lastSeenAt: 1700000000000,
  ...over,
});

describe("libraryStore.setTracks — Item 2", () => {
  beforeEach(() => {
    backing.clear();
    jest.clearAllMocks();
  });

  it("daftar segar isi sama -> subscriber TIDAK diberitahu, identitas array dipertahankan", async () => {
    const store = await loadStore();
    const first = [track({ id: "1" }), track({ id: "2", title: "Dua" })];
    store.getState().setTracks(first);
    const shown = store.getState().tracks;

    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    // Daftar "segar" dari SQLite: objek BARU semua, isi sama persis.
    store.getState().setTracks([
      track({ id: "1" }),
      track({ id: "2", title: "Dua" }),
    ]);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().tracks).toBe(shown);
    unsub();
  });

  it("set ganda berurutan isi sama (refreshLibrary + reload) -> hanya SATU notifikasi", async () => {
    const store = await loadStore();
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    store.getState().setTracks([track({ id: "1" })]);
    expect(listener).toHaveBeenCalledTimes(1);
    // Set kedua = reload() membaca DB yang sama.
    store.getState().setTracks([track({ id: "1" })]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("lagu baru -> SATU notifikasi, lagu lama referensinya dipakai ulang, unenrichedCount benar", async () => {
    const store = await loadStore();
    store.getState().setTracks([
      track({ id: "1", isEnriched: true }),
      track({ id: "2", isEnriched: false }),
    ]);
    const before = store.getState().tracks;
    expect(store.getState().unenrichedCount).toBe(1);

    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    store.getState().setTracks([
      track({ id: "1", isEnriched: true }),
      track({ id: "2", isEnriched: false }),
      track({ id: "3", isEnriched: false }),
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    const after = store.getState().tracks;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2].id).toBe("3");
    expect(store.getState().unenrichedCount).toBe(2);
    unsub();
  });

  it("daftar segar isi sama -> persist TIDAK menulis AsyncStorage", async () => {
    const store = await loadStore();
    // Instance mock yang sama dengan yang dipakai store (require sesudah
    // resetModules di loadStore). setItem persist dipanggil lewat
    // `.then` (microtask) — flush dulu sebelum menghitung.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require("@react-native-async-storage/async-storage")
      .default;
    const setItem = AsyncStorage.setItem as jest.Mock;
    const flush = () => new Promise((r) => setTimeout(r, 0));
    store.getState().setTracks([track({ id: "1" })]);
    await flush();
    const writesAfterFirst = setItem.mock.calls.length;
    expect(writesAfterFirst).toBeGreaterThan(0); // sanity: berubah -> persist menulis
    store.getState().setTracks([track({ id: "1" })]); // isi sama
    await flush();
    expect(setItem.mock.calls.length).toBe(writesAfterFirst);
  });

  it("daftar kosong -> setTracks([]) tetap mengosongkan (bukan dilewat)", async () => {
    const store = await loadStore();
    store.getState().setTracks([track({ id: "1" })]);
    expect(store.getState().tracks).toHaveLength(1);
    store.getState().setTracks([]);
    expect(store.getState().tracks).toHaveLength(0);
    expect(store.getState().unenrichedCount).toBe(0);
  });
});
