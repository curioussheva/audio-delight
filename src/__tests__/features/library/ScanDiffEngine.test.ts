/**
 * ScanDiffEngine mengimpor modul native (MediaStore) dan store yang menyeret
 * zustand + AsyncStorage. Di sini yang diuji adalah logika diff murni dan
 * pengaman penghapusan - keduanya tidak menyentuh native.
 */
jest.mock("@/features/library/native/MediaStoreModule", () => ({
  MediaStore: { queryAudioFiles: jest.fn() },
}));
jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: {
    getExistingUris: jest.fn(),
    getSongByUri: jest.fn(),
    getFileSizeByUri: jest.fn(),
    deleteSongsByUris: jest.fn(),
    saveToDatabase: jest.fn(),
    // Jalur tulis batch (opsi B): satu panggilan executeBatch per fase
    // tulis — ganti loop saveToDatabase per lagu + BEGIN/COMMIT.
    saveSongsBatched: jest.fn(),
  },
}));
jest.mock("@/features/library/api/metadata", () => ({}));
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: { getState: jest.fn() },
}));

import {
  computeDiff,
  isDeletionPlausible,
  ScanAbortedError,
  ScanDiffEngine,
  SAFE_DELETE_RATIO,
  SAFE_DELETE_MIN_COUNT,
} from "../../../features/library/services/ScanDiffEngine";
import type { NativeSong } from "@/features/library/native/MediaStoreModule";
import { MediaStore } from "@/features/library/native/MediaStoreModule";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";

const song = (uri: string, fileSize = 1000): NativeSong =>
  ({ id: uri, uri, fileSize }) as NativeSong;

describe("isDeletionPlausible - pengaman library", () => {
  // INI BUG TERBURUK YANG DICEGAH: MediaStore gagal -> query mengembalikan
  // array kosong -> diff menyimpulkan SELURUH library terhapus.
  it("REGRESI: tolak hapus massal saat MediaStore melaporkan nol file", () => {
    // 1196 lagu di database, device melaporkan 0 file
    expect(isDeletionPlausible(1196, 1196, 0)).toBe(false);
  });

  it("tolak hapus massal walau device melaporkan beberapa file", () => {
    // 1000 di database, 900 ingin dihapus, tapi hanya 100 terdeteksi
    expect(isDeletionPlausible(1000, 900, 100)).toBe(false);
  });

  it("izinkan hapus sebagian kecil (device melaporkan sisa)", () => {
    expect(isDeletionPlausible(1000, 100, 900)).toBe(true);
  });

  it("izinkan hapus < SAFE_DELETE_MIN_COUNT walau device melaporkan nol", () => {
    // Menghapus 3 lagu terakhir dari folder lalu device kosong: wajar
    expect(isDeletionPlausible(3, 3, 0)).toBe(true);
    expect(SAFE_DELETE_MIN_COUNT).toBeGreaterThan(3);
  });

  it("tepat di ambang bawah: 5 lagu, device nol -> ditolak", () => {
    expect(isDeletionPlausible(5, 5, 0)).toBe(false);
  });

  it("tepat di rasio 50% dengan sisa terdeteksi -> diizinkan", () => {
    expect(isDeletionPlausible(100, 50, 50)).toBe(true);
    expect(SAFE_DELETE_RATIO).toBe(0.5);
  });

  it("sedikit di atas rasio 50% dengan sisa kecil -> ditolak", () => {
    expect(isDeletionPlausible(100, 60, 40)).toBe(false);
  });

  it("database kosong: tidak ada yang perlu dihapus", () => {
    expect(isDeletionPlausible(0, 0, 0)).toBe(true);
  });

  it("tidak ada yang dihapus -> selalu aman", () => {
    expect(isDeletionPlausible(1000, 0, 1000)).toBe(true);
  });
});

describe("computeDiff", () => {
  const noSizes = () => undefined;

  it("deteksi lagu baru", () => {
    const r = computeDiff(
      [song("a"), song("b")],
      new Set(["a"]),
      noSizes,
    );
    expect(r.newSongs.map((s) => s.uri)).toEqual(["b"]);
    expect(r.deletedUris).toEqual([]);
  });

  it("deteksi lagu terhapus", () => {
    const r = computeDiff([song("a")], new Set(["a", "b", "c"]), noSizes);
    expect(r.deletedUris.sort()).toEqual(["b", "c"]);
  });

  it("deteksi lagu berubah via fileSize berbeda", () => {
    const r = computeDiff(
      [song("a", 2000)],
      new Set(["a"]),
      () => 1000, // ukuran lama di DB
    );
    expect(r.updatedSongs.map((s) => s.uri)).toEqual(["a"]);
    expect(r.newSongs).toEqual([]);
  });

  it("fileSize sama berarti tidak ada perubahan", () => {
    const r = computeDiff([song("a", 1000)], new Set(["a"]), () => 1000);
    expect(r.updatedSongs).toEqual([]);
  });

  it("ukuran tidak diketahui -> tidak dianggap berubah", () => {
    // getSongByUri mengembalikan null -> fileSize undefined
    const r = computeDiff([song("a", 2000)], new Set(["a"]), noSizes);
    expect(r.updatedSongs).toEqual([]);
  });

  it("abaikan lagu tanpa uri", () => {
    const tanpaUri = { id: "x", fileSize: 1 } as NativeSong;
    const r = computeDiff([tanpaUri, song("a")], new Set(), noSizes);
    expect(r.newSongs.map((s) => s.uri)).toEqual(["a"]);
  });

  it("MediaStore kosong -> semua yang di DB jadi kandidat hapus", () => {
    // computeDiff sendiri melaporkan ini apa adanya; pengaman yang memutuskan
    const r = computeDiff([], new Set(["a", "b"]), noSizes);
    expect(r.deletedUris.sort()).toEqual(["a", "b"]);
  });

  it("tidak ada perubahan sama sekali", () => {
    const r = computeDiff([song("a")], new Set(["a"]), () => 1000);
    expect(r).toEqual({ newSongs: [], updatedSongs: [], deletedUris: [] });
  });
});

