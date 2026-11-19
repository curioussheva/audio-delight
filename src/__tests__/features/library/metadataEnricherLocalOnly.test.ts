/**
 * I2-revisi (a): enrichment hanya lokal — TIDAK BOLEH memanggil online.
 *
 * Regresi yang dikunci: `processItem` dulu menjalankan "Level 4" —
 * `OnlineMetadataService.getArtistEnrichment` per lagu (non-blocking) —
 * yang membanjiri log dengan 503 + unduhan gambar padahal toggle online
 * OFF sejak awal. Setelah revisi, worker tidak lagi memanggil online.
 * 2026-11-19: service online dicabut seluruhnya, jadi worker secara
 * struktural tidak bisa memanggilnya lagi — mock/assert online dihapus;
 * test ini mengunci perilaku lokal (penyimpanan lokal tetap jalan).
 */
jest.mock("@/features/library/services/ScanQueue", () => ({
  ScanQueue: {
    shift: jest.fn(),
    getSize: jest.fn(async () => 0),
    retry: jest.fn(),
  },
}));
jest.mock("@/features/library/api/metadata", () => ({
  __esModule: true,
  default: {
    extract: jest.fn(),
    extractFromNative: jest.fn(),
  },
}));
jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: { updateMetadata: jest.fn() },
}));
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: { getState: jest.fn() },
}));
jest.mock("@/features/library/native/MediaStoreModule", () => ({
  MediaStore: { queryAudioFiles: jest.fn(async () => []) },
}));
jest.mock("@/features/audio/api/BitDepthVerifier", () => ({
  analyzeBitDepth: jest.fn(),
}));
// L1: worker membaca .lrc berdampingan lewat lyricsSource — modul expo
// di-mock (default: tidak ada file), test sidecar menimpa per-test.
jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));
jest.mock("expo-media-library", () => ({
  getAssetInfoAsync: jest.fn(),
}));

import { MetadataEnricher } from "@/features/library/services/MetadataEnricher";
import { ScanQueue } from "@/features/library/services/ScanQueue";
import MetadataExtractor from "@/features/library/api/metadata";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

const getInfoMock = FileSystem.getInfoAsync as jest.Mock;
const readMock = FileSystem.readAsStringAsync as jest.Mock;
const getAssetMock = MediaLibrary.getAssetInfoAsync as jest.Mock;

const shiftMock = ScanQueue.shift as jest.Mock;
const extractMock = (MetadataExtractor as any).extract as jest.Mock;
const updateMetadataMock = LibraryScanner.updateMetadata as jest.Mock;

describe("I2-revisi (a) — enrichment lokal saja", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLibraryStore.getState as jest.Mock).mockReturnValue({
      tracks: [{ id: "1", uri: "content://media/external/audio/media/1" }],
      markAsEnriched: jest.fn(),
      setEnrichmentQueueSize: jest.fn(),
      finishEnrichment: jest.fn(),
    });
    extractMock.mockResolvedValue({
      artist: "Artis Nyata",
      title: "Lagu",
      duration: 200,
    });
    shiftMock
      .mockResolvedValueOnce({
        songId: "1",
        uri: "content://media/external/audio/media/1",
        priority: 0,
        level: "basic",
        addedAt: 0,
        retryCount: 0,
      })
      .mockResolvedValue(null);
    // L1 default: tidak ada file .lrc berdampingan.
    getAssetMock.mockResolvedValue({ localUri: null, uri: null });
    getInfoMock.mockResolvedValue({ exists: false });
  });

  it("worker memproses lagu berartis nyata TANPA memanggil online", async () => {
    await MetadataEnricher.startBackgroundWorker();

    expect(updateMetadataMock).toHaveBeenCalled();
  });

  it("L1: .lrc berdampingan masuk ke lyrics_synced (tanpa online)", async () => {
    getAssetMock.mockResolvedValueOnce({
      localUri: "file:///storage/emulated/0/Music/song.mp3",
      uri: "content://media/external/audio/media/1",
    });
    getInfoMock.mockResolvedValueOnce({ exists: true, isDirectory: false });
    readMock.mockResolvedValueOnce("[00:01.00]la");

    await MetadataEnricher.startBackgroundWorker();

    expect(updateMetadataMock).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ lyricsSynced: "[00:01.00]la" }),
    );
  });

  it("L2: lirik yang dihapus manual tidak dihidupkan lagi oleh worker", async () => {
    // Track ditandai edited (user menghapus lirik di [id].tsx) dan file
    // .lrc masih ada di disk — worker TIDAK BOLEH membaca / mengisinya.
    (useLibraryStore.getState as jest.Mock).mockReturnValue({
      tracks: [
        {
          id: "1",
          uri: "content://media/external/audio/media/1",
          editedFields: ["lyricsSynced"],
        },
      ],
      markAsEnriched: jest.fn(),
      setEnrichmentQueueSize: jest.fn(),
      finishEnrichment: jest.fn(),
    });
    getAssetMock.mockResolvedValueOnce({
      localUri: "file:///storage/emulated/0/Music/song.mp3",
      uri: "content://media/external/audio/media/1",
    });
    getInfoMock.mockResolvedValueOnce({ exists: true, isDirectory: false });
    readMock.mockResolvedValueOnce("[00:01.00]la");

    await MetadataEnricher.startBackgroundWorker();

    expect(readMock).not.toHaveBeenCalled();
    const calls = updateMetadataMock.mock.calls.filter(
      ([, payload]: [string, any]) => "lyricsSynced" in (payload ?? {}),
    );
    expect(calls).toEqual([]);
  });
});
