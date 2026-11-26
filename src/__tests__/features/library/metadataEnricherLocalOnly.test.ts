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
  LibraryScanner: {
    updateMetadata: jest.fn(),
    getNativeSongsFromDb: jest.fn(),
  },
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
import { MediaStore } from "@/features/library/native/MediaStoreModule";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

const getInfoMock = FileSystem.getInfoAsync as jest.Mock;
const readMock = FileSystem.readAsStringAsync as jest.Mock;
const getAssetMock = MediaLibrary.getAssetInfoAsync as jest.Mock;

const shiftMock = ScanQueue.shift as jest.Mock;
const extractMock = (MetadataExtractor as any).extract as jest.Mock;
const extractFromNativeMock = (MetadataExtractor as any)
  .extractFromNative as jest.Mock;
const updateMetadataMock = LibraryScanner.updateMetadata as jest.Mock;
const getNativeSongsFromDbMock =
  LibraryScanner.getNativeSongsFromDb as jest.Mock;
const queryAudioFilesMock = MediaStore.queryAudioFiles as jest.Mock;
const getArtistEnrichmentMock =
  OnlineMetadataService.getArtistEnrichment as jest.Mock;

describe("I2-revisi (a) — enrichment lokal saja", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLibraryStore.getState as jest.Mock).mockReturnValue({
      tracks: [{ id: "1", uri: "content://media/external/audio/media/1" }],
      markAsEnriched: jest.fn(),
      markTracksEnriched: jest.fn(),
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
    // J2-1: warm awal membaca DB (default: kosong di tes ini — lagu
    // hanya ketemu lewat extract / refresh per-test).
    getNativeSongsFromDbMock.mockReturnValue([]);
    // L1 default: tidak ada file .lrc berdampingan.
    getAssetMock.mockResolvedValue({ localUri: null, uri: null });
    getInfoMock.mockResolvedValue({ exists: false });
  });

  it("worker memproses lagu berartis nyata TANPA memanggil online", async () => {
    await MetadataEnricher.startBackgroundWorker();

    expect(updateMetadataMock).toHaveBeenCalled();
    expect(getArtistEnrichmentMock).not.toHaveBeenCalled();
  });

  it("LIB-49/SCR-3: commit store di-batch — 1 lagu = 1 flush di akhir worker", async () => {
    const markAsEnriched = jest.fn();
    const markTracksEnriched = jest.fn();
    (useLibraryStore.getState as jest.Mock).mockReturnValue({
      tracks: [{ id: "1", uri: "content://media/external/audio/media/1" }],
      markAsEnriched,
      markTracksEnriched,
      setEnrichmentQueueSize: jest.fn(),
      finishEnrichment: jest.fn(),
    });

    await MetadataEnricher.startBackgroundWorker();

    // Per-lagu (markAsEnriched) tidak lagi dipanggil dari processItem;
    // satu flush batch di finally menutup worker.
    expect(markAsEnriched).not.toHaveBeenCalled();
    expect(markTracksEnriched).toHaveBeenCalledTimes(1);
    expect(markTracksEnriched).toHaveBeenCalledWith([
      expect.objectContaining({
        trackId: "1",
        metadata: expect.objectContaining({ isEnriched: true }),
      }),
    ]);
  });

  it("J2-1 (sisa): cache miss -> refresh DB sekali, tanpa query MediaStore per lagu", async () => {
    // Warm awal: DB kosong -> fallback MediaStore (mock []) -> cache
    // map kosong. Refresh saat miss: DB sudah berisi lagu -> ketemu
    // tanpa query MediaStore.
    const native = {
      id: "1",
      uri: "content://media/external/audio/media/1",
      filename: "song.mp3",
      title: "Lagu",
      artist: "Artis Nyata",
      album: "Album",
      duration: 200,
    };
    getNativeSongsFromDbMock
      .mockReturnValueOnce([])
      .mockReturnValueOnce([native]);
    extractFromNativeMock.mockReturnValue({
      artist: "Artis Nyata",
      title: "Lagu",
      duration: 200,
    });

    await MetadataEnricher.startBackgroundWorker();

    expect(updateMetadataMock).toHaveBeenCalled();
    expect(extractFromNativeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "content://media/external/audio/media/1",
      }),
    );
    // Jalur mahal yang dihapus J2-1: extract(uri) = satu query
    // MediaStore penuh per lagu — tidak boleh terpanggil di sini.
    expect(extractMock).not.toHaveBeenCalled();
    // Satu-satunya query MediaStore di run ini adalah fallback warm
    // awal (DB kosong); refresh-nya DB-only.
    expect(queryAudioFilesMock).toHaveBeenCalledTimes(1);
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
    expect(getArtistEnrichmentMock).not.toHaveBeenCalled();
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
      markTracksEnriched: jest.fn(),
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
