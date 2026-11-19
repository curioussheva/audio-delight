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
import { useLibraryStore } from "../store/libraryStore";

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
  retryCount: number = 0,
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
      console.warn(
        `[OnlineMetadata] Rate limited, retrying in ${delayMs}ms...`,
      );
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }

    // Server error - retry
    if (response.status >= 500 && retryCount < MAX_RETRIES) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(
        `[OnlineMetadata] Server error ${response.status}, retrying in ${delayMs}ms...`,
      );
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }

    return response;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(
        `[OnlineMetadata] Network error, retrying in ${delayMs}ms...`,
        error,
      );
      await delay(delayMs);
      return fetchWithRetry(url, options, retryCount + 1);
    }
    console.error(
      `[OnlineMetadata] Failed after ${MAX_RETRIES} retries:`,
      error,
    );
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
    console.warn(
      `[OnlineMetadata] Expected JSON but got ${contentType}. Preview: ${preview}`,
    );
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    const text = await response.text();
    const preview = text.substring(0, 200);
    console.warn(
      `[OnlineMetadata] JSON parse error: ${error}. Preview: ${preview}`,
    );
    return null;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

class OnlineMetadataService {
  /**
   * U-P2-06: dedup request enrichment yang sedang berjalan, per nama
   * artis (normalisasi lowercase + trim). Tanpa ini setiap ArtistRow
   * tanpa artwork menembak request MusicBrainz + Wikipedia sendiri —
   * dua baris artis yang sama, atau remount saat scroll cepat, berarti
   * dua rangkaian request identik. Cache SQLite 7 hari sudah ada
   * (_getCachedArtist) untuk request yang SUDAH selesai; map ini untuk
   * yang sedang BERJALAN. Entri dihapus saat promise settle.
   */
  private static _enrichmentInFlight = new Map<
    string,
    Promise<ArtistEnrichment>
  >();

  // ── Public: Pencarian Lagu ─────────────────────────────────────────────────

