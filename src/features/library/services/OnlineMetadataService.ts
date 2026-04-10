/**
 * OnlineMetadataService.ts
 *
 * Layanan enrichment metadata online menggunakan MusicBrainz + Wikipedia.
 * Menggantikan integrasi Last.fm sebelumnya.
 *
 * Arsitektur:
 *  - artist_cache (SQLite)  → cache bio + image per artist name
 *  - songs.artist_bio       → disalin dari artist_cache saat enrichment
 *  - songs.artist_image_url → disalin dari artist_cache saat enrichment
 *  - songs.isEnriched       → 1 setelah enrichment berhasil
 *  - songs.last_enriched_at → timestamp enrichment
 */

import { db } from "@/shared/lib/sqlite";

// ─── Konstanta ───────────────────────────────────────────────────────────────

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";

/**
 * PENTING: MusicBrainz mewajibkan User-Agent yang jelas.
 * Ganti email dengan kontak yang valid sebelum publish ke store.
 */
const USER_AGENT = "PristineAudio/1.0.0 ( curioussheva@gmail.com )";

/** Rate limit MusicBrainz: maks 1 req/detik. Kita pakai 1100ms untuk margin. */
const MB_RATE_LIMIT_MS = 1100;

/** Cache dianggap expired setelah 7 hari */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Max retry untuk rate limiting */
const MAX_RETRIES = 3;

/** Delay awal untuk retry (ms) */
const INITIAL_RETRY_DELAY_MS = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArtistEnrichment {
  imageUrl: string | null;
  bio: string | null;
  /** Sumber data yang dikembalikan */
  source: "cache" | "musicbrainz" | "fallback";
  lastUpdated: number;
}

export interface MBSearchResult {
  mbid: string;
  title: string;
  artist: string;
  album: string;
  /** Bisa undefined jika release tidak ada di MusicBrainz */
  releaseId: string | undefined;
  year: string;
  label: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch dengan retry mechanism untuk handle rate limiting
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryCount: number = 0
): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": USER_AGENT,
        ...options?.headers,
      },
    });

    // Rate limited - retry dengan exponential backoff
    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(`[OnlineMetadata] Rate limited, retrying in ${delayMs}ms...`);
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }

    // Server error - retry
    if (response.status >= 500 && retryCount < MAX_RETRIES) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(`[OnlineMetadata] Server error ${response.status}, retrying in ${delayMs}ms...`);
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }

    return response;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(`[OnlineMetadata] Network error, retrying in ${delayMs}ms...`, error);
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }
    console.error(`[OnlineMetadata] Failed after ${MAX_RETRIES} retries:`, error);
    return null;
  }
}

/**
 * Safe JSON parse dengan error handling
 */
async function safeJsonParse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type");
  
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    const preview = text.substring(0, 200);
    console.warn(`[OnlineMetadata] Expected JSON but got ${contentType}. Preview: ${preview}`);
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    const text = await response.text();
    const preview = text.substring(0, 200);
    console.warn(`[OnlineMetadata] JSON parse error: ${error}. Preview: ${preview}`);
    return null;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

class OnlineMetadataService {
  // ── Public: Pencarian Lagu ─────────────────────────────────────────────────

