/**
 * src/features/library/store/selectors.ts
 * Semua selector untuk Library Store - PristineAudio
 * Optimized for performance and type-safety.
 */

import { MediaTrack } from "./libraryStore";

// ─── KONSTANTA GLOBAL ───────────────────────────────────────────────────────

const LOSSLESS_CODECS = new Set(["FLAC", "ALAC", "WAV", "AIFF", "APE", "DSD"]);

/**
 * Helper untuk menangani metadata yang kosong atau null
 */
const fallback = (val: string | undefined | null, defaultVal: string) =>
  val && val.trim() !== "" ? val : defaultVal;

// ─── DATA GROUPING SELECTORS ────────────────────────────────────────────────

/**
 * Mengelompokkan lagu berdasarkan Album dan Artist
 */
export const selectAlbums = (tracks: MediaTrack[]) => {
  if (!tracks?.length) return [];

  const map = new Map<
    string,
    {
      id: string;
      name: string;
      artist: string;
      artwork?: string; // Pastikan ini konsisten
      artist_image_url?: string;
      count: number;
      year?: number;
      duration: number;
    }
  >();

  for (const t of tracks) {
    const albumName = fallback(t.album, "Unknown Album");
    const artistName = fallback(t.artist, "Unknown Artist");
    const key = `${albumName}__${artistName}`;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        id: key,
        name: albumName,
        artist: artistName,
        artist_image_url: t.artist_image_url,
        // AMBIL artwork dari track karena album_artwork null
        artwork: t.artwork,
        count: 1,
        year: t.year,
        duration: t.duration || 0,
      });
    } else {
      existing.count++;
      // Jika album belum punya artwork, ambil dari track yang punya
      if (!existing.artwork && t.artwork) {
        existing.artwork = t.artwork;
      }
      if (t.year && (!existing.year || t.year < existing.year)) {
        existing.year = t.year;
      }
      existing.duration += t.duration || 0;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Mengelompokkan lagu berdasarkan Artist
 */
export const selectArtists = (tracks: MediaTrack[]) => {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      trackCount: number;
      albums: Set<string>;
      artwork?: string;
      duration: number;
    }
  >();

  for (const t of tracks) {
    const name = fallback(t.artist, "Unknown Artist");
    let artist = map.get(name);

    if (!artist) {
      artist = {
        id: name,
        name,
        trackCount: 0,
        albums: new Set(),
        artwork: t.artwork,
        duration: 0,
      };
      map.set(name, artist);
    }

    artist.trackCount++;
    artist.duration += t.duration || 0;
    if (t.album) artist.albums.add(t.album);

    // Prioritas artwork: isEnriched (metadata online) > local artwork
    if ((!artist.artwork || t.isEnriched) && t.artwork) {
      artist.artwork = t.artwork;
    }
  }

  return Array.from(map.values())
    .map((a) => ({
      id: a.id,
      name: a.name,
      trackCount: a.trackCount,
      albumCount: a.albums.size,
      artwork: a.artwork,
      duration: a.duration,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Mengelompokkan berdasarkan Folder penyimpanan
 */
export const selectFolders = (tracks: MediaTrack[]) => {
  const map = new Map<
    string,
    {
      path: string;
      name: string;
      count: number;
      duration: number;
      artwork?: string;
    }
  >();

  for (const t of tracks) {
    const path = t.folder || "Music";
    const existing = map.get(path);

    if (!existing) {
      const parts = path.split(/[/\\]/);
      map.set(path, {
        path,
        name: parts[parts.length - 1] || "Music",
        count: 1,
        duration: t.duration || 0,
        artwork: t.artwork,
      });
    } else {
      existing.count++;
      existing.duration += t.duration || 0;
      if (!existing.artwork && t.artwork) existing.artwork = t.artwork;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Mengelompokkan berdasarkan Genre
 */
export const selectGenres = (tracks: MediaTrack[]) => {
  const map = new Map<
    string,
    { name: string; count: number; duration: number }
  >();

  for (const t of tracks) {
    const genre = fallback(t.genre, "Unknown Genre");
    const existing = map.get(genre);

    if (!existing) {
      map.set(genre, { name: genre, count: 1, duration: t.duration || 0 });
    } else {
      existing.count++;
      existing.duration += t.duration || 0;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

/**
 * Mengelompokkan berdasarkan tipe file / codec (Audiophile view)
 */
export const selectFileTypes = (tracks: MediaTrack[]) => {
  const map = new Map<
    string,
    {
      codec: string;
      count: number;
      duration: number;
      size: number;
      isLossless: boolean;
    }
  >();

  for (const t of tracks) {
    const codec = fallback(t.codec, "Unknown").toUpperCase();
    const existing = map.get(codec);

    if (!existing) {
      map.set(codec, {
        codec,
        count: 1,
        duration: t.duration || 0,
        size: t.fileSize || 0,
        isLossless: LOSSLESS_CODECS.has(codec),
      });
    } else {
      existing.count++;
      existing.duration += t.duration || 0;
      existing.size += t.fileSize || 0;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

// ─── FILTER SELECTORS ───────────────────────────────────────────────────────

export const selectUnenriched = (tracks: MediaTrack[]) =>
  tracks.filter((t) => !t.isEnriched);
export const selectEnriched = (tracks: MediaTrack[]) =>
  tracks.filter((t) => t.isEnriched);
export const selectHiResTracks = (tracks: MediaTrack[]) =>
  tracks.filter((t) => t.isHiRes);
export const selectFavorites = (tracks: MediaTrack[]) =>
  tracks.filter((t) => t.isFavorite);

export const selectRecentlyAdded = (tracks: MediaTrack[], limit = 20) =>
  [...tracks]
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, limit);

export const selectMostPlayed = (tracks: MediaTrack[], limit = 20) =>
  [...tracks]
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, limit);

// ─── STATS SELECTOR (OPTIMIZED ONE-PASS) ───────────────────────────────────

export const selectLibraryStats = (tracks: MediaTrack[]) => {
  const stats = {
    totalTracks: tracks.length,
    totalDuration: 0,
    totalSize: 0,
    losslessCount: 0,
    hiResCount: 0,
    enrichedCount: 0,
    artistsSet: new Set<string>(),
    albumsSet: new Set<string>(),
    genresSet: new Set<string>(),
  };

  for (const t of tracks) {
    stats.totalDuration += t.duration || 0;
    stats.totalSize += t.fileSize || 0;

    if (t.isHiRes) stats.hiResCount++;
    if (t.isEnriched) stats.enrichedCount++;
    if (t.codec && LOSSLESS_CODECS.has(t.codec.toUpperCase()))
      stats.losslessCount++;

    if (t.artist) stats.artistsSet.add(t.artist);
    if (t.album) stats.albumsSet.add(t.album);
    if (t.genre) stats.genresSet.add(t.genre);
  }

  return {
    totalTracks: stats.totalTracks,
    totalDuration: stats.totalDuration,
    totalSize: stats.totalSize,
    losslessCount: stats.losslessCount,
    hiResCount: stats.hiResCount,
    enrichedCount: stats.enrichedCount,
    unenrichedCount: stats.totalTracks - stats.enrichedCount,
    artistsCount: stats.artistsSet.size,
    albumsCount: stats.albumsSet.size,
    genresCount: stats.genresSet.size,
  };
};
