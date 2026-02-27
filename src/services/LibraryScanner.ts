import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Track } from '../types/audio.types';

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.aac', '.m4a', '.wav', '.opus'];

function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

function nameToTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function generateId(uri: string): string {
  return uri.split('/').pop()?.replace(/\.[^.]+$/, '') ?? Math.random().toString(36).slice(2);
}

function getFormat(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'AUDIO';
}

async function scanDir(dirUri: string): Promise<Track[]> {
  const tracks: Track[] = [];
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists || !info.isDirectory) return [];
    const entries = await FileSystem.readDirectoryAsync(dirUri);
    for (const entry of entries) {
      const fullUri = `${dirUri.replace(/\/$/, '')}/${entry}`;
      if (isAudioFile(entry)) {
        tracks.push({
          id: generateId(fullUri),
          uri: fullUri,
          title: nameToTitle(entry),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          format: getFormat(entry),
        });
      } else {
        const sub = await FileSystem.getInfoAsync(fullUri);
        if (sub.exists && sub.isDirectory) {
          tracks.push(...await scanDir(fullUri));
        }
      }
    }
  } catch (_) {}
  return tracks;
}

export async function scanLibrary(): Promise<Track[]> {
  // Pakai documentDirectory yang sudah pasti ada aksesnya
  const baseDir = (FileSystem as any).documentDirectory as string ?? '';
  const tracks: Track[] = [];

  // Scan app document dir
  if (baseDir) tracks.push(...await scanDir(baseDir));

  // Coba Android Music dir (mungkin perlu permission)
  try {
    tracks.push(...await scanDir('file:///storage/emulated/0/Music/'));
  } catch (_) {}
  try {
    tracks.push(...await scanDir('file:///storage/emulated/0/Download/'));
  } catch (_) {}

  // Dedupe
  const seen = new Set<string>();
  return tracks.filter(t => {
    if (seen.has(t.uri)) return false;
    seen.add(t.uri);
    return true;
  });
}

export async function pickAudioFiles(): Promise<Track[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: false,
  });
  if (result.canceled) return [];
  return result.assets.map(asset => ({
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