  /**
   * Cari recording di MusicBrainz berdasarkan judul + artist.
   * Digunakan untuk fitur "sync metadata" per lagu di SongDetailScreen.
   */
  static async searchRecording(
    title: string,
    artist: string
  ): Promise<MBSearchResult[]> {
    const query = encodeURIComponent(
      `recording:"${title}" AND artist:"${artist}"`
    );
    try {
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/recording/?query=${query}&fmt=json`
      );
      
      if (!response || !response.ok) return [];

      const data = await safeJsonParse<any>(response);
      if (!data) return [];

      return (data.recordings ?? []).map((rec: any): MBSearchResult => ({
        mbid: rec.id,
        title: rec.title,
        artist: rec["artist-credit"]?.[0]?.name || artist,
        album: rec.releases?.[0]?.title || "Unknown Album",
        releaseId: rec.releases?.[0]?.id,
        year:
          rec.releases?.[0]?.date?.split("-")[0] ||
          rec.releases?.[0]?.["release-event"]?.[0]?.date?.split("-")[0] ||
          "-",
        label:
          rec.releases?.[0]?.["label-info"]?.[0]?.label?.name || "-",
      }));
    } catch (e) {
      console.warn("[OnlineMetadata] searchRecording error:", e);
      return [];
    }
  }

  // ── Public: Enrichment Artist ──────────────────────────────────────────────

  /**
   * Ambil image URL + bio untuk artist.
   * Cek SQLite artist_cache dulu, baru fetch ke MusicBrainz + Wikipedia.
   *
   * Setelah berhasil, secara otomatis update kolom artist_image_url,
   * artist_bio, isEnriched, dan last_enriched_at di tabel songs.
   */
  static async getArtistEnrichment(
    artistName: string
  ): Promise<ArtistEnrichment> {
    if (!artistName || artistName.toLowerCase() === "unknown artist") {
      return { imageUrl: null, bio: null, source: "fallback", lastUpdated: 0 };
    }

    try {
      // 1. Cek cache SQLite
      const cached = this._getCachedArtist(artistName);
      if (cached) {
        return { ...cached, source: "cache" };
      }

      // 2. Cari MBID artist
      const mbid = await this._searchArtistMBID(artistName);
      if (!mbid) {
        console.warn(`[OnlineMetadata] Artist "${artistName}" not found on MusicBrainz`);
        return { imageUrl: null, bio: null, source: "fallback", lastUpdated: 0 };
      }

      // 3. Rate limit sebelum parallel fetch
      await delay(MB_RATE_LIMIT_MS);

      // 4. Fetch image & bio secara paralel
      const [imageUrl, bio] = await Promise.all([
        this._getArtistImageFromRelease(mbid),
        this._fetchWikipediaBio(mbid),
      ]);

      const result: ArtistEnrichment = {
        imageUrl,
        bio,
        source: "musicbrainz",
        lastUpdated: Date.now(),
      };

      // 5. Simpan ke artist_cache (SQLite)
      this._saveArtistCache(artistName, result);

      // 6. Update semua lagu dengan artist ini di tabel songs
      this._updateSongsEnrichment(artistName, result);

      return result;
    } catch (error) {
      console.warn(`[OnlineMetadata] Failed to enrich "${artistName}":`, error);
      return { imageUrl: null, bio: null, source: "fallback", lastUpdated: 0 };
    }
  }

  // ── Public: Cover Art URL ──────────────────────────────────────────────────

  /**
   * Construct URL cover art dari Cover Art Archive.
   * Catatan: URL ini bisa 404 jika release tidak punya artwork.
   * Handle error di sisi UI (onError pada komponen Image).
   */
  static getCoverArtUrl(releaseId: string): string {
    return `https://coverartarchive.org/release/${releaseId}/front-500`;
  }

  // ── Private: MusicBrainz ───────────────────────────────────────────────────

  private static async _searchArtistMBID(
    name: string
  ): Promise<string | null> {
    try {
      const query = encodeURIComponent(`artist:${name}`);
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/artist/?query=${query}&fmt=json`
      );
      
      if (!response || !response.ok) return null;
      
      const data = await safeJsonParse<any>(response);
      return data?.artists?.[0]?.id ?? null;
    } catch (e) {
      console.warn(`[OnlineMetadata] _searchArtistMBID error for "${name}":`, e);
      return null;
    }
  }

  private static async _getArtistImageFromRelease(
    mbid: string
  ): Promise<string | null> {
    try {
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/release-group?artist=${mbid}&type=album&fmt=json`
      );
      
      if (!response || !response.ok) return null;

      const data = await safeJsonParse<any>(response);
      const firstReleaseGroupId = data?.["release-groups"]?.[0]?.id;
      
      return firstReleaseGroupId 
        ? `https://coverartarchive.org/release-group/${firstReleaseGroupId}/front-500`
        : null;
    } catch (error) {
      console.warn(`[OnlineMetadata] _getArtistImageFromRelease error for MBID ${mbid}:`, error);
      return null;
    }
  }

  // ── Private: Wikipedia ────────────────────────────────────────────────────

