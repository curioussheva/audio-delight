import { getAudioMetadata } from "@missingcore/audio-metadata";
import { Song } from "@/shared/types/audio";

// TypeScript Fix: Pastikan array ini sesuai dengan ekspektasi library
const TAGS = [
  "name",
  "artist",
  "albumArtist",
  "album",
  "artwork",
  "year",
  "track",
] as any; // Gunakan any jika library memiliki definisi tipe yang kaku/berbeda

const uriToId = (uri: string): string => {
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) {
    hash = (hash * 33) ^ uri.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

class MetadataExtractor {
  async extract(uri: string): Promise<Partial<Song>> {
    // FIX: Tangani pemisah folder untuk Content URI (SAF)
    const decodedUri = decodeURIComponent(uri);
    const filename = decodedUri.split("/").pop()?.split(":").pop() ?? "Unknown File";
    
    const ext = filename.split(".").pop()?.toUpperCase() ?? "UNKNOWN";
    const titleFromFile = filename.replace(/\.[^/.]+$/, "");
    const isHiRes = ["FLAC", "WAV", "DSF", "DFF", "ALAC"].includes(ext);

    try {
      // Library @missingcore/audio-metadata biasanya mendukung content:// di Android
      const result = (await getAudioMetadata(uri, TAGS)) as any;
      const m = result.metadata || {};

      return {
        id:      uriToId(uri),
        uri,
        title:   m.name       || titleFromFile,
        artist:  m.artist     || m.albumArtist || "Unknown Artist",
        album:   m.album      || "Unknown Album",
        genre:   "Unknown",   // Tetap "Unknown" karena library v1.3.0 belum support
        artwork: m.artwork    ?? undefined,
        duration: 0,
        
          codec:      result.fileType?.toUpperCase() ?? ext,
          sampleRate: isHiRes ? 96000 : 44100,
          bitDepth:   isHiRes ? 24 : 16,
          bitrate:    ext === "FLAC" ? 1411 : 320,
        
        dateAdded: Date.now(),
      };
    } catch (error) {
      console.warn(`[Metadata] Gagal extract ${filename}, menggunakan fallback.`, error);
      return {
        id:      uriToId(uri),
        uri,
        title:   titleFromFile,
        artist:  "Unknown Artist",
        album:   "Unknown Album",
        genre:   "Unknown",
        artwork: undefined,
        duration: 0,
        
          codec:      ext,
          sampleRate: isHiRes ? 96000 : 44100,
          bitDepth:   isHiRes ? 24 : 16,
          bitrate:    ext === "FLAC" ? 1411 : 320,
        
        dateAdded: Date.now(),
      };
    }
  }
}

export default new MetadataExtractor();
 