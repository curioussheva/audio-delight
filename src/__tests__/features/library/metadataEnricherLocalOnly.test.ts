/**
 * I2-revisi (a): enrichment hanya lokal — TIDAK BOLEH memanggil online.
 *
 * Regresi yang dikunci: `processItem` dulu menjalankan "Level 4" —
 * `OnlineMetadataService.getArtistEnrichment` per lagu (non-blocking) —
 * yang membanjiri log dengan 503 + unduhan gambar padahal toggle online
 * OFF sejak awal. Setelah revisi, satu-satunya jalur online adalah
 * [id].tsx (tap user). Test ini menjalankan worker dengan satu lagu
 * berartis nyata dan memastikan getArtistEnrichment TIDAK pernah
 * dipanggil, sementara penyimpanan lokal (updateMetadata) tetap jalan.
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
jest.mock("@/features/library/services/OnlineMetadataService", () => ({
  __esModule: true,
  default: { getArtistEnrichment: jest.fn() },
}));

import { MetadataEnricher } from "@/features/library/services/MetadataEnricher";
import { ScanQueue } from "@/features/library/services/ScanQueue";
import MetadataExtractor from "@/features/library/api/metadata";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";

const shiftMock = ScanQueue.shift as jest.Mock;
const extractMock = (MetadataExtractor as any).extract as jest.Mock;
const updateMetadataMock = LibraryScanner.updateMetadata as jest.Mock;
const getArtistEnrichmentMock =
  OnlineMetadataService.getArtistEnrichment as jest.Mock;

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
  });

  it("worker memproses lagu berartis nyata TANPA memanggil online", async () => {
    await MetadataEnricher.startBackgroundWorker();

    expect(updateMetadataMock).toHaveBeenCalled();
    expect(getArtistEnrichmentMock).not.toHaveBeenCalled();
  });
});
