// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// root layout harus memenuhi prinsip render per-node:
// - AudioPropertyToast global hanya melanggan currentSong (bukan seluruh
//   playerStore — tick posisi tidak lagi membangunkan toast global)
// - ThemeContext: value provider useMemo + aksi useCallback (render
//   RootLayout saat boot tidak membangunkan semua pemakai useTheme)
// - ThemedStack: screenOptions + opsi layar player stabil (useMemo)
// - ErrorScreen memo + onRetry stabil
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("root layout node render", () => {
  test("AudioPropertyToast: currentSong per nilai", () => {
    const src = stripComments(
      read(
        "../../../features/player/components/AudioPropertyToast.tsx",
      ),
    );
    expect(src).toContain(
      "usePlayerStore((state) => state.currentSong)",
    );
    expect(src).not.toMatch(/usePlayerStore\(\);/);
  });

  test("ThemeContext: value useMemo + aksi useCallback", () => {
    const src = read("../../../shared/context/ThemeContext.tsx");
    expect(src).toContain("const contextValue = useMemo(");
    expect(src).toContain("<ThemeContext.Provider value={contextValue}>");
    expect(src).toContain("const setTheme = useCallback(");
    expect(src).toContain("const toggleTheme = useCallback(");
    expect(src).toContain("const randomTheme = useCallback(");
    expect(src).not.toContain("value={{\n        theme,");
  });

  test("ThemedStack: screenOptions + opsi player stabil", () => {
    const src = read("../../../app/_layout.tsx");
    expect(src).toContain("const screenOptions = useMemo(");
    expect(src).toContain("const playerScreenOptions = useMemo(");
    expect(src).toContain("<Stack screenOptions={screenOptions}>");
    expect(src).toContain(
      '<Stack.Screen name="player/index" options={playerScreenOptions} />',
    );
  });

  test("ErrorScreen memo + retry stabil", () => {
    const src = read("../../../app/_layout.tsx");
    expect(src).toContain("const ErrorScreen = memo(function ErrorScreen");
    expect(src).toContain("handleRetryInit = useCallback");
    expect(src).toContain("onRetry={handleRetryInit}");
  });

  test("GlobalToast sudah per nilai (verifikasi, tidak diubah)", () => {
    const src = read("../../../shared/components/ui/GlobalToast.tsx");
    expect(src).toContain("useToastStore((s) => s.toast)");
    expect(src).toContain("useToastStore((s) => s.dismissToast)");
  });
});