describe("quickDiff — J3-1: tidak bisa menggantikan refresh library", () => {
  const getState = useLibraryStore.getState as jest.Mock;
  const queryAudioFiles = MediaStore.queryAudioFiles as jest.Mock;
  const getExistingUris = LibraryScanner.getExistingUris as jest.Mock;
  const getFileSizeByUri = LibraryScanner.getFileSizeByUri as jest.Mock;
  const saveSongsBatched = LibraryScanner.saveSongsBatched as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // J2-2: ukuran file dibaca satu query; default: tidak ada ukuran
    // tercatat (lagu yang sudah ada tidak ditandai berubah).
    getFileSizeByUri.mockReturnValue(new Map());
    // Jalur tulis batch: default sukses (0 tulis bila tidak ada perubahan
    // — pemanggil hanya peduli tidak throw).
    saveSongsBatched.mockResolvedValue({
      inserted: 0,
      updated: 0,
      skipped: 0,
    });
  });

  it("REGRESI: Auto Discovery mati (default OFF) -> hasil kosong TANPA menyentuh MediaStore", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: false });
    const result = await ScanDiffEngine.quickDiff();
    expect(result).toEqual({
      newCount: 0,
      deletedCount: 0,
      updatedCount: 0,
      totalScanned: 0,
      newSongs: [],
      updatedSongs: [],
      deletedUris: [],
    });
    // Bukti early-return sebelum getNativeSongs(): tidak ada query sama sekali.
    expect(queryAudioFiles).not.toHaveBeenCalled();
  });

  it("S1 + scan-split: bypassAutoScanGate=true -> jalan walau idle OFF (scan perdana; gerbang awal diperiksa pemanggil, bukan quickDiff)", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: false });
    queryAudioFiles.mockResolvedValue([song("a")]);
    getExistingUris.mockReturnValue(new Set<string>());

    const result = await ScanDiffEngine.quickDiff(undefined, {
      bypassAutoScanGate: true,
    });

    expect(queryAudioFiles).toHaveBeenCalledTimes(1);
    expect(result.newCount).toBe(1);
    expect(result.totalScanned).toBe(1);
    expect(result.newSongs.map((s) => s.uri)).toEqual(["a"]);
  });

  it("Auto Discovery ON -> jalan tanpa bypass (jalur resume/autoScan tidak berubah)", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: true });
    queryAudioFiles.mockResolvedValue([]);
    getExistingUris.mockReturnValue(new Set<string>());

    const result = await ScanDiffEngine.quickDiff();

    expect(queryAudioFiles).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      newCount: 0,
      deletedCount: 0,
      updatedCount: 0,
      totalScanned: 0,
      newSongs: [],
      updatedSongs: [],
      deletedUris: [],
    });
  });

  it("N16: galat query MediaStore DILEMPAR, bukan hasil kosong (\"0 perubahan\" palsu)", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: true });
    queryAudioFiles.mockRejectedValue(new Error("provider error"));

    await expect(ScanDiffEngine.quickDiff()).rejects.toThrow(
      "provider error",
    );
  });

  it("N16: hapus gagal sesudah tulis commit -> lagu baru tetap dilaporkan (deletedCount 0), supaya diantre enrichment", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: true });
    const deleteSongsByUris = LibraryScanner.deleteSongsByUris as jest.Mock;
    deleteSongsByUris.mockRejectedValue(new Error("delete gagal"));
    saveSongsBatched.mockResolvedValue({
      inserted: 1,
      updated: 0,
      skipped: 0,
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    const result = await ScanDiffEngine.quickDiff();

    expect(result.newCount).toBe(1);
    expect(result.newSongs.map((s) => s.uri)).toEqual(["baru"]);
    expect(result.deletedCount).toBe(0);
    expect(result.deletedUris).toEqual([]);
    expect(deleteSongsByUris).toHaveBeenCalledTimes(1);
  });

  it("J2-2: ukuran file dibaca SATU query (getFileSizeByUri), bukan satu getSongByUri per lagu", async () => {
    getState.mockReturnValue({ isAutoScanEnabled: true });
    const getSongByUri = LibraryScanner.getSongByUri as jest.Mock;
    saveSongsBatched.mockResolvedValue({
      inserted: 0,
      updated: 1,
      skipped: 0,
    });
    getFileSizeByUri.mockReturnValue(new Map([["lama", 1000]]));
    queryAudioFiles.mockResolvedValue([song("lama", 2000)]);
    getExistingUris.mockReturnValue(new Set(["lama"]));

    const result = await ScanDiffEngine.quickDiff();

    // Ukuran berubah 1000 -> 2000: terdeteksi sebagai updated.
    expect(result.updatedCount).toBe(1);
    expect(result.updatedSongs.map((s) => s.uri)).toEqual(["lama"]);
    expect(getFileSizeByUri).toHaveBeenCalledTimes(1);
    expect(getSongByUri).not.toHaveBeenCalled();
  });
});

