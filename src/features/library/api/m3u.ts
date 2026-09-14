import * as FileSystem from "expo-file-system/legacy";

export const parseM3U = async (filePath: string) => {
  try {
    const content = await FileSystem.readAsStringAsync(filePath);
    // Support Line Endings Windows (\r\n) dan Unix (\n)
    const lines = content.split(/\r?\n/);
    const tracks: string[] = [];

    lines.forEach((line: string) => {
      const trimmed = line.trim();
      // Abaikan baris kosong dan baris komentar (#)
      if (trimmed && !trimmed.startsWith("#")) {
        tracks.push(trimmed);
      }
    });

    const fileName = filePath.split("/").pop() || "";

    return {
      // Hapus ekstensi .m3u maupun .m3u8
      name: fileName.replace(/\.(m3u|m3u8)$/i, "") || "New Playlist",
      paths: tracks,
    };
  } catch (error) {
    console.error("[M3UParser] Error:", error);
    return null;
  }
};
 