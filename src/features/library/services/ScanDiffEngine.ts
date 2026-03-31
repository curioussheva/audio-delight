import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { getAudioMetadata } from '@missingcore/audio-metadata';
import { LibraryScanner } from '@/features/library/api/scanner';
import { MediaStore, NativeSong } from '../native/MediaStoreModule'; 

const SAF = FileSystem.StorageAccessFramework;

const SUPPORTED_EXTENSIONS = new Set([
  'mp3', 'flac', 'm4a', 'wav', 'aac',
  'ogg', 'opus', 'dsf', 'dsd', 'dff', 'alac',
]);

// Noise patterns di filename dari YouTube download
const NOISE_PATTERNS = [
  /\(MP3_\d+K\)/gi,
  /\(M4A_\d+K\)/gi,
  /\(FLAC_\d+K\)/gi,
  /\(AAC_\d+K\)/gi,
  /\(WAV_\d+K\)/gi,
  /\[MP3_\d+K\]/gi,
  /\[Official (Music )?Video\]/gi,
  /\[Official Audio\]/gi,
  /\[Official HD Video\]/gi,
  /\[HD\]/gi,
  /\[4K\]/gi,
  /\[Lyrics?\]/gi,
  /\[Lyric Video\]/gi,
  /\(Official Video\)/gi,
  /\(Official Audio\)/gi,
  /\(Official Music Video\)/gi,
  /\(Official HD Video\)/gi,
  /\(Lyrics?\)/gi,
  /\(Lyric Video\)/gi,
  /\(with Lyrics?\)/gi,
  /\(HD\)/gi,
  /\(4K\)/gi,
  /\(Remastered.*?\)/gi,
  /\(Live.*?\)/gi,
  /\(Karaoke Video\)/gi,
];

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
  let nativeSongs: NativeSong[];

  try {
    nativeSongs = await MediaStore.queryAudioFiles();
    console.log(`[DiffEngine] MediaStore native query: ${nativeSongs.length} songs`);
  } catch (e) {
    console.warn('[DiffEngine] Native MediaStore failed, fallback to expo-media-library:', e);
    return runMediaStoreDiffFallback(onProgress); // fallback ke yang lama
  }

  const currentUris = new Set(nativeSongs.map(s => s.uri));
  const existingUris = LibraryScanner.getExistingUris();
  const newSongs    = nativeSongs.filter(s => !existingUris.has(s.uri));
  const deletedUris = [...existingUris].filter(uri => !currentUris.has(uri));

  console.log(`[DiffEngine][native] New: ${newSongs.length} | Deleted: ${deletedUris.length}`);

  if (deletedUris.length > 0) LibraryScanner.markAsDeleted(deletedUris);

  const total = newSongs.length;
  let processed = 0;

  for (const song of newSongs) {
    try {
      await LibraryScanner.saveToDatabase({
        uri:         song.uri,
        filename:    song.filename,
        title:       song.title,
        artist:      song.artist,
        album:       song.album,
        genre:       "Unknown Genre",  // MediaStore genre query terpisah
        folder:      song.folder,
        duration:    Math.floor(song.duration),
        codec:       song.codec,
        artwork:     song.artworkUri,  // ← dari MediaStore, tidak perlu enrichment
        fileSize:    song.fileSize,
        dateAdded:   song.dateAdded,
        isEnriched:  false,            // sampleRate/bitDepth masih perlu enrichment
        // Extra fields
        year:        song.year > 0 ? song.year : undefined,
        trackNumber: song.trackNumber > 0 ? song.trackNumber : undefined,
      });
    } catch (e) {
      console.warn(`[DiffEngine] Insert failed for ${song.filename}:`, e);
    }

    processed++;
    onProgress?.(processed, total);
  }

  const totalAfter = existingUris.size - deletedUris.length + newSongs.length;
  return { newCount: newSongs.length, deletedCount: deletedUris.length, totalAfter };
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
 * ENRICHMENT — ambil sampleRate, bitDepth, artwork via copy-to-cache.
 * Setelah dapat localUri dari getAssetInfoAsync, copy ke cache lalu extract.
 */
