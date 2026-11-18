/**
 * src/features/library/services/MetadataEnricher.ts
 * Pristine Audio - Background processor untuk metadata extraction & deep analysis
 */

import { ScanQueue } from "./ScanQueue";
import MetadataExtractor from "../api/metadata";
import {
  MediaStore,
  NativeSong,
} from "../native/MediaStoreModule";
import { LibraryScanner } from "../api/scanner";
import { useLibraryStore } from "../store/libraryStore";
import { analyzeBitDepth } from "../../audio/api/BitDepthVerifier";
import type { QueueItem, EnrichmentLevel } from "../types/scan";
import { Song } from "@/shared/types/audio";
import { isHiRes } from "@/shared/utils/audioQuality";

export class MetadataEnricher {
  private static isRunning = false;
  private static abortController: AbortController | null = null;
  private static processedCount = 0;

  // J2-1: cache uri -> NativeSong, dibangun SEKALI per worker-run / batch
  // dari satu queryAudioFiles. Enrichment lookup di memori, bukan query
  // MediaStore penuh per lagu. null = belum dibangun atau query gagal
  // (processItem fallback ke extract(uri) per lagu seperti dulu).
  private static nativeSongCache: Map<string, NativeSong> | null = null;

  /**
   * J2-1: satu query MediaStore untuk seluruh run. Gagal -> cache tetap
   * null dan tiap item fallback ke extract(uri); enrichment tetap jalan,
   * hanya tanpa hemat query.
   */
  private static async warmNativeSongCache(): Promise<void> {
    try {
      const songs = await MediaStore.queryAudioFiles();
      const map = new Map<string, NativeSong>();
      for (const song of songs) {
        if (song?.uri) map.set(song.uri, song);
      }
      this.nativeSongCache = map;
      console.log(
        `[MetadataEnricher] NativeSong cache warmed: ${map.size} songs (1 query)`,
      );
    } catch (error) {
      console.warn(
        "[MetadataEnricher] Failed to warm NativeSong cache, falling back to per-song lookup:",
        error,
      );
      this.nativeSongCache = null;
    }
  }

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

    // J2-1: satu query MediaStore untuk seluruh worker-run.
    await this.warmNativeSongCache();

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

    this.nativeSongCache = null;
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
   * INTI PROSES (lokal saja): Level 1 & 2 (Tags) -> Level 3 (verifikasi
   * fake Hi-Res) -> DB. Tidak ada fetch online — online (MusicBrainz +
   * foto artis) hanya di [id].tsx, dipicu tap user.
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
      // J2-1: pakai NativeSong dari cache run (1 query per run); fallback
      // ke extract(uri) = 1 query penuh, hanya kalau lagu tidak ada di
      // cache (mis. ditambahkan setelah cache dibangun / query gagal).
      const cachedNative = this.nativeSongCache?.get(uri);
      const metadata = cachedNative
        ? MetadataExtractor.extractFromNative(cachedNative)
        : await MetadataExtractor.extract(uri);

      if (metadata) {
        // === LEVEL 3: Deep Verification (Pristine Engine) ===
        // Hanya verifikasi jika file mengklaim kualitas Hi-Res
        // (standar U-P1-01: lossless DAN melebihi CD — AAC 96 kHz
        // tidak lagi memicu verifikasi sia-sia, dan tidak lagi bisa
        // lolos sebagai Hi-Res bila analisis bilang "bukan palsu").
        const isHighResClaimed = isHiRes(metadata);

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

        // I2-revisi: TIDAK ada Level 4 online di sini lagi — enrichment
        // hanya lokal (tag + deteksi fake hi-res). Dulu blok ini memanggil
        // OnlineMetadataService.getArtistEnrichment per lagu (badai 503
        // di log 2026-11-18) padahal toggle online OFF. Online hanya di
        // [id].tsx, dipicu tap user.
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
    // J2-3: sinyal abort dari UnifiedScanService.enrichMetadata — cancel()
    // meng-abort controller ini, loop di bawah berhenti di item berikut.
    signal?: AbortSignal,
  ): Promise<{ success: number; failed: number; skipped: number }> {
    console.log(
      `[MetadataEnricher] enrichBatch started with ${songIds.length} songs`,
    );

    // J2-1: satu query MediaStore untuk seluruh batch.
    await this.warmNativeSongCache();

    let success = 0,
      failed = 0,
      skipped = 0;
    const store = useLibraryStore.getState();

    for (let i = 0; i < songIds.length; i++) {
      // J2-3: batalkan batch — sisa lagu yang belum diproses dihitung
      // skipped supaya success + failed + skipped = total.
      if (signal?.aborted) {
        console.log(
          `[MetadataEnricher] enrichBatch cancelled after ${success + failed} of ${songIds.length} songs`,
        );
        skipped += songIds.length - i;
        break;
      }

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

    this.nativeSongCache = null;
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
