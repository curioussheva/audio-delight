// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// tabs layout harus memenuhi prinsip render per-node:
// - screenOptions + ikon tab identitas stabil (bukan literal baru tiap render)
// - ScanStatusBar memo (tanpa prop — render ulang TabsLayout saat ganti
//   lagu tidak ikut membangunkan chip)
// - langganan TabsLayout tetap per nilai (currentSong + status scan yang
//   sudah dipecah di ronde Library)
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("tabs layout node render", () => {
  test("screenOptions useMemo + ikon tab level modul (fungsi biasa)", () => {
    const src = read("../../../app/(drawer)/(tabs)/_layout.tsx");
    expect(src).toContain("const screenOptions = useMemo(");
    expect(src).toContain("<Tabs screenOptions={screenOptions}>");
    // Regresi 2026-11-23: ikon sempat memo() — React Navigation memanggil
    // tabBarIcon sebagai FUNGSI (renderIcon({ color, size, focused })), dan
    // hasil memo() adalah object, bukan function → fresh install crash
    // `TypeError: renderIcon is not a function (it is Object)`. Ikon harus
    // fungsi level modul (identitas stabil antar render, tanpa memo()).
    expect(src).toContain("function LibraryTabIcon(");
    expect(src).toContain("function EqualizerTabIcon(");
    expect(src).toContain("function AnalyzerTabIcon(");
    expect(src).not.toContain("const LibraryTabIcon = memo(");
    expect(src).not.toContain("const EqualizerTabIcon = memo(");
    expect(src).not.toContain("const AnalyzerTabIcon = memo(");
    expect(src).toContain("tabBarIcon: LibraryTabIcon,");
    expect(src).toContain("tabBarIcon: EqualizerTabIcon,");
    expect(src).toContain("tabBarIcon: AnalyzerTabIcon,");
    expect(src).not.toContain("tabBarIcon: ({ color, size }) => (");
  });

  test("ScanStatusBar memo", () => {
    const src = read(
      "../../../features/library/components/ScanStatusBar.tsx",
    );
    expect(src).toContain(
      "export const ScanStatusBar = memo(function ScanStatusBar() {",
    );
  });

  test("TabsLayout: langganan per nilai, bukan seluruh store", () => {
    const src = stripComments(
      read("../../../app/(drawer)/(tabs)/_layout.tsx"),
    );
    expect(src).toContain("usePlayerStore((s) => s.currentSong)");
    expect(src).toContain("useScanStatusVisible()");
    expect(src).not.toMatch(/usePlayerStore\(\);/);
    expect(src).not.toContain("useScanProgress()");
  });
});
