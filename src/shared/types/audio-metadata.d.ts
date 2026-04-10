// src/types/audio-metadata.d.ts

declare module "@missingcore/audio-metadata" {
  /**
   * Lightweight audio metadata parser for React Native
   * Used by: src/features/library/api/analyzer.ts
   */

  // ============================================================================
  // Format Info (Technical)
  // ============================================================================

  export interface AudioMetadataFormat {
    /** Container format: FLAC, MP3, M4A, etc. */
    container?: string;

    /** Codec: FLAC, MP3, AAC, ALAC, etc. */
    codec?: string;

    /** Lossless flag */
    lossless?: boolean;

    /** Sample rate in Hz */
    sampleRate?: number;

    /** Bit depth: 16, 24, 32 */
    bitsPerSample?: number;

    /** Bitrate in bps (bits per second) */
    bitrate?: number;

    /** Duration in seconds */
    duration?: number;

    /** Number of audio channels */
    numberOfChannels?: number;

    /** Total samples (duration * sampleRate) */
    numberOfSamples?: number;

    /** Encoder software */
    encoder?: string;
  }

  // ============================================================================
  // Common Tags (Metadata)
  // ============================================================================

  export interface AudioMetadataCommon {
    /** Track title */
    title?: string;

    /** Primary artist */
    artist?: string;

    /** All artists (featuring, etc.) */
    artists?: string[];

    /** Album name */
    album?: string;

    /** Release year */
    year?: number;

    /** Track number and total */
    track?: {
      no: number; // Track number
      of: number; // Total tracks
    };

    /** Disc number and total */
    disk?: {
      no: number;
      of: number;
    };

    /** Genres array */
    genre?: string[];

    /** Composers */
    composer?: string[];

    /** Album artist (different from track artist) */
    albumartist?: string;

    /** Lyrics (uncommon in audio files) */
    lyrics?: string[];

    /** ReplayGain track gain in dB */
    replaygain_track_gain?: number;

    /** ReplayGain track peak */
    replaygain_track_peak?: number;
  }

  // ============================================================================
  // Complete Metadata
  // ============================================================================

  export interface AudioMetadata {
    format: AudioMetadataFormat;
    common: AudioMetadataCommon;

    /** Native quality flag from parser */
    quality?: {
      warning?: string[];
    };
  }

  // ============================================================================
  // Parser Options
  // ============================================================================

  export interface ParseOptions {
    /** Calculate duration (requires full file scan) */
    duration?: boolean;

    /** Skip cover art parsing (faster) */
    skipCovers?: boolean;

    /** Include chapters (for podcast/audiobook) */
    includeChapters?: boolean;

    /** Maximum file size to parse (bytes) */
    maxSize?: number;
  }

  // ============================================================================
  // Main Function
  // ============================================================================

  /**
   * Parse audio file metadata
   *
   * @param uri - File URI (file:// or content://)
   * @param fields - Array of fields to extract (optimization)
   * @returns Promise<AudioMetadata>
   *
   * @example
   * const meta = await getAudioMetadata(
   *   "file:///storage/music/song.flac",
   *   ["name", "artist", "album", "duration"]
   * );
   */
  export function getAudioMetadata(
    uri: string,
    fields?: string[],
    options?: ParseOptions,
  ): Promise<AudioMetadata>;

  // ============================================================================
  // Utility Exports (jika tersedia)
  // ============================================================================

  /** Check if format is lossless by codec name */
  export function isLosslessCodec(codec: string): boolean;

  /** Guess codec from file extension */
  export function guessCodecFromExtension(filename: string): string | null;
}
