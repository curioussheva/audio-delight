import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { getAudioMetadata } from '@missingcore/audio-metadata';
import { LibraryScanner } from '@/features/library/api/scanner';

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

export async function runMediaStoreDiff(
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    console.warn('[DiffEngine] MediaLibrary permission not granted');
    return { newCount: 0, deletedCount: 0, totalAfter: 0 };
  }

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

  return await _applyDiff(currentUris, currentAssets, 'mediastore', onProgress);
}

export async function runSAFDiff(
  directoryUri: string,
  onProgress?: (current: number, total: number) => void
): Promise<DiffResult> {
  const allFiles: Array<{ uri: string; filename: string }> = [];
  const visited = new Set<string>();
  await _collectSAFFiles(directoryUri, allFiles, visited);

  const currentUris = new Set(allFiles.map(f => f.uri));

  const assets = allFiles.map(f => ({
    uri:              f.uri,
    filename:         f.filename,
    id:               f.uri,
    mediaType:        'audio' as const,
    width:            0,
    height:           0,
    creationTime:     Date.now(),
    modificationTime: Date.now(),
    duration:         0,
    albumId:          '',
  }));

  return await _applyDiff(currentUris, assets, 'saf', onProgress);
}

/**
 * ENRICHMENT — isi sampleRate & bitDepth via copy-to-cache.
 * @missingcore/audio-metadata tidak support SAF URI langsung,
 * jadi file di-copy sementara ke cache, dibaca, lalu dihapus.
 */
export async function runEnrichment(
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const tracks = LibraryScanner.getUnenrichedTracks(30);
  const total = tracks.length;
  if (total === 0) return 0;

  console.log(`💎 [DiffEngine] Enriching ${total} tracks...`);
  let enriched = 0;

  for (const track of tracks) {
    // Normalize ekstensi ke lowercase
    const ext = track.filename.split('.').pop()?.toLowerCase() ?? 'mp3';
    const cacheUri = `${FileSystem.cacheDirectory}enrich_${Date.now()}.${ext}`;

    try {
      // Copy dari MediaStore URI ke cache
      await FileSystem.copyAsync({ from: track.uri, to: cacheUri });

      const meta = await getAudioMetadata(cacheUri);

      LibraryScanner.updateEnrichment(track.uri, {
        sampleRate: (meta as any)?.sampleRate ?? 0,
        bitDepth:   (meta as any)?.bitDepth   ?? 0,
        artwork:    (meta as any)?.artwork     ?? undefined,
      });

      enriched++;
      onProgress?.(enriched, total);
    } catch (e) {
      console.warn(`[DiffEngine] Enrich failed for ${track.filename}:`, e);
      // Mark enriched agar tidak retry terus
      LibraryScanner.updateEnrichment(track.uri, { sampleRate: 0, bitDepth: 0 });
    } finally {
      try {
        await FileSystem.deleteAsync(cacheUri, { idempotent: true });
      } catch {}
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
  const existingUris = LibraryScanner.getExistingUris();
  const newAssets   = assets.filter(a => !existingUris.has(a.uri));
  const deletedUris = [...existingUris].filter(uri => !currentUris.has(uri));

  console.log(`[DiffEngine][${source}] New: ${newAssets.length} | Deleted: ${deletedUris.length}`);

  if (deletedUris.length > 0) {
    LibraryScanner.markAsDeleted(deletedUris);
  }

  const total = newAssets.length;
  let processed = 0;

  for (const asset of newAssets) {
    try {
      // Pakai data MediaStore langsung — tidak perlu extract metadata saat insert
      // sampleRate & bitDepth diisi oleh runEnrichment() setelahnya
      await LibraryScanner.saveToDatabase({
        uri:        asset.uri,
        filename:   asset.filename,
        title:      asset.filename.replace(/\.[^/.]+$/, ""),
        artist:     "Unknown Artist",
        album:      "Unknown Album",
        genre:      "Unknown Genre",
        folder:     _extractFolder(asset.uri, source),
        duration:   Math.floor(asset.duration ?? 0),
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

  const totalAfter = existingUris.size - deletedUris.length + newAssets.length;
  return { newCount: newAssets.length, deletedCount: deletedUris.length, totalAfter };
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
      parts.pop();
      return decodeURIComponent(parts[parts.length - 1] ?? 'Music');
    }
    const decoded = decodeURIComponent(uri);
    const parts   = decoded.split('/');
    parts.pop();
    return parts[parts.length - 1] ?? 'Music';
  } catch {
    return 'Music';
  }
} 