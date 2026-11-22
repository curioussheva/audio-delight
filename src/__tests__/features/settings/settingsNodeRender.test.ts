// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Settings harus memenuhi prinsip render per-node:
// - tidak ada lagi langganan seluruh store (library/player/EQ/headphone/RG)
// - drag slider crossfade hanya me-render ulang CrossfadeSetting
// - ReplayGain hanya melanggan id lagu yang diputar, bukan objek currentSong
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("settings node render", () => {
  test("tidak ada langganan seluruh store", () => {
    const src = stripComments(read("../../../app/(drawer)/settings.tsx"));
    expect(src).not.toMatch(/useLibraryStore\(\);/);
    expect(src).not.toMatch(/usePlayerStore\(\);/);
    expect(src).not.toMatch(/useEqualizerStore\(\);/);
    expect(src).not.toMatch(/useHeadphoneStore\(\);/);
    expect(src).not.toMatch(/useReplayGainStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = useLibraryStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = usePlayerStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = useEqualizerStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = useReplayGainStore\(\);/);
  });

  test("selector per nilai untuk field yang dipakai", () => {
    const src = read("../../../app/(drawer)/settings.tsx");
    expect(src).toContain(
      "useLibraryStore((s) => s.isAutoScanEnabled)",
    );
    expect(src).toContain(
      "useLibraryStore((s) => s.isManualScanning)",
    );
    expect(src).toContain("usePlayerStore((s) => s.playbackSpeed)");
    expect(src).toContain("usePlayerStore((s) => s.audioMode)");
    expect(src).toContain("useEqualizerStore((s) => s.activePresetId)");
    expect(src).toContain("useHeadphoneStore((s) => s.resetAll)");
    expect(src).toMatch(/useReplayGainStore\(\s*\(s\) => s\.isReplayGainEnabled,?\s*\)/);
  });

  test("ReplayGain: hanya id lagu yang diputar", () => {
    const src = stripComments(read("../../../app/(drawer)/settings.tsx"));
    expect(src).toMatch(/usePlayerStore\(\s*\(s\) => s\.currentSong\?\.id,?\s*\)/);
    expect(src).not.toContain(
      "usePlayerStore((s) => s.currentSong)",
    );
    expect(src).toContain("replayGainPlayerSongId");
  });

  test("CrossfadeSetting: memo + draft + slider sendiri", () => {
    const src = read("../../../app/(drawer)/settings.tsx");
    expect(src).toContain(
      "const CrossfadeSetting = memo(function CrossfadeSetting",
    );
    const body = src.slice(src.indexOf("const CrossfadeSetting = memo"));
    expect(body).toContain(
      "useCrossfadeStore((s) => s.crossfadeSeconds)",
    );
    expect(body).toContain("const [crossfadeDraft, setCrossfadeDraft]");
    expect(body).toContain("onValueChange={setCrossfadeDraft}");
    expect(body).toContain("onSlidingComplete={handleCrossfadeComplete}");
    expect(src).toContain("<CrossfadeSetting colors={colors} spacing={spacing} />");
    // induk tidak lagi menyimpan draft / handler commit
    const screenBody = src.slice(
      src.indexOf("export default function SettingsScreen"),
    );
    expect(screenBody).not.toContain("crossfadeDraft");
    expect(screenBody).not.toContain("handleCrossfadeComplete");
  });
});
