// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Onboarding harus memenuhi prinsip render per-node:
// - ModeCard memo + onSelect stabil + tags referensi modul
// - hanya aksi setAudioMode yang dilanggan dari playerStore
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("onboarding node render", () => {
  test("ModeCard memo + onSelect stabil + tags modul", () => {
    const src = read("../../../app/onboarding.tsx");
    expect(src).toContain("const ModeCard = memo(function ModeCard");
    expect(src).toContain("handleSelectMode = useCallback");
    expect(src).toContain("const MODE_TAGS: Record<AudioMode, string[]>");
    expect(src).toContain('tags={MODE_TAGS["bit-perfect"]}');
    expect(src).toContain('tags={MODE_TAGS["dsp"]}');
    expect(src).toContain('tags={MODE_TAGS["immersive"]}');
    expect(src).not.toContain('tags={["LOSSLESS", "DAC"]}');
  });

  test("hanya aksi setAudioMode dari playerStore", () => {
    const src = stripComments(read("../../../app/onboarding.tsx"));
    expect(src).toContain("usePlayerStore((s) => s.setAudioMode)");
    expect(src).not.toMatch(/usePlayerStore\(\);/);
  });
});
