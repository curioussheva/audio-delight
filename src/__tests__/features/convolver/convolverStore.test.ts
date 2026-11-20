// src/__tests__/features/convolver/convolverStore.test.ts
//
// Store convolver (2026-11-20): kunci persist sendiri, dorongan ke
// native lewat spec, file IR lewat DocumentPicker + FileSystem.
// Ketiganya di-mock di sini — yang diuji hanya logika store-nya.

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockSetConvolverEnabled = jest.fn(
  async (_enabled: boolean, _sessionId: number) => true,
);
const mockLoadConvolverIr = jest.fn(async (_path: string) => 0);
const mockClearConvolverIr = jest.fn(async () => true);
const mockGetConvolverIrInfo = jest.fn(async () => ({
  loaded: true,
  sampleRateHz: 48000,
  taps: 48000,
  durationMs: 1000,
}));
const mockCreateAudioSession = jest.fn(async () => ({
  sessionId: 7,
  isNew: false,
}));

jest.mock("@/specs/NativeDSPModule", () => ({
  __esModule: true,
  default: {
    createAudioSession: mockCreateAudioSession,
    setConvolverEnabled: mockSetConvolverEnabled,
    loadConvolverIr: mockLoadConvolverIr,
    clearConvolverIr: mockClearConvolverIr,
    getConvolverIrInfo: mockGetConvolverIrInfo,
  },
  ConvolverIrStatus: {
    Ok: 0,
    FileError: 1,
    FormatError: 2,
    TooLong: 3,
    Silent: 4,
    RateError: 5,
  },
}));

const mockGetDocumentAsync = jest.fn(async () => ({
  canceled: true,
  assets: [],
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: mockGetDocumentAsync,
}));

const mockCopyAsync = jest.fn(async () => {});
const mockDeleteAsync = jest.fn(async () => {});
const mockMakeDirectoryAsync = jest.fn(async () => {});
const mockGetInfoAsync = jest.fn(async () => ({ exists: false }));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  cacheDirectory: "file:///cache/",
  getInfoAsync: mockGetInfoAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  copyAsync: mockCopyAsync,
  deleteAsync: mockDeleteAsync,
}));

// Muat ulang modul store per test supaya state persist selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/convolver/store/convolverStore")
    .useConvolverStore as typeof import("@/features/convolver/store/convolverStore").useConvolverStore;
};

const pickedFile = {
  canceled: false,
  assets: [{ uri: "file:///cache/abc.wav", name: "Hall Besar.wav" }],
};

