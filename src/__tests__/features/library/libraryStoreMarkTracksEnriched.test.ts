// src/__tests__/features/library/libraryStoreMarkTracksEnriched.test.ts
//
// LIB-49/SCR-3 (b): `markTracksEnriched` — satu set() untuk N lagu.
// markAsEnriched per lagu mengganti identitas array `tracks` tiap item
// (layar Library re-render penuh + memo turunan O(n) per lagu);
// batch N=5 dari MetadataEnricher harus memberitahu subscriber SEKALI.
//
// Harness mengikuti libraryStoreSetTracks.test.ts: resetModules per test
// supaya tiap test mendapat instance store segar + storage AsyncStorage
// yang bisa di-seed lebih dulu.

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

describe("libraryStore.markTracksEnriched — LIB-49/SCR-3 (b)", () => {
  beforeEach(() => {
    backing.clear();
    jest.clearAllMocks();
  });

  it("3 update -> SATU notifikasi, ketiganya enriched, unenrichedCount benar", async () => {
    const useLibraryStore = await loadStore();
    useLibraryStore.getState().setTracks([
      track({ id: "1" }),
      track({ id: "2", uri: "content://media/2" }),
      track({ id: "3", uri: "content://media/3" }),
      track({ id: "4", uri: "content://media/4" }),
    ]);
    const listener = jest.fn();
    const unsub = useLibraryStore.subscribe(listener);
    listener.mockClear();

    useLibraryStore.getState().markTracksEnriched([
      { trackId: "1", metadata: { artist: "Artis Baru" } },
      { trackId: "2", metadata: {} },
      { trackId: "3", metadata: { title: "Judul Baru" } },
    ]);
    unsub();

    expect(listener).toHaveBeenCalledTimes(1);
    const state = useLibraryStore.getState();
    expect(state.tracks.filter((t: any) => t.isEnriched)).toHaveLength(3);
    expect(state.tracks.find((t: any) => t.id === "1").artist).toBe(
      "Artis Baru",
    );
    expect(state.tracks.find((t: any) => t.id === "3").title).toBe(
      "Judul Baru",
    );
    expect(state.tracks.find((t: any) => t.id === "4").isEnriched).toBe(
      false,
    );
    expect(state.unenrichedCount).toBe(1);
    // Lagu yang tidak berubah mempertahankan referensi objek.
    expect(state.tracks.find((t: any) => t.id === "4")).toBe(
      useLibraryStore.getState().tracks.find((t: any) => t.id === "4"),
    );
  });

  it("batch berisi id tak dikenal -> subscriber TIDAK diberitahu", async () => {
    const useLibraryStore = await loadStore();
    useLibraryStore.getState().setTracks([track({ id: "1" })]);
    const listener = jest.fn();
    const unsub = useLibraryStore.subscribe(listener);
    listener.mockClear();

    useLibraryStore.getState().markTracksEnriched([
      { trackId: "999", metadata: {} },
    ]);
    unsub();

    expect(listener).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().unenrichedCount).toBe(1);
  });

  it("markAsEnriched 1 item tetap jalan (API lama dipertahankan)", async () => {
    const useLibraryStore = await loadStore();
    useLibraryStore.getState().setTracks([track({ id: "1" })]);
    const listener = jest.fn();
    const unsub = useLibraryStore.subscribe(listener);
    listener.mockClear();

    useLibraryStore.getState().markAsEnriched("1", { artist: "X" });
    unsub();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().tracks[0].isEnriched).toBe(true);
    expect(useLibraryStore.getState().tracks[0].artist).toBe("X");
  });
});
