// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// drawer layout harus memenuhi prinsip render per-node:
// - DrawerContent memo (konten statis, hanya bangun bila props/tema berubah)
// - drawerContent + screenOptions identitas stabil selama tema tidak berganti
// - tidak ada langganan store di layout ini (hanya useTheme)
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("drawer layout node render", () => {
  test("DrawerContent memo", () => {
    const src = read("../../../app/(drawer)/_layout.tsx");
    expect(src).toContain(
      "const DrawerContent: React.FC<DrawerContentComponentProps> = memo(",
    );
  });

  test("drawerContent + screenOptions stabil (useCallback/useMemo)", () => {
    const src = read("../../../app/(drawer)/_layout.tsx");
    expect(src).toContain("const renderDrawerContent = useCallback(");
    expect(src).toContain("drawerContent={renderDrawerContent}");
    expect(src).toContain("const screenOptions = useMemo(");
    expect(src).toContain("screenOptions={screenOptions}");
    expect(src).not.toContain(
      "drawerContent={(props) => <DrawerContent {...props} />}",
    );
  });

  test("tidak ada langganan store di drawer layout", () => {
    const src = stripComments(read("../../../app/(drawer)/_layout.tsx"));
    expect(src).not.toContain("usePlayerStore");
    expect(src).not.toContain("useLibraryStore");
    expect(src).not.toContain("useToastStore");
    expect(src).toContain("useTheme()");
  });
});
