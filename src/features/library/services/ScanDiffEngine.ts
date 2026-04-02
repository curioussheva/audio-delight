import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { getAudioMetadata } from "@missingcore/audio-metadata";
import { LibraryScanner } from "@/features/library/api/scanner";
import { MediaStore, NativeSong } from "../native/MediaStoreModule";

const SAF = FileSystem.StorageAccessFramework;

const SUPPORTED_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "wav",
  "aac",
  "ogg",
  "opus",
  "dsf",
  "dsd",
  "dff",
  "alac",
]);

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
  onProgress?: (current: number, total: number) => void,
): Promise<DiffResult> {
  let nativeSongs: NativeSong[];

  try {
    nativeSongs = await MediaStore.queryAudioFiles();
    console.log(
      `[DiffEngine] MediaStore native query: ${nativeSongs.length} songs`,
    );
  } catch (e) {
    console.warn(
      "[DiffEngine] Native MediaStore failed, fallback to expo-media-library:",
      e,
    );
    return _runFallbackDiff(onProgress);
  }

  const currentUris = new Set(nativeSongs.map((s) => s.uri));
  const existingUris = LibraryScanner.getExistingUris();
  const newSongs = nativeSongs.filter((s) => !existingUris.has(s.uri));
  const deletedUris = [...existingUris].filter((uri) => !currentUris.has(uri));

  console.log(
    `[DiffEngine][native] New: ${newSongs.length} | Deleted: ${deletedUris.length}`,
  );

  if (deletedUris.length > 0) LibraryScanner.markAsDeleted(deletedUris);

  const total = newSongs.length;
  let processed = 0;

  for (const song of newSongs) {
    try {
      await LibraryScanner.saveToDatabase({
        uri: song.uri,
        filename: song.filename,
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: song.genre ?? "Unknown Genre",
        folder: song.folder,
        duration: Math.floor(song.duration),
        codec: song.codec,
        artwork: song.artworkUri,
        fileSize: song.fileSize,
        dateAdded: song.dateAdded,
        isEnriched: false,
        year: song.year > 0 ? song.year : undefined,
        trackNumber: song.trackNumber > 0 ? song.trackNumber : undefined,
      });
    } catch (e) {
      console.warn(`[DiffEngine] Insert failed for ${song.filename}:`, e);
    }

    processed++;
    onProgress?.(processed, total);
  }

  const totalAfter = existingUris.size - deletedUris.length + newSongs.length;
  return {
    newCount: newSongs.length,
    deletedCount: deletedUris.length,
    totalAfter,
  };
}

export async function runSAFDiff(
  directoryUri: string,
  onProgress?: (current: number, total: number) => void,
): Promise<DiffResult> {
  const allFiles: Array<{ uri: string; filename: string }> = [];
  const visited = new Set<string>();
  await _collectSAFFiles(directoryUri, allFiles, visited);

  const currentUris = new Set(allFiles.map((f) => f.uri));
  const assets = allFiles.map((f) => ({
    uri: f.uri,
    filename: f.filename,
    id: f.uri,
    mediaType: "audio" as const,
    width: 0,
    height: 0,
    creationTime: Date.now(),
    modificationTime: Date.now(),
    duration: 0,
    albumId: "",
  }));

  return await _applyDiff(currentUris, assets, "saf", onProgress);
}

export async function runEnrichment(
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const tracks = LibraryScanner.getUnenrichedTracks(20);
  const total = tracks.length;
  if (total === 0) {
    console.log("[DiffEngine] No tracks to enrich.");
    return 0;
  }

  console.log(`💎 [DiffEngine] Enriching ${total} tracks...`);
  let enriched = 0;

  for (const track of tracks) {
    const ext = track.filename.split(".").pop()?.toLowerCase() ?? "mp3";
    const cacheUri = `${FileSystem.cacheDirectory}enrich_${Date.now()}.${ext}`;

    try {
      const assetId = track.uri.split("/").pop() ?? "";
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      const localUri = assetInfo.localUri ?? assetInfo.uri;

      if (!localUri) throw new Error("No localUri available");

      await FileSystem.copyAsync({ from: localUri, to: cacheUri });
      const meta = await getAudioMetadata(cacheUri);

      const id3Title = (meta as any)?.title?.trim();
      const id3Artist = (meta as any)?.artist?.trim();
      const id3Album = (meta as any)?.album?.trim();
      const id3Genre = (meta as any)?.genre?.trim();

      LibraryScanner.updateEnrichment(track.uri, {
        sampleRate: (meta as any)?.sampleRate ?? 0,
        bitDepth: (meta as any)?.bitDepth ?? 0,
        artwork: (meta as any)?.artwork ?? undefined,
        title: id3Title && id3Title !== "" ? id3Title : undefined,
        artist: id3Artist && id3Artist !== "" ? id3Artist : undefined,
        album: id3Album && id3Album !== "" ? id3Album : undefined,
        genre:
          id3Genre && id3Genre !== "" && id3Genre !== "Unknown Genre"
            ? id3Genre
            : undefined,
      });

      enriched++;
      onProgress?.(enriched, total);
    } catch (e) {
      console.warn(`[DiffEngine] Enrich failed for ${track.filename}:`, e);
      LibraryScanner.updateEnrichment(track.uri, {
        sampleRate: 0,
        bitDepth: 0,
      });
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
// FALLBACK — expo-media-library jika native module gagal
// ─────────────────────────────────────────────────────────────

async function _runFallbackDiff(
  onProgress?: (current: number, total: number) => void,
): Promise<DiffResult> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted)
    return { newCount: 0, deletedCount: 0, totalAfter: 0 };

  const currentUris = new Set<string>();
  const currentAssets: MediaLibrary.Asset[] = [];
  let after: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "audio",
      first: 200,
      after,
    });
    for (const asset of page.assets) {
      const ext = asset.filename.split(".").pop()?.toLowerCase() ?? "";
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        const contentUri = `content://media/external/audio/media/${asset.id}`;
        currentUris.add(contentUri);
        currentAssets.push({ ...asset, uri: contentUri });
      }
    }
    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  return await _applyDiff(currentUris, currentAssets, "mediastore", onProgress);
}

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

