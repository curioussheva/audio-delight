// src/features/library/utils/metadataAdapter.ts

import { getAudioMetadata, AudioMetadata } from "@missingcore/audio-metadata";
import { Song, AudioFormat } from "@/shared/types/audio";

/**
 * Convert @missingcore/audio-metadata output ke Song type
 */
export function metadataToSong(
  uri: string,
  metadata: AudioMetadata,
  fileInfo: { size: number; exists: boolean },
): Partial<Song> {
  const { format, common } = metadata;

  return {
    // Identifiers
    uri,
    title: common.title || "Unknown Title",
    artist: common.artist || "Unknown Artist",
    album: common.album || "Unknown Album",
    genre: common.genre?.[0] || "Unknown Genre",

    // Technical (AudioFormat)
    codec: format.codec?.toUpperCase() || guessCodecFromUri(uri),
    sampleRate: format.sampleRate || 44100,
    bitDepth: format.bitsPerSample,
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined, // bps → kbps
    duration: format.duration || 0,
    fileSize: fileInfo.size,

    // Metadata
    year: common.year,
    trackNumber: common.track?.no,
    discNumber: common.disk?.no,

    // Flags
    isEnriched: true,
    lastSeenAt: Date.now(),
  };
}

function guessCodecFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase() || "";
  const codecMap: Record<string, string> = {
    flac: "FLAC",
    mp3: "MP3",
    m4a: "AAC",
    aac: "AAC",
    ogg: "OGG",
    opus: "OPUS",
    wav: "WAV",
    aiff: "AIFF",
    dsf: "DSD",
    dff: "DSD",
  };
  return codecMap[ext] || "UNKNOWN";
}
