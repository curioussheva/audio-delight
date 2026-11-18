/**
 * handleResumeDiffResult — S2: setelah resume quickDiff, lagu baru
 * diantre DAN worker enrichment dijalankan.
 *
 * Modul yang diuji mengimpor MetadataEnricher + store — keduanya di-mock
 * di sini mengikuti pola ScanDiffEngine.test.ts.
 */
jest.mock("../../../features/library/services/MetadataEnricher", () => ({
  MetadataEnricher: {
    queueSongs: jest.fn(),
    startBackgroundWorker: jest.fn(),
  },
}));
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: { getState: jest.fn() },
}));

import { handleResumeDiffResult } from "../../../features/library/services/resumeEnrichment";
import { MetadataEnricher } from "../../../features/library/services/MetadataEnricher";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import type { QuickDiffResult } from "../../../features/library/services/ScanDiffEngine";

const getState = useLibraryStore.getState as jest.Mock;
const queueSongs = MetadataEnricher.queueSongs as jest.Mock;
const startBackgroundWorker =
  MetadataEnricher.startBackgroundWorker as jest.Mock;

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

describe("handleResumeDiffResult — S2", () => {
  let finishAutoScan: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    finishAutoScan = jest.fn();
    getState.mockReturnValue({ finishAutoScan });
    queueSongs.mockResolvedValue(2);
    startBackgroundWorker.mockResolvedValue(undefined);
  });

  it("lagu baru -> queueSongs dulu, lalu worker jalan (urutan terkunci)", async () => {
    const newSongs = [
      { id: "1", uri: "content://a" },
      { id: "2", uri: "content://b" },
    ] as unknown as QuickDiffResult["newSongs"];

    await handleResumeDiffResult(
      diff({ newCount: 2, totalScanned: 2, newSongs }),
    );

    expect(finishAutoScan).toHaveBeenCalledTimes(1);
    expect(queueSongs).toHaveBeenCalledWith([
      { id: "1", uri: "content://a" },
      { id: "2", uri: "content://b" },
    ]);
    expect(startBackgroundWorker).toHaveBeenCalledTimes(1);
    // Bukti urutan: antre dulu, worker kemudian.
    expect(queueSongs.mock.invocationCallOrder[0]).toBeLessThan(
      startBackgroundWorker.mock.invocationCallOrder[0],
    );
  });

  it("tidak ada perubahan -> queueSongs tidak dipanggil, worker tetap jalan (sisa antrean sesi lalu)", async () => {
    await handleResumeDiffResult(diff({ totalScanned: 3 }));

    expect(finishAutoScan).not.toHaveBeenCalled();
    expect(queueSongs).not.toHaveBeenCalled();
    expect(startBackgroundWorker).toHaveBeenCalledTimes(1);
  });

  it("hanya hapus -> finishAutoScan jalan, queueSongs tidak, worker jalan", async () => {
    await handleResumeDiffResult(
      diff({ deletedCount: 1, totalScanned: 2, deletedUris: ["x"] }),
    );

    expect(finishAutoScan).toHaveBeenCalledTimes(1);
    expect(queueSongs).not.toHaveBeenCalled();
    expect(startBackgroundWorker).toHaveBeenCalledTimes(1);
  });

  it("worker gagal -> tidak melempar (fire-and-forget ditangkap .catch)", async () => {
    startBackgroundWorker.mockRejectedValue(new Error("boom"));

    await expect(handleResumeDiffResult(diff({}))).resolves.toBeUndefined();
    // Beri waktu .catch jalan sebelum test selesai.
    await new Promise((r) => setImmediate(r));
    expect(startBackgroundWorker).toHaveBeenCalledTimes(1);
  });
});