async function _applyDiff(
  currentUris: Set<string>,
  assets: MediaLibrary.Asset[],
  source: "mediastore" | "saf",
  onProgress?: (current: number, total: number) => void,
): Promise<DiffResult> {
  const existingUris = LibraryScanner.getExistingUris();
  const newAssets = assets.filter((a) => !existingUris.has(a.uri));
  const deletedUris = [...existingUris].filter((uri) => !currentUris.has(uri));

  console.log(
    `[DiffEngine][${source}] New: ${newAssets.length} | Deleted: ${deletedUris.length}`,
  );

  if (deletedUris.length > 0) LibraryScanner.markAsDeleted(deletedUris);

  const total = newAssets.length;
  let processed = 0;

  for (const asset of newAssets) {
    try {
      const uri =
        source === "mediastore"
          ? `content://media/external/audio/media/${asset.id}`
          : asset.uri;

      await LibraryScanner.saveToDatabase({
        uri,
        filename: asset.filename,
        title: _parseTitleFromFilename(asset.filename),
        artist: _parseArtistFromFilename(asset.filename),
        album: "Unknown Album",
        genre: "Unknown Genre",
        folder:
          source === "saf"
            ? _extractFolder(asset.uri, "saf")
            : _extractFolderFromFilename(asset.filename),
        duration: Math.floor(asset.duration ?? 0),
        codec: asset.filename.split(".").pop()?.toUpperCase() ?? "UNKNOWN",
        isEnriched: false,
        dateAdded: asset.creationTime ?? Date.now(),
      });
    } catch (e) {
      console.warn(`[DiffEngine] Insert failed for ${asset.filename}:`, e);
    }

    processed++;
    onProgress?.(processed, total);
  }

  const totalAfter = existingUris.size - deletedUris.length + newAssets.length;
  return {
    newCount: newAssets.length,
    deletedCount: deletedUris.length,
    totalAfter,
  };
}

async function _collectSAFFiles(
  uri: string,
  result: Array<{ uri: string; filename: string }>,
  visited: Set<string>,
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
    const ext = entryUri.split(".").pop()?.toLowerCase() ?? "";
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      const parts = entryUri.split("/");
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
  for (const pattern of NOISE_PATTERNS) cleaned = cleaned.replace(pattern, "");
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function _parseArtistFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");
  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();
    if (/^\d+$/.test(beforeDash)) return "Unknown Artist";
    if (beforeDash.length > 50) return "Unknown Artist";
    return _cleanNoise(beforeDash);
  }
  return "Unknown Artist";
}

function _parseTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");
  let raw: string;
  if (dashIndex > 0) {
    raw = withoutExt.substring(dashIndex + 3).trim();
  } else {
    raw = withoutExt;
  }
  return _cleanNoise(raw);
}

function _extractFolder(uri: string, source: "mediastore" | "saf"): string {
  try {
    if (source === "saf") {
      const parts = uri.split("%2F");
      parts.pop();
      return decodeURIComponent(parts[parts.length - 1] ?? "Music");
    }
    return "Music";
  } catch {
    return "Music";
  }
}

function _extractFolderFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, "");
  const dashIndex = withoutExt.indexOf(" - ");
  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();
    if (!/^\d+$/.test(beforeDash) && beforeDash.length <= 50) return beforeDash;
  }
  return "Music";
}
