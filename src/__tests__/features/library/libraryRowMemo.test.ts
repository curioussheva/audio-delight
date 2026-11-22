// Stabilisasi callback baris detail + onRemove (audit Library 2026-11-22, P2).
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native,
// tanpa @testing-library/react-native, testMatch hanya `*.test.ts`),
// jadi render-count baris TIDAK bisa diuji di sini. Yang diuji
// adalah properti sumber yang menghidupkan kembali memo baris:
//  (1) keempat baris detail (Album/Artist/Folder/FileType) punya
//      komparator kustom ala GenreSongRow yang mengabaikan callback
//      — dulu onPress/onToggleFavorite arrow inline di renderItem
//      membuat memo default batal tiap render induk;
//  (2) komparator ikut membandingkan field tampil (bukan hanya id)
//      supaya update metadata/enrichment tetap tampil;
//  (3) handler tekan lagu stabil (useCallback atas filteredSongs
//      yang sudah useMemo) di Album/Folder/FileType — ArtistList
//      menyusul di P3 (filteredSongs-nya masih inline, baru di-useMemo
//      di sana; komparatornya sudah melindungi barisnya);
//  (4) onRemove detail playlist meneruskan handleRemoveSong
//      (useCallback) langsung — bukan arrow inline — supaya
//      komparator kustom SongListItem tidak batal; pola yang sama
//      dengan layar drawer Playlist.

import * as fs from "fs";
import * as path from "path";

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const ROWS = [
  { file: "AlbumGrid", row: "AlbumSongRow" },
  { file: "ArtistList", row: "ArtistSongRow" },
  { file: "FolderList", row: "FolderSongRow" },
  { file: "FileTypeList", row: "FileTypeSongRow" },
] as const;

describe("baris detail — komparator kustom mengabaikan callback", () => {
  it.each(ROWS)("$row: komparator bandingkan data, bukan callback", ({ file }) => {
    const src = readSource(`../../../features/library/components/${file}.tsx`);
    expect(src).toContain("(prev, next) =>");
    expect(src).toContain("prev.track.id === next.track.id");
    expect(src).toContain("prev.track.title === next.track.title");
    expect(src).toContain("prev.track.artist === next.track.artist");
    expect(src).toContain("prev.track.album === next.track.album");
    expect(src).toContain("prev.track.duration === next.track.duration");
    expect(src).toContain("prev.track.codec === next.track.codec");
    expect(src).toContain("prev.isNowPlaying === next.isNowPlaying");
    expect(src).toContain("prev.isFavorite === next.isFavorite");
    expect(src).toContain("prev.colors === next.colors");
    // Callback sengaja TIDAK dibandingkan (identitas baru tiap render).
    expect(src).not.toContain("prev.onPress");
    expect(src).not.toContain("prev.onToggleFavorite");
  });

  it("GenreSongRow tetap jadi pola acuan (komparator kustom sudah ada)", () => {
    const src = readSource("../../../features/library/components/GenreList.tsx");
    expect(src).toContain("(prev, next) =>");
    expect(src).toContain("prev.track.id === next.track.id");
    expect(src).not.toContain("prev.onPress");
  });
});

describe("baris detail — handler tekan lagu stabil (pola GenreList)", () => {
  it.each(["AlbumGrid", "FolderList", "FileTypeList"])(
    "%s: handleSongPress useCallback atas filteredSongs + renderItem memakainya",
    (file) => {
      const src = readSource(
        `../../../features/library/components/${file}.tsx`,
      );
      expect(src).toContain("const handleSongPress = useCallback(");
      expect(src).toContain("(track: ");
      expect(src).toContain("onSongPress(track, filteredSongs)");
      expect(src).toContain("onPress={() => handleSongPress(item)}");
      expect(src).not.toContain("onPress={() => onSongPress(item, filteredSongs)}");
    },
  );

  it("ArtistList: komparator + handler stabil (filteredSongs di-useMemo di P3)", () => {
    const src = readSource("../../../features/library/components/ArtistList.tsx");
    expect(src).toContain("(prev, next) =>");
    expect(src).toContain("prev.track.id === next.track.id");
    expect(src).toContain("const handleSongPress = useCallback(");
    expect(src).toContain("onPress={() => handleSongPress(item)}");
  });
});

describe("detail playlist — onRemove stabil supaya komparator SongListItem hidup", () => {
  const library = readSource("../../../app/(drawer)/(tabs)/library.tsx");

  it("onRemove meneruskan handleRemoveSong langsung (bukan arrow inline)", () => {
    expect(library).toContain("? handleRemoveSong");
    expect(library).not.toContain("() => void handleRemoveSong(item)");
  });

  it("handleRemoveSong tetap useCallback (stabil selama playlist tidak berganti)", () => {
    expect(library).toContain("const handleRemoveSong = useCallback(");
  });

  it("SongListItem: komparator masih membandingkan onRemove (closure basi tertangkap)", () => {
    const row = readSource(
      "../../../features/library/components/SongListItem.tsx",
    );
    expect(row).toContain("prev.onRemove === next.onRemove");
  });
});
