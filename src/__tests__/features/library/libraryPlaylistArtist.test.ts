// PlaylistList renderItem/header + ArtistList filteredSongs
// (audit Library 2026-11-22, P3).
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native,
// tanpa @testing-library/react-native, testMatch hanya `*.test.ts`),
// jadi render-count TIDAK bisa diuji di sini. Yang diuji adalah
// properti sumbernya:
//  (1) komentar menyesatkan soal dep renderItem sudah dibetulkan —
//      `colors` memang di dep (dipakai di JSX), bukan dikeluarkan;
//  (2) ListHeaderComponent diekstrak jadi komponen memo sendiri
//      (PlaylistListHeader) dengan props stabil;
//  (3) ArtistList.filteredSongs dihitung useMemo di level atas
//      (bukan inline di cabang detail) + handler tekan stabil.

import * as fs from "fs";
import * as path from "path";

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readRaw(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), "utf8");
}

const playlist = readSource(
  "../../../features/library/components/PlaylistList.tsx",
);
const playlistRaw = readRaw(
  "../../../features/library/components/PlaylistList.tsx",
);
const artist = readSource("../../../features/library/components/ArtistList.tsx");

describe("PlaylistList — komentar dep renderItem dibetulkan", () => {
  it("komentar lama yang mengklaim colors tidak masuk dep sudah hilang", () => {
    expect(playlistRaw).not.toContain(
      "Jangan masukkan `colors` ke dependency",
    );
    expect(playlistRaw).toContain("`colors` MEMANG ada di dep");
  });

  it("renderItem tetap memakai colors + dep [onPlaylistPress, colors]", () => {
    expect(playlist).toContain(
      "<PlaylistRow item={item} onPress={onPlaylistPress} colors={colors} />",
    );
    expect(playlist).toContain("[onPlaylistPress, colors]");
    expect(playlist).toContain("extraData={colors}");
  });
});

describe("PlaylistList — ListHeaderComponent jadi komponen memo", () => {
  it("PlaylistListHeader memo + dipakai sebagai ListHeaderComponent", () => {
    expect(playlist).toContain("memo(function PlaylistListHeader(");
    expect(playlist).toContain("ListHeaderComponent={");
    expect(playlist).toContain("<PlaylistListHeader");
  });

  it("header menerima props stabil (angka + array + callback + colors)", () => {
    expect(playlist).toContain("favoriteCount={favoriteCount}");
    expect(playlist).toContain("smartPlaylists={smartPlaylists}");
    expect(playlist).toContain("onPlaylistPress={onPlaylistPress}");
    expect(playlist).toContain("onCreate={handleCreate}");
    expect(playlist).toContain("onImport={handleImport}");
    expect(playlist).toContain("hasImport={!!onImportM3U}");
  });

  it("isi header (Favorit + Otomatis + Saya) pindah ke komponen header, bukan inline di induk", () => {
    const header = playlist.slice(
      playlist.indexOf("memo(function PlaylistListHeader("),
      playlist.indexOf("memo(function PlaylistList("),
    );
    expect(header).toContain("Lagu Disukai");
    expect(header).toContain("Playlist Otomatis");
    expect(header).toContain("Playlist Saya");
    const main = playlist.slice(playlist.indexOf("memo(function PlaylistList("));
    expect(main).not.toContain("Playlist Otomatis");
    expect(main).not.toContain("Lagu Disukai");
  });
});

describe("ArtistList — filteredSongs useMemo + handler stabil", () => {
  it("filteredSongs di-useMemo di level atas, bukan inline di cabang detail", () => {
    expect(artist).toContain("const filteredSongs = useMemo(() => {");
    expect(artist).toContain("[tracks, selectedArtist]");
    expect(artist).not.toContain("const filteredSongs = tracks");
  });

  it("handler tekan stabil ala GenreList + renderItem memakainya", () => {
    expect(artist).toContain("const handleSongPress = useCallback(");
    expect(artist).toContain("onSongPress(track, filteredSongs)");
    expect(artist).toContain("onPress={() => handleSongPress(item)}");
    expect(artist).not.toContain("onPress={() => onSongPress(item, filteredSongs)}");
  });
});
