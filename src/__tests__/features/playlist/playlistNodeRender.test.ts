// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Playlist harus memenuhi prinsip render per-node:
// - playerStore selector per nilai (bukan seluruh store); hanya id lagu
//   yang diputar yang dilanggan
// - callback modal stabil + modal memo
// - useFavorites: selector turunan + shallow, bukan seluruh array tracks
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("playlist node render", () => {
  test("playerStore selector per nilai, hanya id lagu yang diputar", () => {
    const src = stripComments(read("../../../app/(drawer)/playlist.tsx"));
    expect(src).toContain("usePlayerStore((state) => state.playSong)");
    expect(src).toContain(
      "usePlayerStore((state) => state.currentSong?.id)",
    );
    expect(src).not.toMatch(/usePlayerStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = usePlayerStore\(\);/);
    expect(src).toContain("isNowPlaying={currentSongId === item.id}");
  });

  test("callback modal stabil + modal memo", () => {
    const src = read("../../../app/(drawer)/playlist.tsx");
    expect(src).toContain("handleCloseAddModal = useCallback");
    expect(src).toContain("handleCloseCreateModal = useCallback");
    expect(src).toContain("handleCancelDelete = useCallback");
    expect(src).toContain("onAdd={handleAddSong}");
    expect(src).toContain("onClose={handleCloseAddModal}");
    expect(src).toContain("onConfirm={handleConfirmDeletePlaylist}");
    expect(src).toContain("onCancel={handleCancelDelete}");
    expect(src).not.toContain("onAdd={(song) => void handleAddSong(song)}");

    const add = read(
      "../../../features/playlist/components/AddSongsModal.tsx",
    );
    expect(add).toContain("memo(({");
    const create = read(
      "../../../features/playlist/components/CreatePlaylistModal.tsx",
    );
    expect(create).toContain("memo(({");
    const confirm = read("../../../shared/components/ui/ConfirmDialog.tsx");
    expect(confirm).toContain("memo(function ConfirmDialog");
  });

  test("useFavorites: selector turunan + shallow, bukan array tracks utuh", () => {
    const src = read("../../../features/favorites/hooks/useFavorites.ts");
    expect(src).toContain('import { shallow } from "zustand/shallow"');
    expect(src).toContain(
      "state.tracks.filter((t) => t.isFavorite).map((t) => t.id),",
    );
    expect(src).toContain("selectFavorites(state.tracks) as Song[],");
    expect(src).toContain("shallow,");
    expect(src).not.toContain("useLibraryStore((state) => state.tracks)");
  });
});
