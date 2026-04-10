/**
 * MetadataExtractor.ts - Versi Final dengan Artwork Handling yang Lebih Baik
 */

import { MediaStore, NativeSong } from "@/features/library/native/MediaStoreModule";
import { Song } from "@/shared/types/audio";

class MetadataExtractor {
  
  /**
   * Extract metadata satu lagu
   */
  async extract(uri: string): Promise<Partial<Song> | null> {
    try {
      if (!uri) return null;

      const nativeSong = await this.findSongByUri(uri);
      if (!nativeSong) return null;

      return this.convertNativeToSong(nativeSong);
      
    } catch (error) {
      console.error(`[MetadataExtractor] Extract failed for ${uri}:`, error);
      return null;
    }
  }

  /**
   * Extract semua lagu (Full Scan)
   */
  async extractAll(onProgress?: (current: number, total: number) => void): Promise<Partial<Song>[]> {
    try {
      console.log("[MetadataExtractor] Starting batch extractAll...");

      const nativeSongs = await MediaStore.queryAudioFiles();
      const total = nativeSongs.length;
      const results: Partial<Song>[] = [];

      for (let i = 0; i < total; i++) {
        const native = nativeSongs[i];
        if (!native?.uri) continue;

        const song = this.convertNativeToSong(native);
        if (song.uri) {
          results.push(song);
        }

        onProgress?.(i + 1, total);
      }

      console.log(`[MetadataExtractor] Successfully extracted ${results.length} songs from ${total} files`);
      return results;

    } catch (error) {
      console.error("[MetadataExtractor] Batch extractAll failed:", error);
      return [];
    }
  }

  /**
   * Konversi utama dengan fokus pada Artwork
   */
  private convertNativeToSong(native: NativeSong): Partial<Song> {
    const safeUri = native.uri || `content://media/external/audio/media/${native.id}`;

    // === Artwork Priority (Ini yang paling penting) ===
    const artwork = this.extractBestArtwork(native);

    return {
      id: native.id?.toString() || this.uriToId(safeUri),
      uri: safeUri,
      filename: native.filename || "",
      
      title: native.title?.trim() || this.parseTitleFromFilename(native.filename || ""),
      artist: native.artist?.trim() || "Unknown Artist",
      album: native.album?.trim() || "Unknown Album",
      genre: native.genre?.trim() || "Unknown",
      
      folder: native.folder?.trim() || this.extractFolder(safeUri),
      
      // Artwork yang sudah di-normalisasi
      artwork: artwork || undefined,

      duration: Math.floor(native.duration || 0),
      codec: native.codec || this.extractCodecFromFilename(native.filename || ""),
      sampleRate: native.sampleRate || 0,
      bitDepth: native.bitDepth || 0,
      bitrate: native.bitrate || 0,
      fileSize: native.fileSize || 0,
      year: native.year || 0,
      trackNumber: native.trackNumber || 0,
      discNumber: native.discNumber || 0,

      isEnriched: false,
      dateAdded: native.dateAdded || Date.now(),
      isHiRes: (native.sampleRate || 0) > 48000 || (native.bitDepth || 0) > 16,
    };
  }

  /**
   * Extract Best Artwork - Logic yang lebih kuat
   */
  private extractBestArtwork(native: NativeSong): string | null {
    // Priority 1: artworkUri (dari MediaStore)
    if (native.artworkUri?.trim()) {
      return native.artworkUri;
    }

    // Priority 2: albumArt / thumbnail (beberapa versi MediaStore)
    if ((native as any).albumArt?.trim()) {
      return (native as any).albumArt;
    }
    if ((native as any).thumbnail?.trim()) {
      return (native as any).thumbnail;
    }

    // Priority 3: Bisa ditambahkan di masa depan embedded artwork via FFmpeg / custom native module
    // Untuk sekarang kita return null dulu

    return null;
  }

  // === Utility Methods (tidak berubah banyak) ===

  private parseTitleFromFilename(filename: string): string {
    if (!filename) return "Unknown Title";
    return filename
      .replace(/\.[^/.]+$/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .trim() || "Unknown Title";
  }

  private extractCodecFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toUpperCase() || "";
    const codecMap: Record<string, string> = {
      'MP3': 'MP3', 'FLAC': 'FLAC', 'WAV': 'WAV', 'M4A': 'AAC',
      'AAC': 'AAC', 'OGG': 'OGG', 'OPUS': 'OPUS', 'DSF': 'DSD',
      'ALAC': 'ALAC', 'APE': 'APE',
    };
    return codecMap[ext] || ext || "UNKNOWN";
  }

  private extractFolder(uri: string): string {
    try {
      const parts = uri.split(/[/\\]/);
      for (let i = parts.length - 2; i >= 0; i--) {
        if (parts[i] && !parts[i].includes('.')) return parts[i];
      }
      return "Music";
    } catch {
      return "Music";
    }
  }

  private uriToId(uri: string): string {
    let hash = 5381;
    for (let i = 0; i < uri.length; i++) {
      hash = (hash * 33) ^ uri.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  private async findSongByUri(uri: string): Promise<NativeSong | null> {
    try {
      const allSongs = await MediaStore.queryAudioFiles();
      return allSongs.find(song => song.uri === uri) || null;
    } catch {
      return null;
    }
  }
}

export default new MetadataExtractor(); 