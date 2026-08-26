// src/features/library/api/m3u.ts
import * as FileSystem from "expo-file-system";

export const parseM3U = async (filePath: string) => {
  try {
    // Replaced RNFS.readFile with Expo's readAsStringAsync (UTF-8 is the default)
    const content = await FileSystem.readAsStringAsync(filePath);
    const lines = content.split("\n");
    const tracks: string[] = [];

    lines.forEach((line: string) => {
      const trimmed = line.trim();
      // Lewati komentar M3U (#EXTINF dll) dan ambil path file
      if (trimmed && !trimmed.startsWith("#")) {
        tracks.push(trimmed);
      }
    }); // Pastikan ada penutup bracket dan kurung di sini

    return {
      name: filePath.split("/").pop()?.replace(".m3u", "") || "New Playlist",
      paths: tracks,
    };
  } catch (error) {
    console.error("[M3UParser] Error:", error);
    return null;
  }
};
 