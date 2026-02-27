/**
 * LibraryScanner — Scan local storage for audio files
 * Android: Uses expo-file-system recursive scan
 * Supports: MP3, FLAC, OGG, AAC, M4A, WAV
 */

import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Track } from '../types/audio.types';

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.aac', '.m4a', '.wav', '.opus'];
const SCAN_DIRS = [
  FileSystem.documentDirectory,
  // Android common music dirs (will fail gracefully on iOS)
  'file:///storage/emulated/0/Music/',
  'file:///storage/emulated/0/Download/',
];

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getFormat(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? 'AUDIO';
  return ext;
}

function generateId(uri: string): string {
  return uri.split('/').pop()?.replace(/\.[^.]+$/, '') ?? Math.random().toString(36).slice(2);
}

function nameToTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')        // remove extension
    .replace(/[-_]/g, ' ')           // dashes/underscores → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase()); // title case
}

async function scanDir(dirUri: string): Promise<Track[]> {
  const tracks: Track[] = [];

  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists || !info.isDirectory) return [];

    const entries = await FileSystem.readDirectoryAsync(dirUri);

    for (const entry of entries) {
      const fullUri = dirUri.endsWith('/') ? `${dirUri}${entry}` : `${dirUri}/${entry}`;

      if (isAudioFile(entry)) {
        const fileInfo = await FileSystem.getInfoAsync(fullUri);
        tracks.push({
          id: generateId(fullUri),
          uri: fullUri,
          title: nameToTitle(entry),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0, // Will be resolved by TrackPlayer on load
          format: getFormat(entry),
          fileSize: fileInfo.exists && !fileInfo.isDirectory ? (fileInfo as any).size : undefined,
        });
      } else {
        // Recurse into subdirectory
        const subInfo = await FileSystem.getInfoAsync(fullUri);
        if (subInfo.exists && subInfo.isDirectory) {
          const subTracks = await scanDir(fullUri);
          tracks.push(...subTracks);
        }
      }
    }
  } catch (err) {
    // Silently skip dirs we can't access (permission denied)
  }

  return tracks;
}

/**
 * Scan all known music directories.
 */
export async function scanLibrary(): Promise<Track[]> {
  const allTracks: Track[] = [];

  for (const dir of SCAN_DIRS) {
    if (dir) {
      const tracks = await scanDir(dir);
      allTracks.push(...tracks);
    }
  }

  // Dedupe by uri
  const seen = new Set<string>();
  return allTracks.filter((t) => {
    if (seen.has(t.uri)) return false;
    seen.add(t.uri);
    return true;
  });
}

/**
 * Let user pick files manually via system file picker.
 */
export async function pickAudioFiles(): Promise<Track[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    id: generateId(asset.uri),
    uri: asset.uri,
    title: nameToTitle(asset.name ?? 'Unknown'),
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 0,
    format: getFormat(asset.name ?? ''),
    fileSize: asset.size ?? undefined,
  }));
}
