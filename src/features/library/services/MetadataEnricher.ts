/**
 * src/features/library/services/MetadataEnricher.ts
 * Pristine Audio - Background processor untuk metadata extraction & deep analysis
 */

import { ScanQueue } from "./ScanQueue";
import MetadataExtractor from "../api/metadata";
import { LibraryScanner } from "../api/scanner";
import { useLibraryStore } from "../store/libraryStore";
import { analyzeBitDepth } from "../../audio/api/BitDepthVerifier";
import OnlineMetadataService from "./OnlineMetadataService";
import type { QueueItem, EnrichmentLevel } from "../types/scan";
import { Song } from "@/shared/types/audio";

export class MetadataEnricher {
  private static isRunning = false;
  private static abortController: AbortController | null = null;
  private static processedCount = 0;

  /**
   * Menjalankan worker di background untuk memproses antrian secara perlahan
   */
  static async startBackgroundWorker(
    onProgress?: (
      processed: number,
      remaining: number,
      currentSong?: string,
    ) => void,
  ): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.abortController = new AbortController();
    this.processedCount = 0;

    console.log("[MetadataEnricher] Background worker started");
    const store = useLibraryStore.getState();

    while (this.isRunning && !this.abortController?.signal.aborted) {
      const item = await ScanQueue.shift();
      if (!item) break;

      try {
        await this.processItem(item);
        this.processedCount++;

        const remaining = await ScanQueue.getSize();
        onProgress?.(this.processedCount, remaining, item.songId);

        // Update size antrian di store untuk UI (ScanStatusBar)
        store.setEnrichmentQueueSize(remaining);
      } catch (error) {
        console.warn(`[MetadataEnricher] Failed ${item.songId}:`, error);
        await ScanQueue.retry(item);
      }

      // Gentle delay (350ms) agar I/O storage tidak bottleneck dan UI tetap smooth
      await new Promise((r) => setTimeout(r, 350));
    }

    this.isRunning = false;
    this.abortController = null;

    // Memberitahu store bahwa proses enrichment selesai
    store.finishEnrichment({ success: this.processedCount, failed: 0 });
    console.log("[MetadataEnricher] Background worker finished");
  }

  /**
   * Menghentikan paksa worker
   */
  static stop(): void {
    this.abortController?.abort();
    this.isRunning = false;
  }

  /**
   * INTI PROSES: Level 2 (Tags) -> Level 3 (Audio Analysis) -> Level 4 (Artist Images) -> DB
   */
  private static async processItem(item: QueueItem): Promise<void> {
    const store = useLibraryStore.getState();

    // Ambil data track awal dari store
    const existingTrack = store.tracks?.find((t) => t.id === item.songId);
    const uri = existingTrack?.uri || item.uri;

    if (!uri) {
      console.warn(`[MetadataEnricher] No URI found for ${item.songId}`);
      return;
    }

    try {
      // === LEVEL 1 & 2: Technical Metadata & Basic Tags ===
      const metadata = await MetadataExtractor.extract(uri);

      if (metadata) {
        // === LEVEL 3: Deep Verification (Pristine Engine) ===
        // Hanya verifikasi jika file mengklaim kualitas Hi-Res
        const isHighResClaimed =
          (metadata.bitDepth || 0) > 16 || (metadata.sampleRate || 0) > 48000;

        if (isHighResClaimed) {
          const analysis = await analyzeBitDepth(metadata as Song);

          // Set ulang flag Hi-Res berdasarkan data verifikasi asli
          metadata.isHiRes = !analysis.isFake && isHighResClaimed;

          if (analysis.isFake) {
            console.log(
              `[MetadataEnricher] ⚠️ Fake Hi-Res detected: ${metadata.title} (Actual: ${analysis.realDepth}-bit)`,
            );
          }
        }

        // === PERSISTENCE ===
        // 1. Simpan ke SQLite (Gunakan integer 1 untuk SQLite boolean compatibility)
        await LibraryScanner.updateMetadata(item.songId, {
          ...metadata,
          isEnriched: true,
          lastEnrichedAt: Date.now(),
        });

        // 2. Update Zustand Store (Gunakan boolean true untuk React UI)
        store.markAsEnriched(item.songId, {
          ...metadata,
          isEnriched: true,
          last_enriched_at: Date.now(),
        });

        // === LEVEL 4: Online Enrichment (MusicBrainz) ===
        // Eksekusi secara non-blocking agar antrian lagu selanjutnya tidak tertahan
        if (metadata.artist && metadata.artist !== "Unknown Artist") {
          OnlineMetadataService.getArtistEnrichment(metadata.artist)
            .then((artistData) => {
              if (artistData.imageUrl) {
                // Opsional: Kamu bisa buat action di store `store.updateArtistImage(name, url)`
                console.log(
                  `[Level 4] Downloaded image for: ${metadata.artist}`,
                );
              }
            })
            .catch((e) =>
              console.warn(
                `[Level 4] Error fetching artist ${metadata.artist}`,
                e,
              ),
            );
        }
      }
    } catch (error) {
      console.error(
        `[MetadataEnricher] Critical error processing ${item.songId}:`,
        error,
      );
      throw error; // Lempar error agar ditangkap blok catch di worker untuk di-retry
    }
  }

  /**
   * Enrichment Batch untuk daftar lagu tertentu secara langsung
   * (Digunakan saat manual scan)
   */
  static async enrichBatch(
    songIds: string[],
    onProgress?: (
      current: number,
      total: number,
      songInfo?: { title?: string; artist?: string },
    ) => void,
  ): Promise<{ success: number; failed: number; skipped: number }> {
    console.log(
      `[MetadataEnricher] enrichBatch started with ${songIds.length} songs`,
    );

    let success = 0,
      failed = 0,
      skipped = 0;
    const store = useLibraryStore.getState();

    for (let i = 0; i < songIds.length; i++) {
      const songId = songIds[i];
      const song = store.tracks?.find((t) => t.id === songId);

      if (!song?.uri) {
        skipped++;
        continue;
      }

      try {
        await this.processItem({
          songId,
          uri: song.uri,
          priority: 0,
          level: 2 as EnrichmentLevel,
          addedAt: Date.now(),
          retryCount: 0,
        });

        success++;
        onProgress?.(i + 1, songIds.length, {
          title: song.title,
          artist: song.artist,
        });
      } catch (error) {
        failed++;
        console.warn(`[MetadataEnricher] Batch failed ${songId}:`, error);
      }

      // Delay minimal saat batch manual agar UI tidak membeku (freeze)
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 10));
    }

    store.finishEnrichment({ success, failed });
    return { success, failed, skipped };
  }

  /**
   * Menambahkan lagu-lagu baru ke dalam database antrian persisten
   */
  static async queueSongs(
    songs: Array<{ id: string; uri: string; priority?: number }>,
  ): Promise<number> {
    const items: QueueItem[] = songs.map((s) => ({
      songId: s.id,
      uri: s.uri,
      priority: s.priority || 0,
      level: 2 as EnrichmentLevel,
      addedAt: Date.now(),
      retryCount: 0,
    }));

    const added = await ScanQueue.add(items);

    // Sinkronisasikan angka antrian UI
    const store = useLibraryStore.getState();
    const currentSize = store.enrichmentQueueSize || 0;
    store.setEnrichmentQueueSize(currentSize + added);

    return added;
  }
}
