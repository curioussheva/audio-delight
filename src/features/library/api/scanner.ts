import { db } from "@/shared/lib/sqlite";
import { Song } from "@/shared/types/audio";

export class LibraryScanner {
  // ── ID Generation ──────────────────────────────────────────
  private static uriToId(uri: string): string {
    let hash = 5381;
    for (let i = 0; i < uri.length; i++) {
      hash = (hash * 33) ^ uri.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  // ── Save / Upsert ──────────────────────────────────────────
  /**
   * INSERT jika baru, UPDATE metadata jika sudah ada.
   * TIDAK overwrite playCount dan isFavorite yang sudah ada.
   */
  static async saveToDatabase(track: {
    id?: string;
    uri: string;
    filename: string;
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    folder?: string;
    artwork?: string;
    duration?: number;
    sampleRate?: number;
    bitDepth?: number;
    codec?: string;
    bitrate?: number;
    fileSize?: number;
    isEnriched?: boolean;
    dateAdded?: number;
  }): Promise<void> {
    const id = track.id || LibraryScanner.uriToId(track.uri);
    const now = Date.now();

    db.execute(
      `INSERT INTO songs (
        id, title, artist, album, genre, folder, filename,
        uri, artwork, duration, sampleRate, bitDepth,
        codec, bitrate, fileSize, isEnriched,
        dateAdded, lastSeenAt,
        playCount, isFavorite
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(uri) DO UPDATE SET
        title      = excluded.title,
        artist     = excluded.artist,
        album      = excluded.album,
        genre      = excluded.genre,
        folder     = excluded.folder,
        filename   = excluded.filename,
        artwork    = excluded.artwork,
        duration   = excluded.duration,
        sampleRate = excluded.sampleRate,
        bitDepth   = excluded.bitDepth,
        codec      = excluded.codec,
        bitrate    = excluded.bitrate,
        fileSize   = excluded.fileSize,
        isEnriched = excluded.isEnriched,
        lastSeenAt = excluded.lastSeenAt
        -- playCount dan isFavorite TIDAK diupdate ──`,
      [
        id,
        track.title || track.filename.replace(/\.[^/.]+$/, ""),
        track.artist || "Unknown Artist",
        track.album || "Unknown Album",
        track.genre || "Unknown Genre",
        track.folder || "Music",
        track.filename,
        track.uri,
        track.artwork ?? null,
        track.duration ?? 0,
        track.sampleRate ?? null,
        track.bitDepth ?? null,
        track.codec ||
          track.filename.split(".").pop()?.toUpperCase() ||
          "UNKNOWN",
        track.bitrate ?? null,
        track.fileSize ?? 0,
        track.isEnriched ? 1 : 0,
        track.dateAdded ?? now,
        now, // lastSeenAt selalu update
      ],
    );
  }

  // ── Queries ────────────────────────────────────────────────
  static async getLibrarySongs(
    options: { searchQuery?: string } = {},
  ): Promise<Song[]> {
    try {
      const { searchQuery = "" } = options;
      let query = "SELECT * FROM songs";
      const params: any[] = [];

      if (searchQuery) {
        query += " WHERE (title LIKE ? OR artist LIKE ? OR album LIKE ?)";
        params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
      }

      query += " ORDER BY title ASC";
      const result = db.execute(query, params);
      return result.rows?._array ?? [];
    } catch (e: any) {
      console.error("🔴 [LibraryScanner] Query Error:", e.message);
      return [];
    }
  }

  /** Ambil semua URI yang ada di DB — untuk ScanDiffEngine */
  static getExistingUris(): Set<string> {
    try {
      const result = db.execute("SELECT uri FROM songs");
      const rows: { uri: string }[] = result.rows?._array ?? [];
      return new Set(rows.map((r) => r.uri));
    } catch {
      return new Set();
    }
  }

  /** Tandai file yang tidak terdeteksi lagi — untuk ScanDiffEngine */
  static markAsDeleted(uris: string[]): void {
    if (uris.length === 0) return;
    const placeholders = uris.map(() => "?").join(", ");
    db.execute(`DELETE FROM songs WHERE uri IN (${placeholders})`, uris);
    console.log(`🗑️ [LibraryScanner] Removed ${uris.length} deleted tracks`);
  }

  /** Reset isEnriched — trigger enrichment ulang */
  static resetEnrichment(): void {
    db.execute("UPDATE songs SET isEnriched = 0");
  }

  /** Ambil track yang belum di-enrich — untuk EnrichmentService nanti */
  static getUnenrichedTracks(limit = 50): Song[] {
    try {
      const result = db.execute(
        "SELECT * FROM songs WHERE isEnriched = 0 LIMIT ?",
        [limit],
      );
      return result.rows?._array ?? [];
    } catch {
      return [];
    }
  }

  static clearLibrary(): void {
    db.execute("DELETE FROM songs;");
    console.log("🧹 Library cleared");
  }

  static updateEnrichment(
    uri: string,
    data: {
      sampleRate?: number;
      bitDepth?: number;
      artwork?: string;
      title?: string; // ← tambah
      artist?: string; // ← tambah
      album?: string; // ← tambah
    },
  ): void {
    // Build dynamic SET clause
    const sets: string[] = ["isEnriched = 1", "lastSeenAt = ?"];
    const params: any[] = [Date.now()];

    if (data.sampleRate !== undefined) {
      sets.push("sampleRate = ?");
      params.push(data.sampleRate ?? null);
    }
    if (data.bitDepth !== undefined) {
      sets.push("bitDepth = ?");
      params.push(data.bitDepth ?? null);
    }
    if (data.artwork !== undefined) {
      sets.push("artwork = ?");
      params.push(data.artwork ?? null);
    }
    // Hanya update jika ada nilai dari ID3 tag
    if (data.title && data.title.trim() !== "") {
      sets.push("title = ?");
      params.push(data.title.trim());
    }
    if (data.artist && data.artist.trim() !== "") {
      sets.push("artist = ?");
      params.push(data.artist.trim());
    }
    if (data.album && data.album.trim() !== "") {
      sets.push("album = ?");
      params.push(data.album.trim());
    }

    params.push(uri); // WHERE clause

    db.execute(`UPDATE songs SET ${sets.join(", ")} WHERE uri = ?`, params);
  }
}
