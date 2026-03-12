// src/types/music-metadata.d.ts
declare module 'music-metadata' {
  export interface IAudioMetadata {
    format: IFormat;
    common: ICommonTagsResult;
  }

  export interface IFormat {
    container?: string;
    codec?: string;
    lossless?: boolean;
    sampleRate?: number;
    bitsPerSample?: number;
    bitrate?: number;
    duration?: number;
    numberOfChannels?: number;
    numberOfSamples?: number;
    encoder?: string;
    tool?: string;
  }

  export interface ICommonTagsResult {
    title?: string;
    artist?: string;
    artists?: string[];
    album?: string;
    year?: number;
    track?: { no: number; of: number };
    genre?: string[];
    composer?: string[];
    lyrics?: Array<{ text: string }>;
    picture?: Array<{
      format: string;
      data: Buffer;
    }>;
    replaygain_track_gain?: number;
    replaygain_track_peak?: number;
    replaygain_album_gain?: number;
    replaygain_album_peak?: number;
    musicbrainz_trackid?: string;
    musicbrainz_albumid?: string;
    musicbrainz_artistid?: string[];
    peak?: { data: number[] };
  }

  export function parseBlob(
    blob: Blob, 
    options?: { duration?: boolean; skipCovers?: boolean; includeChapters?: boolean }
  ): Promise<IAudioMetadata>;
}