describe("runMediaStoreDiff — N6: hapus sesudah tulis commit", () => {
  const queryAudioFiles = MediaStore.queryAudioFiles as jest.Mock;
  const getExistingUris = LibraryScanner.getExistingUris as jest.Mock;
  const getFileSizeByUri = LibraryScanner.getFileSizeByUri as jest.Mock;
  const deleteSongsByUris = LibraryScanner.deleteSongsByUris as jest.Mock;
  const saveSongsBatched = LibraryScanner.saveSongsBatched as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // J2-2: ukuran file dibaca satu query; default: tidak ada ukuran
    // tercatat (lagu yang sudah ada tidak ditandai berubah).
    getFileSizeByUri.mockReturnValue(new Map());
    // Jalur tulis batch: default sukses.
    saveSongsBatched.mockResolvedValue({
      inserted: 0,
      updated: 0,
      skipped: 0,
    });
  });

  it("REGRESI: deleteSongsByUris jalan SESUDAH tulis batch commit", async () => {
    const order: string[] = [];
    saveSongsBatched.mockImplementation(async () => {
      order.push("BATCH");
      return { inserted: 1, updated: 0, skipped: 0 };
    });
    deleteSongsByUris.mockImplementation(async () => {
      order.push("DELETE");
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    const result = await ScanDiffEngine.runMediaStoreDiff();

    expect(result.newCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    // Batch (transaksi native-nya) selesai dulu, baru hapus jalan —
    // dulu dibuktikan lewat string "COMMIT" di db.execute; kini commit
    // ada di dalam executeBatch (native), jadi urutan dibuktikan lewat
    // resolve-nya saveSongsBatched.
    expect(order).toEqual(["BATCH", "DELETE"]);
  });

  it("REGRESI: cancel di tengah tulis — tulisan tetap commit, hapus tidak jalan", async () => {
    const controller = new AbortController();
    // Abort datang saat batch sedang jalan (jendela sinkron yang tak
    // bisa diobservasi di tengah): batch commit, lalu checkpoint
    // sebelum hapus melempar — sama seperti dulu (tulis commit di
    // loop, abort baru ketahuan di checkpoint hapus).
    saveSongsBatched.mockImplementation(async () => {
      controller.abort();
      return { inserted: 1, updated: 0, skipped: 0 };
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    await expect(
      ScanDiffEngine.runMediaStoreDiff(undefined, controller.signal),
    ).rejects.toBeInstanceOf(ScanAbortedError);
    // Tulis sudah commit sebelum checkpoint hapus; penghapusan tidak
    // pernah jalan mendahului tulisan yang belum pasti (N6).
    expect(saveSongsBatched).toHaveBeenCalledTimes(1);
    expect(deleteSongsByUris).not.toHaveBeenCalled();
  });

  it("REGRESI: abort sebelum batch — tidak ada yang tertulis, hapus tidak jalan", async () => {
    const controller = new AbortController();
    controller.abort();
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    await expect(
      ScanDiffEngine.runMediaStoreDiff(undefined, controller.signal),
    ).rejects.toBeInstanceOf(ScanAbortedError);
    // abortCheck sebelum batch melempar: batch tidak pernah dipanggil.
    expect(saveSongsBatched).not.toHaveBeenCalled();
    expect(deleteSongsByUris).not.toHaveBeenCalled();
  });

  it("N16 (saudara jalur manual): hapus gagal sesudah tulis commit -> lagu baru tetap dilaporkan (deletedCount 0), supaya diantre enrichment", async () => {
    deleteSongsByUris.mockRejectedValue(new Error("delete gagal"));
    saveSongsBatched.mockResolvedValue({
      inserted: 1,
      updated: 0,
      skipped: 0,
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    const result = await ScanDiffEngine.runMediaStoreDiff();

    expect(result.newCount).toBe(1);
    expect(result.newSongs.map((s) => s.uri)).toEqual(["baru"]);
    expect(result.deletedCount).toBe(0);
    expect(result.deletedUris).toEqual([]);
    expect(deleteSongsByUris).toHaveBeenCalledTimes(1);
  });
});
