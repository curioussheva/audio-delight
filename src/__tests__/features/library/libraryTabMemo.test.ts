// memo() 6 komponen tab utama Library (audit Library 2026-11-22, P2).
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native,
// tanpa @testing-library/react-native, testMatch hanya `*.test.ts`),
// jadi render-count TIDAK bisa diuji di sini. Yang diuji adalah
// properti sumber yang membuat memo itu bekerja:
//  (1) keenam komponen dibungkus memo() (komparator default);
//  (2) caveat audit soal identitas `colors` TERVERIFIKASI, bukan
//      diasumsikan: `colors` BUKAN prop dari library.tsx (keenamnya
//      mengambil dari useTheme() internal), DAN objek tema yang
//      dikembalikan getThemeById adalah referensi yang sama dari
//      record statis ALL_THEMES — jadi `colors` stabil antar render
//      selama tema tidak berganti, dan memo tidak batal karenanya;
//  (3) props dari library.tsx stabil (array useMemo + primitif +
//      useCallback) — dicek dari sumber library.tsx.

import * as fs from "fs";
import * as path from "path";
import {
  ALL_THEMES,
  getThemeById,
} from "@/shared/constants/theme";
import type { ThemeId } from "@/shared/constants/themes/types";

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const COMPONENTS = [
  "AlbumGrid",
  "ArtistList",
  "FolderList",
  "GenreList",
  "FileTypeList",
  "PlaylistList",
] as const;

describe("6 komponen tab utama — dibungkus memo()", () => {
  it.each(COMPONENTS)("memo(function %s(", (name) => {
    const src = readSource(
      `../../../features/library/components/${name}.tsx`,
    );
    expect(src).toContain(`memo(function ${name}(`);
    // Bukan lagi arrow React.FC polos tanpa memo.
    expect(src).not.toContain(`React.FC<${name}Props> = (`);
    expect(src).not.toContain("React.FC<any> = (");
  });

  it.each(COMPONENTS)("%s: colors dari useTheme() internal, bukan prop", (name) => {
    const src = readSource(
      `../../../features/library/components/${name}.tsx`,
    );
    expect(src).toContain("useTheme()");
    // GenreList juga mendestruktur `spacing` dari theme yang sama.
    expect(src).toContain("const { colors");
  });

  it("library.tsx tidak mengoper colors sebagai prop ke keenam tab", () => {
    const library = readSource("../../../app/(drawer)/(tabs)/library.tsx");
    for (const name of COMPONENTS) {
      const block = library.slice(
        library.indexOf(`<${name}`),
        library.indexOf(`<${name}`) + 600,
      );
      expect(block).not.toContain("colors=");
    }
  });
});

describe("identitas colors — objek tema statis ALL_THEMES (caveat audit terverifikasi)", () => {
  it("getThemeById mengembalikan referensi yang sama untuk id yang sama", () => {
    for (const id of Object.keys(ALL_THEMES) as ThemeId[]) {
      expect(getThemeById(id)).toBe(ALL_THEMES[id]);
      expect(getThemeById(id)).toBe(getThemeById(id));
      expect(getThemeById(id).colors).toBe(ALL_THEMES[id].colors);
    }
  });

  it("ganti tema = objek lain; tema sama = objek sama (memo batal hanya saat tema berganti)", () => {
    const ids = Object.keys(ALL_THEMES) as ThemeId[];
    expect(ids.length).toBeGreaterThan(1);
    expect(getThemeById(ids[0]).colors).not.toBe(
      getThemeById(ids[1]).colors,
    );
  });
});

describe("props tab dari library.tsx — stabil untuk komparator default memo", () => {
  const library = readSource("../../../app/(drawer)/(tabs)/library.tsx");

  it("daftar + turunan di-useMemo, callback di-useCallback", () => {
    expect(library).toContain("const filteredSource = useMemo(");
    expect(library).toContain("const artists = useMemo(");
    expect(library).toContain("const playlistItems: PlaylistItem[] = useMemo(");
    expect(library).toContain("const handleSongPress = useCallback(");
    expect(library).toContain("const handlePlaylistPress = useCallback(");
    expect(library).toContain("const favoriteIdSet = useMemo(");
  });

  it("tab menerima array memo + primitif + callback stabil (bukan inline)", () => {
    expect(library).toContain("tracks={filteredSource}");
    expect(library).toContain("currentTrackId={currentSongId}");
    expect(library).toContain("onSongPress={handleSongPress}");
    expect(library).toContain("onToggleFavorite={toggleFavorite}");
    expect(library).toContain("favoriteIds={favoriteIdSet}");
  });
});
