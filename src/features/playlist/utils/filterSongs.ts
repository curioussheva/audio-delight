// Filter murni untuk modal tambah-ke-playlist (AddSongsModal):
// cocok judul / artis / album, case-insensitive. Query kosong =
// semua lagu. Dipisah dari komponen supaya bisa diuji jest tanpa
// react-native (jest proyek ini logika-murni).
import type { Song } from "@/shared/types/audio";

export function filterSongsByQuery(songs: Song[], query: string): Song[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs;
  return songs.filter((song) =>
    [song.title, song.artist, song.album].some((field) =>
      (field ?? "").toLowerCase().includes(q),
    ),
  );
}