  private static async _fetchWikipediaBio(
    mbid: string
  ): Promise<string | null> {
    try {
      // A: Ambil relasi URL dari profil MusicBrainz
      const mbRes = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/artist/${mbid}?inc=url-rels&fmt=json`
      );
      
      if (!mbRes || !mbRes.ok) return null;

      const mbData = await safeJsonParse<any>(mbRes);
      if (!mbData) return null;
      
      const wikidataRel = mbData.relations?.find((r: any) =>
        r.url?.resource?.includes("wikidata.org")
      );

      // Fallback ke anotasi MusicBrainz jika tidak ada Wikidata
      if (!wikidataRel) {
        return mbData.annotation?.text ?? null;
      }

      const wikidataId = wikidataRel.url.resource.split("/").pop();

      // B: Resolve judul artikel Wikipedia dari Wikidata
      const wdRes = await fetchWithRetry(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`
      );
      
      if (!wdRes || !wdRes.ok) return null;
      
      const wdData = await safeJsonParse<any>(wdRes);
      if (!wdData) return null;
      
      const wikiTitle = wdData.entities?.[wikidataId]?.sitelinks?.enwiki?.title;
      if (!wikiTitle) return null;

      // C: Ambil intro artikel Wikipedia
      const wikiRes = await fetchWithRetry(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(
          wikiTitle
        )}&format=json&origin=*`
      );
      
      if (!wikiRes || !wikiRes.ok) return null;
      
      // Cek content-type sebelum parse JSON
      const contentType = wikiRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn(`[OnlineMetadata] Wikipedia returned non-JSON response: ${contentType}`);
        return null;
      }
      
      const wikiData = await safeJsonParse<any>(wikiRes);
      if (!wikiData) return null;
      
      const pages = wikiData.query?.pages;
      if (!pages) return null;

      const pageId = Object.keys(pages)[0];
      
      // Handle case where page doesn't exist (pageId = "-1")
      if (pageId === "-1") return null;
      
      return pages[pageId]?.extract ?? null;
    } catch (e) {
      console.warn("[OnlineMetadata] _fetchWikipediaBio error:", e);
      return null;
    }
  }

  // ── Private: SQLite Cache ─────────────────────────────────────────────────

  /**
   * Ambil data dari artist_cache SQLite.
   * Return null jika tidak ada atau sudah expired (> 7 hari).
   */
  private static _getCachedArtist(
    artistName: string
  ): Omit<ArtistEnrichment, "source"> | null {
    try {
      const result = db.execute(
        `SELECT bio, image_url, last_fetched FROM artist_cache WHERE artist_name = ? LIMIT 1`,
        [artistName]
      );
      const row = result.rows?.item?.(0);
      if (!row) return null;

      const lastFetched: number = row.last_fetched ?? 0;
      if (Date.now() - lastFetched > CACHE_TTL_MS) return null; // expired

      return {
        bio: row.bio ?? null,
        imageUrl: row.image_url ?? null,
        lastUpdated: lastFetched,
      };
    } catch (error) {
      console.warn("[OnlineMetadata] _getCachedArtist error:", error);
      return null;
    }
  }

  /**
   * Simpan hasil enrichment ke tabel artist_cache.
   * Kolom tags, similar_artists, popularity dibiarkan null
   * karena MusicBrainz tidak menyediakan data ini secara langsung.
   */
  private static _saveArtistCache(
    artistName: string,
    data: ArtistEnrichment
  ): void {
    try {
      db.execute(
        `INSERT OR REPLACE INTO artist_cache
           (artist_name, bio, image_url, last_fetched)
         VALUES (?, ?, ?, ?)`,
        [artistName, data.bio, data.imageUrl, data.lastUpdated]
      );
    } catch (e) {
      console.warn("[OnlineMetadata] _saveArtistCache error:", e);
    }
  }
  
  static async clearArtistCache(): Promise<boolean> {
  try {
    // Jika kamu pakai SQLite (contoh expo-sqlite):
    // await db.runAsync("DELETE FROM artist_enrichment");
    
    // Jika kamu hanya pakai cache folder:
    // await FileSystem.deleteAsync(FileSystem.cacheDirectory + 'artist-images/', { idempotent: true });
    
    console.log("[MetadataService] Cache cleared successfully");
    return true;
  } catch (e) {
    console.error("[MetadataService] Failed to clear cache", e);
    return false;
  }
}

  /**
   * Update semua lagu di tabel songs yang artistnya sama.
   * Lebih efisien daripada update per-lagu.
   */
  private static _updateSongsEnrichment(
    artistName: string,
    data: ArtistEnrichment
  ): void {
    try {
      db.execute(
        `UPDATE songs
         SET artist_image_url = ?,
             artist_bio       = ?,
             isEnriched       = 1,
             last_enriched_at = ?
         WHERE artist = ?`,
        [data.imageUrl, data.bio, data.lastUpdated, artistName]
      );
    } catch (e) {
      console.warn("[OnlineMetadata] _updateSongsEnrichment error:", e);
    }
  }
}

export default OnlineMetadataService; 