export async function runEnrichment(
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const tracks = LibraryScanner.getUnenrichedTracks(20); // batch kecil
  const total  = tracks.length;
  if (total === 0) {
    console.log('[DiffEngine] No tracks to enrich.');
    return 0;
  }

  console.log(`💎 [DiffEngine] Enriching ${total} tracks...`);
  let enriched = 0;

  for (const track of tracks) {
    const ext      = track.filename.split('.').pop()?.toLowerCase() ?? 'mp3';
    const cacheUri = `${FileSystem.cacheDirectory}enrich_${Date.now()}.${ext}`;

    try {
      // Dapat localUri dari MediaStore — bisa di-copy oleh FileSystem
      const assetId   = track.uri.split('/').pop() ?? '';
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      const localUri  = assetInfo.localUri ?? assetInfo.uri;

      if (!localUri) throw new Error('No localUri available');

      await FileSystem.copyAsync({ from: localUri, to: cacheUri });

      const meta = await getAudioMetadata(cacheUri);

      // Update title & artist dari ID3 tag jika lebih baik dari filename parse
      const id3Title  = (meta as any)?.title?.trim();
      const id3Artist = (meta as any)?.artist?.trim();
      const id3Album  = (meta as any)?.album?.trim();

      LibraryScanner.updateEnrichment(track.uri, {
        sampleRate: (meta as any)?.sampleRate ?? 0,
        bitDepth:   (meta as any)?.bitDepth   ?? 0,
        artwork:    (meta as any)?.artwork     ?? undefined,
        // Override title/artist/album jika ID3 punya data lebih baik
        title:  id3Title  && id3Title  !== '' ? id3Title  : undefined,
        artist: id3Artist && id3Artist !== '' ? id3Artist : undefined,
        album:  id3Album  && id3Album  !== '' ? id3Album  : undefined,
      });

      enriched++;
      onProgress?.(enriched, total);
    } catch (e) {
      console.warn(`[DiffEngine] Enrich failed for ${track.filename}:`, e);
      // Mark enriched agar tidak retry terus
      LibraryScanner.updateEnrichment(track.uri, { sampleRate: 0, bitDepth: 0 });
    } finally {
      try { await FileSystem.deleteAsync(cacheUri, { idempotent: true }); } catch {}
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
  const newAssets    = assets.filter(a => !existingUris.has(a.uri));
  const deletedUris  = [...existingUris].filter(uri => !currentUris.has(uri));

  console.log(`[DiffEngine][${source}] New: ${newAssets.length} | Deleted: ${deletedUris.length}`);

  if (deletedUris.length > 0) LibraryScanner.markAsDeleted(deletedUris);

  const total = newAssets.length;
  let processed = 0;

  for (const asset of newAssets) {
    try {
      const uri = source === 'mediastore'
        ? `content://media/external/audio/media/${asset.id}`
        : asset.uri;

      await LibraryScanner.saveToDatabase({
        uri,
        filename:   asset.filename,
        title:      _parseTitleFromFilename(asset.filename),
        artist:     _parseArtistFromFilename(asset.filename),
        album:      "Unknown Album",
        genre:      "Unknown Genre",
        folder:     source === 'saf'
          ? _extractFolder(asset.uri, 'saf')
          : _extractFolderFromFilename(asset.filename),
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
  } catch { return; }

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

// ─────────────────────────────────────────────────────────────
// PARSING HELPERS
// ─────────────────────────────────────────────────────────────

function _cleanNoise(str: string): string {
  let cleaned = str;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Hapus whitespace berlebih
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

function _parseArtistFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex  = withoutExt.indexOf(' - ');

  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();

    // Jika hanya angka → track number, bukan artist
    if (/^\d+$/.test(beforeDash)) return "Unknown Artist";

    // Jika terlalu panjang → kemungkinan bukan artist
    if (beforeDash.length > 50) return "Unknown Artist";

    return _cleanNoise(beforeDash);
  }

  return "Unknown Artist";
}

function _parseTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex  = withoutExt.indexOf(' - ');

  let raw: string;
  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();
    // Track number format: "01 - Title" atau "01. Title"
    if (/^\d+$/.test(beforeDash) || /^\d+\.$/.test(beforeDash)) {
      raw = withoutExt.substring(dashIndex + 3).trim();
    } else {
      // "Artist - Title" → ambil bagian title
      raw = withoutExt.substring(dashIndex + 3).trim();
    }
  } else {
    raw = withoutExt;
  }

  return _cleanNoise(raw);
}

function _extractFolder(uri: string, source: 'mediastore' | 'saf'): string {
  try {
    if (source === 'saf') {
      const parts = uri.split('%2F');
      parts.pop();
      return decodeURIComponent(parts[parts.length - 1] ?? 'Music');
    }
    return 'Music';
  } catch {
    return 'Music';
  }
}

// Heuristik folder dari nama file untuk MediaStore
// Contoh: "01 - Cinta Sebening Embun.mp3" → tidak bisa tahu folder
// Tapi kalau ada prefix album: "EBIET G ADE - Judul.mp3" → artist as folder
function _extractFolderFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "");
  const dashIndex  = withoutExt.indexOf(' - ');
  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();
    if (!/^\d+$/.test(beforeDash) && beforeDash.length <= 50) {
      return beforeDash; // pakai artist sebagai folder fallback
    }
  }
  return 'Music';
} 