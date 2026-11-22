// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Song Detail harus memenuhi prinsip render per-node:
// - hanya SATU track yang dibuka yang dilanggan (bukan seluruh array tracks)
// - antrean playSong dibaca via getState() saat ditekan, bukan langganan
// - hanya id lagu yang diputar yang dilanggan dari playerStore
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("song detail node render", () => {
  test("hanya satu track dilanggan, bukan seluruh array tracks", () => {
    const src = stripComments(read("../../../app/(drawer)/song/[id].tsx"));
    expect(src).not.toContain("state.tracks);");
    expect(src).toContain(
      "useLibraryStore((state) =>\n    state.tracks?.find((t) => t.id.toString() === id),",
    );
    // antrean dibaca saat tombol ditekan, bukan lewat langganan
    expect(src).toContain(
      "playSong(song, useLibraryStore.getState().tracks)",
    );
  });

  test("player: hanya id lagu yang diputar, bukan objek currentSong", () => {
    const src = stripComments(read("../../../app/(drawer)/song/[id].tsx"));
    expect(src).toContain(
      "usePlayerStore((state) => state.currentSong?.id)",
    );
    expect(src).not.toContain(
      "usePlayerStore((state) => state.currentSong)",
    );
    expect(src).toContain("if (currentSongId === song.id)");
  });

  test("updateTrack/toggleFavorite mempertahankan referensi track lain", () => {
    // Prasyarat selector satu-track di atas: map hanya membuat objek baru
    // untuk track yang diubah; track lain mempertahankan identitas.
    const store = read("../../../features/library/store/libraryStore.ts");
    expect(store).toContain("t.id === trackId ? { ...t,");
  });
});
