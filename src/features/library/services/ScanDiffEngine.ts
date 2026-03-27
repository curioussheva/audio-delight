import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { LibraryScanner } from '@/features/library/api/scanner';
import {
  getMetadata,
  getArtwork,
  MetadataPresets,
} from '@missingcore/react-native-metadata-retriever';

const SAF = FileSystem.StorageAccessFramework;

const SUPPORTED_EXTENSIONS = new Set([
  'mp3', 'flac', 'm4a', 'wav', 'aac',
  'ogg', 'opus', 'dsf', 'dsd', 'dff', 'alac',
]);

export type DiffResult = {
  newCount: number;
  deletedCount: number;
  totalAfter: number;
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * DISCOVERY via MediaStore (primary — cepat, seperti native player)
 * Cocok untuk internal storage & SD card yang terindeks Android.
 */
export async function runMediaStoreDiff(): Promise<DiffResult> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    console.warn('[DiffEngine] MediaLibrary permission not granted');
    return { newCount: 0, deletedCount: 0, totalAfter: 0 };
  }

  // Ambil semua asset audio dari MediaStore
  const currentUris = new Set<string>();
  const currentAssets: MediaLibrary.Asset[] = [];
  let after: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: 200,
      after,
    });

    for (const asset of page.assets) {
      const ext = asset.filename.split('.').pop()?.toLowerCase() ?? '';
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        currentUris.add(asset.uri);
        currentAssets.push(asset);
      }
    }

    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  return await _applyDiff(currentUris, currentAssets, 'mediastore');
}

/**
 * DISCOVERY via SAF (fallback — untuk SD card / OTG yang tidak terindeks)
 * Cocok untuk folder spesifik yang dipilih user.
 */
export async function runSAFDiff(
  directoryUri: string,
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  // Kumpulkan semua file via SAF walk
  const allFiles: Array<{ uri: string; filename: string }> = [];
  const visited = new Set<string>();
  await _collectSAFFiles(directoryUri, allFiles, visited);

  const currentUris = new Set(allFiles.map(f => f.uri));

  // Konversi ke format MediaLibrary.Asset minimal agar bisa dipakai _applyDiff
  const assets = allFiles.map(f => ({
    uri: f.uri,
    filename: f.filename,
    id: f.uri,
    mediaType: 'audio' as const,
    width: 0, height: 0,
    creationTime: Date.now(),
    modificationTime: Date.now(),
    duration: 0,
    albumId: '',
  }));

  return await _applyDiff(currentUris, assets, 'saf', onProgress);
}

/**
 * ENRICHMENT — isi sampleRate, bitDepth, artwork untuk track yang belum di-enrich.
 * Jalankan setelah discovery selesai, atau sebagai background task.
 */
export async function runEnrichment(
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const tracks = LibraryScanner.getUnenrichedTracks(100);
  const total = tracks.length;

  if (total === 0) {
    console.log('[DiffEngine] No tracks to enrich.');
    return 0;
  }

  console.log(`💎 [DiffEngine] Enriching ${total} tracks...`);
  let enriched = 0;

  for (const track of tracks) {
    try {
      // MetadataPresets.extended memberikan sampleRate, bitDepth
      const meta = await getMetadata(track.uri, MetadataPresets.extended);
      let artwork: string | null = null;
      try { artwork = await getArtwork(track.uri); } catch {}

      LibraryScanner.updateEnrichment(track.uri, {
        sampleRate: meta?.sampleRate ?? 0,
        bitDepth:   meta?.bitDepth   ?? 0,
        artwork:    artwork ?? undefined,
      });

      enriched++;
      onProgress?.(enriched, total);
    } catch (e) {
      console.warn(`[DiffEngine] Enrich failed for ${track.filename}:`, e);
    }
  }

  console.log(`✅ [DiffEngine] Enriched ${enriched} / ${total} tracks.`);
  return enriched;
}

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

async function _applyDiff(
  currentUris: Set<string>,
  assets: MediaLibrary.Asset[],
  source: 'mediastore' | 'saf',
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  // Bandingkan dengan DB
  const existingUris = LibraryScanner.getExistingUris();

  const newAssets    = assets.filter(a => !existingUris.has(a.uri));
  const deletedUris  = [...existingUris].filter(uri => !currentUris.has(uri));

  console.log(`[DiffEngine][${source}] New: ${newAssets.length} | Deleted: ${deletedUris.length}`);

  // 1. Hapus track yang sudah tidak ada di storage
  if (deletedUris.length > 0) {
    LibraryScanner.markAsDeleted(deletedUris);
  }

  // 2. Insert track baru (basic metadata dulu, isEnriched = false)
  const total = newAssets.length;
  let processed = 0;

  for (const asset of newAssets) {
    try {
      // Basic metadata dari MediaStore asset
      let title  = asset.filename.replace(/\.[^/.]+$/, "");
      let artist = "Unknown Artist";
      let album  = "Unknown Album";
      let duration = Math.floor(asset.duration ?? 0);

      // Coba ambil metadata dasar via retriever
      try {
        const meta = await getMetadata(asset.uri, MetadataPresets.standard);
        if (meta?.title)    title    = meta.title;
        if (meta?.artist)   artist   = meta.artist;
        if (meta?.album)    album    = meta.album;
        if (meta?.duration) duration = Math.floor(meta.duration / 1000);
      } catch {}

      const folder = _extractFolder(asset.uri, source);

      await LibraryScanner.saveToDatabase({
        uri:        asset.uri,
        filename:   asset.filename,
        title,
        artist,
        album,
        genre:      "Unknown Genre",
        folder,
        duration,
        codec:      asset.filename.split('.').pop()?.toUpperCase() ?? 'UNKNOWN',
        isEnriched: false,
        dateAdded:  asset.creationTime ?? Date.now(),
      });
    } catch (e) {
      console.warn(`[DiffEngine] Insert failed for ${asset.filename}:`, e);
    }

    processed++;
    onProgress?.(processed, total);
  }

  // Hitung total setelah diff
  const totalAfter = existingUris.size - deletedUris.length + newAssets.length;

  return {
    newCount:     newAssets.length,
    deletedCount: deletedUris.length,
    totalAfter,
  };
}

async function _collectSAFFiles(
  uri: string,
  result: Array<{ uri: string; filename: string }>,
  visited: Set<string>
): Promise<void> {
  if (!SAF || visited.has(uri)) return;
  visited.add(uri);

  let entries: string[];
  try {
    entries = await SAF.readDirectoryAsync(uri);
  } catch {
    return;
  }

  for (const entryUri of entries) {
    if (!entryUri || visited.has(entryUri)) continue;
    const ext = entryUri.split('.').pop()?.toLowerCase() ?? '';

    if (SUPPORTED_EXTENSIONS.has(ext)) {
      const parts    = entryUri.split('/');
      const filename = decodeURIComponent(parts[parts.length - 1] || "Unknown");
      result.push({ uri: entryUri, filename });
      visited.add(entryUri);
    } else {
      await _collectSAFFiles(entryUri, result, visited);
    }
  }
}

function _extractFolder(uri: string, source: 'mediastore' | 'saf'): string {
  try {
    if (source === 'saf') {
      const parts = uri.split('%2F');
      parts.pop(); // hapus filename
      return decodeURIComponent(parts[parts.length - 1] ?? 'Music');
    }
    // MediaStore: /storage/emulated/0/Music/Artist/Album/track.mp3
    const decoded = decodeURIComponent(uri);
    const parts   = decoded.split('/');
    parts.pop();
    return parts[parts.length - 1] ?? 'Music';
  } catch {
    return 'Music';
  }
}