import RNFS from 'react-native-fs';

export const parseM3U = async (filePath: string) => {
  try {
    const content = await RNFS.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const tracks: string[] = [];

    lines.forEach((line: string) => {
      const trimmed = line.trim();
      // Lewati komentar M3U (#EXTINF dll) dan ambil path file
      if (trimmed && !trimmed.startsWith('#')) {
        tracks.push(trimmed);
      }
    }); // Pastikan ada penutup bracket dan kurung di sini

    return {
      name: filePath.split('/').pop()?.replace('.m3u', '') || 'New Playlist',
      paths: tracks
    };
  } catch (error) {
    console.error('[M3UParser] Error:', error);
    return null;
  }
};