describe("convolverStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocumentAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });
    mockLoadConvolverIr.mockResolvedValue(0);
    mockGetConvolverIrInfo.mockResolvedValue({
      loaded: true,
      sampleRateHz: 48000,
      taps: 48000,
      durationMs: 1000,
    });
  });

  it("default OFF, tanpa IR", () => {
    const store = loadStore();
    expect(store.getState().isConvolverEnabled).toBe(false);
    expect(store.getState().ir).toBeNull();
  });

  it("setConvolverEnabled(true) menyimpan state + mendorong ke native dengan sessionId", async () => {
    const store = loadStore();
    await store.getState().setConvolverEnabled(true);
    expect(store.getState().isConvolverEnabled).toBe(true);
    expect(mockCreateAudioSession).toHaveBeenCalled();
    expect(mockSetConvolverEnabled).toHaveBeenCalledWith(true, 7);
  });

  it("loadIr dibatalkan user -> ok=false + canceled, native tidak dipanggil", async () => {
    const store = loadStore();
    const result = await store.getState().loadIr();
    expect(result).toEqual({ ok: false, canceled: true });
    expect(mockLoadConvolverIr).not.toHaveBeenCalled();
    expect(store.getState().ir).toBeNull();
  });

  it("loadIr sukses -> salin persisten + load native + meta tersimpan", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);

    const result = await store.getState().loadIr();

    expect(result).toEqual({ ok: true });
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: "file:///cache/abc.wav",
      to: "file:///doc/convolver/Hall Besar.wav",
    });
    expect(mockLoadConvolverIr).toHaveBeenCalledWith(
      "file:///doc/convolver/Hall Besar.wav",
    );
    expect(store.getState().ir).toEqual({
      name: "Hall Besar.wav",
      path: "file:///doc/convolver/Hall Besar.wav",
      sampleRateHz: 48000,
      taps: 48000,
      durationMs: 1000,
    });
    expect(store.getState().lastError).toBeNull();
  });

  it("loadIr ditolak native (FormatError) -> error Indonesia + file salinan dihapus + IR tetap null", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    mockLoadConvolverIr.mockResolvedValue(2);

    const result = await store.getState().loadIr();

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "Bukan file WAV yang didukung (PCM/float 8/16/24/32-bit, mono/stereo).",
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      "file:///doc/convolver/Hall Besar.wav",
      { idempotent: true },
    );
    expect(store.getState().ir).toBeNull();
    expect(store.getState().lastError).toBe(result.error);
  });

  it("loadIr TooLong -> pesan maks ~2 detik", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    mockLoadConvolverIr.mockResolvedValue(3);

    const result = await store.getState().loadIr();

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "IR terlalu panjang — maks ~2 detik sesudah resample ke laju stream.",
    );
  });

  it("clearIr -> native clear + hapus file + state null (toggle tidak diubah)", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    await store.getState().loadIr();
    await store.getState().setConvolverEnabled(true);

    await store.getState().clearIr();

    expect(mockClearConvolverIr).toHaveBeenCalled();
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      "file:///doc/convolver/Hall Besar.wav",
      { idempotent: true },
    );
    expect(store.getState().ir).toBeNull();
    expect(store.getState().isConvolverEnabled).toBe(true);
  });

  it("restoreToNative dengan IR -> load ulang dari path + dorong toggle", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    await store.getState().loadIr();
    await store.getState().setConvolverEnabled(true);
    jest.clearAllMocks();

    await store.getState().restoreToNative();

    expect(mockLoadConvolverIr).toHaveBeenCalledWith(
      "file:///doc/convolver/Hall Besar.wav",
    );
    expect(mockSetConvolverEnabled).toHaveBeenCalledWith(true, 7);
  });

  it("restoreToNative tanpa IR -> hanya toggle yang didorong", async () => {
    const store = loadStore();
    await store.getState().restoreToNative();
    expect(mockLoadConvolverIr).not.toHaveBeenCalled();
    expect(mockSetConvolverEnabled).toHaveBeenCalledWith(false, 7);
  });

  it("restoreToNative load gagal (file hilang) -> IR dibersihkan dari state", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    await store.getState().loadIr();
    mockLoadConvolverIr.mockResolvedValue(1);
    jest.clearAllMocks();

    await store.getState().restoreToNative();

    expect(store.getState().ir).toBeNull();
  });

  it("preloadConvolverIr dengan IR -> load ulang dari path TANPA menyentuh toggle", async () => {
    const store = loadStore();
    mockGetDocumentAsync.mockResolvedValue(pickedFile as any);
    await store.getState().loadIr();
    await store.getState().setConvolverEnabled(true);
    jest.clearAllMocks();

    await store.getState().preloadConvolverIr();

    expect(mockLoadConvolverIr).toHaveBeenCalledWith(
      "file:///doc/convolver/Hall Besar.wav",
    );
    expect(mockSetConvolverEnabled).not.toHaveBeenCalled();
  });

  it("preloadConvolverIr tanpa IR -> no-op", async () => {
    const store = loadStore();
    await store.getState().preloadConvolverIr();
    expect(mockLoadConvolverIr).not.toHaveBeenCalled();
    expect(mockSetConvolverEnabled).not.toHaveBeenCalled();
  });
});
