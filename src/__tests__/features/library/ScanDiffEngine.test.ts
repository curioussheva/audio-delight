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
    deleteSongsByUris: jest.fn(),
    saveToDatabase: jest.fn(),
  },
}));
jest.mock("@/features/library/api/metadata", () => ({}));
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: { getState: jest.fn() },
}));
jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn() },
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
import { db } from "@/shared/lib/sqlite";

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

  beforeEach(() => {
    jest.clearAllMocks();
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
});

describe("runMediaStoreDiff — N6: hapus sesudah tulis commit", () => {
  const queryAudioFiles = MediaStore.queryAudioFiles as jest.Mock;
  const getExistingUris = LibraryScanner.getExistingUris as jest.Mock;
  const getSongByUri = LibraryScanner.getSongByUri as jest.Mock;
  const deleteSongsByUris = LibraryScanner.deleteSongsByUris as jest.Mock;
  const saveToDatabase = LibraryScanner.saveToDatabase as jest.Mock;
  const dbExecute = db.execute as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getSongByUri.mockReturnValue(undefined);
  });

  it("REGRESI: deleteSongsByUris jalan SESUDAH COMMIT transaksi tulis", async () => {
    const order: string[] = [];
    dbExecute.mockImplementation((sql: string) => {
      order.push(sql);
    });
    deleteSongsByUris.mockImplementation(async () => {
      order.push("DELETE");
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    const result = await ScanDiffEngine.runMediaStoreDiff();

    expect(result.newCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(order).toContain("COMMIT");
    expect(order).toContain("DELETE");
    expect(order.indexOf("COMMIT")).toBeLessThan(order.indexOf("DELETE"));
  });

  it("REGRESI: cancel di tengah tulis — tulisan tetap commit, hapus tidak jalan", async () => {
    const controller = new AbortController();
    saveToDatabase.mockImplementation(async () => {
      controller.abort();
    });
    queryAudioFiles.mockResolvedValue([song("baru"), song("lama")]);
    getExistingUris.mockReturnValue(new Set(["lama", "hapus"]));

    await expect(
      ScanDiffEngine.runMediaStoreDiff(undefined, controller.signal),
    ).rejects.toBeInstanceOf(ScanAbortedError);
    // Tulis sudah commit sebelum checkpoint hapus; penghapusan tidak
    // pernah jalan mendahului tulisan yang belum pasti (N6).
    expect(dbExecute).toHaveBeenCalledWith("COMMIT");
    expect(deleteSongsByUris).not.toHaveBeenCalled();
  });
});
