// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Search harus memenuhi prinsip render per-node:
// - playerStore hanya aksi playSong (bukan seluruh store — tick posisi
//   tidak lagi me-render ulang layar saat mengetik)
// - baris hasil memo + komparator kustom (ketikan tidak me-render ulang
//   baris yang datanya tidak berubah)
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("search node render", () => {
  test("playerStore hanya playSong", () => {
    const src = stripComments(read("../../../app/(drawer)/search.tsx"));
    expect(src).toContain("usePlayerStore((state) => state.playSong)");
    expect(src).not.toMatch(/usePlayerStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = usePlayerStore\(\);/);
  });

  test("SearchResultRow memo + komparator kustom", () => {
    const src = read("../../../app/(drawer)/search.tsx");
    expect(src).toContain("const SearchResultRow = memo(");
    expect(src).toContain("prev.item.id === next.item.id");
    expect(src).toContain("prev.item.title === next.item.title");
    expect(src).toContain("prev.item.duration === next.item.duration");
    expect(src).toContain("<SearchResultRow");
    expect(src).toContain("handleResultPress = useCallback");
  });

  test("useLibrary hanya melanggan aksi setTracks (bukan tracks)", () => {
    const src = read("../../../features/library/hooks/useLibrary.ts");
    expect(src).toContain("useLibraryStore((s) => s.setTracks)");
    expect(src).not.toContain("useLibraryStore((s) => s.tracks)");
  });
});