  /**
   * Cari recording di MusicBrainz berdasarkan judul + artist.
   * Digunakan untuk fitur "sync metadata" per lagu di SongDetailScreen.
   */
  static async searchRecording(
    title: string,
    artist: string,
  ): Promise<MBSearchResult[]> {
    const query = encodeURIComponent(
      `recording:"${title}" AND artist:"${artist}"`,
    );
    try {
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/recording/?query=${query}&fmt=json`,
      );

      // U-P1-41: gagal jaringan / jawaban tak valid DILEMPAR, bukan [] —
      // dulu ketiganya kembali sebagai [] sehingga UI tidak bisa membedakan
      // "tidak ditemukan" dari "error". [] hanya untuk hasil yang memang
      // kosong (recordings kosong).
      if (!response || !response.ok) {
        throw new Error(
          `MusicBrainz menjawab ${response?.status ?? "tanpa respons"}`,
        );
      }

      const data = await safeJsonParse<any>(response);
      if (!data) throw new Error("Gagal membaca jawaban MusicBrainz");

      return (data.recordings ?? []).map(
        (rec: any): MBSearchResult => ({
          mbid: rec.id,
          title: rec.title,
          artist: rec["artist-credit"]?.[0]?.name || artist,
          album: rec.releases?.[0]?.title || "Unknown Album",
          releaseId: rec.releases?.[0]?.id,
          year:
            rec.releases?.[0]?.date?.split("-")[0] ||
            rec.releases?.[0]?.["release-event"]?.[0]?.date?.split("-")[0] ||
            "-",
          label: rec.releases?.[0]?.["label-info"]?.[0]?.label?.name || "-",
        }),
      );
    } catch (e) {
      console.warn("[OnlineMetadata] searchRecording error:", e);
      throw e;
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
    artistName: string,
  ): Promise<ArtistEnrichment> {
    if (!artistName || artistName.toLowerCase() === "unknown artist") {
      return { imageUrl: null, bio: null, source: "fallback", lastUpdated: 0 };
    }

    // U-P2-06: gabung dengan request yang sedang berjalan untuk artis
    // yang sama — pemanggil kedua mendapat promise yang sama, bukan
    // request jaringan kedua.
    const key = artistName.trim().toLowerCase();
    const inFlight = this._enrichmentInFlight.get(key);
    if (inFlight) return inFlight;

    const promise = this._enrichArtist(artistName).finally(() => {
      if (this._enrichmentInFlight.get(key) === promise) {
        this._enrichmentInFlight.delete(key);
      }
    });
    this._enrichmentInFlight.set(key, promise);
    return promise;
  }

  /**
   * Pekerja enrichment yang sebenarnya (cache SQLite → MusicBrainz +
   * Wikipedia). Selalu resolve — gagal jaringan / tidak ditemukan
   * mengembalikan fallback, bukan throw.
   */
  private static async _enrichArtist(
    artistName: string,
  ): Promise<ArtistEnrichment> {
    try {
      // 1. Cek cache SQLite
      const cached = this._getCachedArtist(artistName);
      if (cached) {
        return { ...cached, source: "cache" };
      }

      // 2. Cari MBID artist
      const mbid = await this._searchArtistMBID(artistName);
      if (!mbid) {
        console.warn(
          `[OnlineMetadata] Artist "${artistName}" not found on MusicBrainz`,
        );
        return {
          imageUrl: null,
          bio: null,
          source: "fallback",
          lastUpdated: 0,
        };
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

  private static async _searchArtistMBID(name: string): Promise<string | null> {
    try {
      const query = encodeURIComponent(`artist:${name}`);
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/artist/?query=${query}&fmt=json`,
      );

      if (!response || !response.ok) return null;

      const data = await safeJsonParse<any>(response);
      return data?.artists?.[0]?.id ?? null;
    } catch (e) {
      console.warn(
        `[OnlineMetadata] _searchArtistMBID error for "${name}":`,
        e,
      );
      return null;
    }
  }

  private static async _getArtistImageFromRelease(
    mbid: string,
  ): Promise<string | null> {
    try {
      const response = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/release-group?artist=${mbid}&type=album&fmt=json`,
      );

      if (!response || !response.ok) return null;

      const data = await safeJsonParse<any>(response);
      const firstReleaseGroupId = data?.["release-groups"]?.[0]?.id;

      return firstReleaseGroupId
        ? `https://coverartarchive.org/release-group/${firstReleaseGroupId}/front-500`
        : null;
    } catch (error) {
      console.warn(
        `[OnlineMetadata] _getArtistImageFromRelease error for MBID ${mbid}:`,
        error,
      );
      return null;
    }
  }

  // ── Private: Wikipedia ────────────────────────────────────────────────────

  private static async _fetchWikipediaBio(
    mbid: string,
  ): Promise<string | null> {
    try {
      // A: Ambil relasi URL dari profil MusicBrainz
      const mbRes = await fetchWithRetry(
        `${MUSICBRAINZ_BASE}/artist/${mbid}?inc=url-rels&fmt=json`,
      );

      if (!mbRes || !mbRes.ok) return null;

      const mbData = await safeJsonParse<any>(mbRes);
      if (!mbData) return null;

      const wikidataRel = mbData.relations?.find((r: any) =>
        r.url?.resource?.includes("wikidata.org"),
      );

      // Fallback ke anotasi MusicBrainz jika tidak ada Wikidata
      if (!wikidataRel) {
        return mbData.annotation?.text ?? null;
      }

      const wikidataId = wikidataRel.url.resource.split("/").pop();

      // B: Resolve judul artikel Wikipedia dari Wikidata
      const wdRes = await fetchWithRetry(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`,
      );

      if (!wdRes || !wdRes.ok) return null;

      const wdData = await safeJsonParse<any>(wdRes);
      if (!wdData) return null;

      const wikiTitle = wdData.entities?.[wikidataId]?.sitelinks?.enwiki?.title;
      if (!wikiTitle) return null;

      // C: Ambil intro artikel Wikipedia
      const wikiRes = await fetchWithRetry(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(
          wikiTitle,
        )}&format=json&origin=*`,
      );

      if (!wikiRes || !wikiRes.ok) return null;

      // Cek content-type sebelum parse JSON
      const contentType = wikiRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn(
          `[OnlineMetadata] Wikipedia returned non-JSON response: ${contentType}`,
        );
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
    artistName: string,
  ): Omit<ArtistEnrichment, "source"> | null {
    try {
      const result = db.execute(
        `SELECT bio, image_url, last_fetched FROM artist_cache WHERE artist_name = ? LIMIT 1`,
        [artistName],
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
    data: ArtistEnrichment,
  ): void {
    try {
      db.execute(
        `INSERT OR REPLACE INTO artist_cache
           (artist_name, bio, image_url, last_fetched)
         VALUES (?, ?, ?, ?)`,
        [artistName, data.bio, data.imageUrl, data.lastUpdated],
      );
    } catch (e) {
      console.warn("[OnlineMetadata] _saveArtistCache error:", e);
    }
  }

  /**
   * Kosongkan cache GAMBAR artis — bio (teks "Tentang Artis") TIDAK
   * disentuh. Kolom gambar dan bio terpisah di kedua tabel, jadi
   * pemisahan tidak butuh migrasi. Gambar artis tidak pernah diunduh
   * ke disk (hanya URL remote dari Cover Art Archive yang dirender
   * <Image> di [id].tsx) — jadi cukup DB + store, tanpa FileSystem.
   *
   * Tiga tempat yang disentuh:
   *  1. artist_cache.image_url — tabel cache sumber (bio utuh).
   *  2. songs.artist_image_url — salinan di tabel songs; [id].tsx dan
   *     Analyzer membaca dari sini, bukan dari artist_cache. Tanpa
   *     ini tombolnya tidak terlihat efeknya.
   *  3. libraryStore.tracks di memori — [id].tsx membaca song dari
   *     store, bukan dari DB. Satu setTracks (bukan per lagu) supaya
   *     satu render; persist zustand ikut menyimpan keadaan kosong
   *     ini, jadi gambar tetap hilang sesudah restart.
   *
   * Catatan perilaku: baris artist_cache yang image_url-nya kini NULL
   * tetap dianggap cache hit oleh _getCachedArtist (selama belum
   * expired 7 hari) — enrichment berikutnya mengembalikan bio dari
   * cache tanpa menembak ulang foto; foto baru hanya datang dari
   * enrichment manual berikutnya yang melewati TTL.
   */
  static async clearArtistCache(): Promise<boolean> {
    try {
      const cacheCleared =
        db.execute(
          `UPDATE artist_cache SET image_url = NULL WHERE image_url IS NOT NULL`,
        ).rowsAffected ?? 0;

      const songsCleared =
        db.execute(
          `UPDATE songs SET artist_image_url = NULL WHERE artist_image_url IS NOT NULL`,
        ).rowsAffected ?? 0;

      const { tracks, setTracks } = useLibraryStore.getState();
      let storeCleared = 0;
      if (tracks.some((t) => t.artist_image_url)) {
        setTracks(
          tracks.map((t) => {
            if (!t.artist_image_url) return t;
            storeCleared++;
            return { ...t, artist_image_url: undefined };
          }),
        );
      }

      console.log(
        `[OnlineMetadata] Artist image cache cleared: ${cacheCleared} artist_cache, ${songsCleared} songs, ${storeCleared} in-memory tracks (bio dipertahankan)`,
      );
      return true;
    } catch (e) {
      console.error("[OnlineMetadata] Failed to clear artist image cache", e);
      return false;
    }
  }

  /**
   * Update semua lagu di tabel songs yang artistnya sama.
   * Lebih efisien daripada update per-lagu.
   */
  private static _updateSongsEnrichment(
    artistName: string,
    data: ArtistEnrichment,
  ): void {
    try {
      db.execute(
        `UPDATE songs
         SET artist_image_url = ?,
             artist_bio       = ?,
             isEnriched       = 1,
             last_enriched_at = ?
         WHERE artist = ?`,
        [data.imageUrl, data.bio, data.lastUpdated, artistName],
      );
    } catch (e) {
      console.warn("[OnlineMetadata] _updateSongsEnrichment error:", e);
    }
  }
}

export default OnlineMetadataService;
