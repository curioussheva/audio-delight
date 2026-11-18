/**
 * runInitialScan — S1 + fix S2-enqueue: initial scan meneruskan hasil
 * quickDiff ke rantai pasca-diff (queueSongs + worker enrichment).
 *
 * Rantai ini dipisah ke services/initialScan.ts supaya bisa diuji
 * tanpa me-render hook (repo ini tidak punya testing-library; jest
 * hanya menjalankan .test.ts). Rantai di bawahnya sudah terkunci
 * terpisah di resumeEnrichment.test.ts (handleResumeDiffResult ->
 * queueSongs + startBackgroundWorker); di sini dikunci bahwa initial
 * scan BENAR-BENAR meneruskan hasil quickDiff ke sana.
 */
jest.mock("../../../features/library/services/ScanDiffEngine", () => ({
  ScanDiffEngine: { quickDiff: jest.fn() },
}));
jest.mock("../../../features/library/api/scanner", () => ({
  LibraryScanner: { getLibrarySongs: jest.fn() },
}));
jest.mock("../../../features/library/services/resumeEnrichment", () => ({
  handleResumeDiffResult: jest.fn(),
}));

import { runInitialScan } from "../../../features/library/services/initialScan";
import type { InitialScanStore } from "../../../features/library/services/initialScan";
import { ScanDiffEngine } from "../../../features/library/services/ScanDiffEngine";
import { LibraryScanner } from "../../../features/library/api/scanner";
import { handleResumeDiffResult } from "../../../features/library/services/resumeEnrichment";
import type { QuickDiffResult } from "../../../features/library/services/ScanDiffEngine";

const quickDiff = ScanDiffEngine.quickDiff as jest.Mock;
const getLibrarySongs = LibraryScanner.getLibrarySongs as jest.Mock;
const handleDiff = handleResumeDiffResult as jest.Mock;

const diff = (over: Partial<QuickDiffResult>): QuickDiffResult => ({
  newCount: 0,
  deletedCount: 0,
  updatedCount: 0,
  totalScanned: 0,
  newSongs: [],
  updatedSongs: [],
  deletedUris: [],
  ...over,
});

function fakeStore(): InitialScanStore & {
  startAutoScan: jest.Mock;
  setInitialScanCompleted: jest.Mock;
  setTracks: jest.Mock;
} {
  return {
    startAutoScan: jest.fn(),
    setInitialScanCompleted: jest.fn(),
    setTracks: jest.fn(),
  };
}

describe("runInitialScan — S1 + S2-enqueue fix", () => {
  let store: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = fakeStore();
    getLibrarySongs.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    handleDiff.mockResolvedValue(undefined);
  });

  it("lagu baru dari quickDiff -> setTracks terisi, lalu hasil diff diteruskan ke rantai pasca-diff", async () => {
    const newSongs = [
      { id: "1", uri: "content://a" },
      { id: "2", uri: "content://b" },
    ] as unknown as QuickDiffResult["newSongs"];
    const diffResult = diff({ newCount: 2, totalScanned: 2, newSongs });
    quickDiff.mockResolvedValue(diffResult);

    await runInitialScan(store);

    expect(quickDiff).toHaveBeenCalledWith(undefined, {
      bypassAutoScanGate: true,
    });
    expect(store.startAutoScan).toHaveBeenCalledTimes(1);
    expect(store.setInitialScanCompleted).toHaveBeenCalledTimes(1);
    expect(store.setTracks).toHaveBeenCalledWith([
      { id: "1" },
      { id: "2" },
    ]);
    // Inti fix S2-enqueue: hasil quickDiff diteruskan (objek yang sama),
    // bukan dibuang — lewat rantai ini lagu baru masuk ScanQueue dan
    // worker enrichment dijalankan (terkunci di resumeEnrichment.test.ts).
    expect(handleDiff).toHaveBeenCalledTimes(1);
    expect(handleDiff).toHaveBeenCalledWith(diffResult);
    // Urutan: daftar terisi dulu, baru antre + worker.
    expect(store.setTracks.mock.invocationCallOrder[0]).toBeLessThan(
      handleDiff.mock.invocationCallOrder[0],
    );
  });

  it("tidak ada lagu baru -> rantai pasca-diff tetap dipanggil (worker jalan menguras sisa antrean)", async () => {
    const diffResult = diff({ totalScanned: 3 });
    quickDiff.mockResolvedValue(diffResult);

    await runInitialScan(store);

    expect(store.setTracks).toHaveBeenCalledTimes(1);
    expect(handleDiff).toHaveBeenCalledTimes(1);
    expect(handleDiff).toHaveBeenCalledWith(diffResult);
  });

  it("quickDiff gagal -> setInitialScanCompleted/setTracks/rantai tidak jalan, error dilempar", async () => {
    quickDiff.mockRejectedValue(new Error("media denied"));

    await expect(runInitialScan(store)).rejects.toThrow("media denied");

    expect(store.startAutoScan).toHaveBeenCalledTimes(1);
    expect(store.setInitialScanCompleted).not.toHaveBeenCalled();
    expect(store.setTracks).not.toHaveBeenCalled();
    expect(handleDiff).not.toHaveBeenCalled();
  });

  it("N3: getLibrarySongs gagal -> setTracks dilewat (daftar lama dipertahankan), rantai pasca-diff tetap jalan", async () => {
    const diffResult = diff({ newCount: 1, totalScanned: 1 });
    quickDiff.mockResolvedValue(diffResult);
    getLibrarySongs.mockRejectedValue(new Error("db locked"));

    await runInitialScan(store);

    expect(store.setInitialScanCompleted).toHaveBeenCalledTimes(1);
    expect(store.setTracks).not.toHaveBeenCalled();
    expect(handleDiff).toHaveBeenCalledTimes(1);
    expect(handleDiff).toHaveBeenCalledWith(diffResult);
  });
});
