// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Analyzer harus memenuhi prinsip render per-node:
// - poll bit-perfect / output tidak membangunkan pemakai saat nilainya diam
// - drag slider batas frekuensi hanya me-render ulang kartu spektrum
// - baris info memo
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");

describe("analyzer node render", () => {
  test("useBitPerfectStatus: poll hanya setState bila ada field berubah", () => {
    const src = read(
      "../../../features/player/hooks/useBitPerfectStatus.ts",
    );
    expect(src).toContain("sameBitPerfectStatus");
    expect(src).toContain("setStatus((prev) =>");
    expect(src).toContain("sameBitPerfectStatus(prev, next) ? prev : next");
  });

  test("useAudioOutput: sync 3 detik hanya setState bila perangkat/status berubah", () => {
    const src = read(
      "../../../features/hardware/hooks/useAudioOutput.ts",
    );
    expect(src).toContain("sameDevice");
    expect(src).toContain("sameStatus");
    expect(src).toContain("sameStatus(prev, nextStatus) ? prev : nextStatus");
    expect(src).toContain("sameDevice(prev, nextDevice) ? prev : nextDevice");
    // guard membandingkan semua field tampilan perangkat + status jalur
    expect(src).toContain("prev.sampleRate === next.sampleRate");
    expect(src).toContain("prev.rateHonored === next.rateHonored");
  });

  test("Analyzer: SpectrumCard memo + pemilik state freqMaxHz", () => {
    const src = read("../../../app/(drawer)/(tabs)/analyzer.tsx");
    expect(src).toContain("const SpectrumCard = memo(function SpectrumCard");
    expect(src).toContain("const [freqMaxHz, setFreqMaxHz]");
    // induk tidak lagi menyimpan freqMaxHz / menghitung effectiveFreqMax
    // (komentar penjelas dihapus dulu — yang diuji kodenya)
    const screenBody = src
      .slice(
        src.indexOf("export default function AnalyzerScreen"),
        src.indexOf("const SpectrumCard = memo"),
      )
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(screenBody).not.toContain("freqMaxHz");
    expect(screenBody).not.toContain("effectiveFreqMax");
    expect(screenBody).not.toContain("streamNyquist");
    // retry tetap useCallback stabil supaya memo kartu tidak batal
    expect(src).toContain("const handleRetrySession = useCallback");
    expect(src).toContain("onRetrySession={handleRetrySession}");
  });

  test("Analyzer: InfoRow memo", () => {
    const src = read("../../../app/(drawer)/(tabs)/analyzer.tsx");
    expect(src).toContain("const InfoRow = memo(");
  });

  test("Analyzer: langganan player per nilai, bukan seluruh store", () => {
    const src = read("../../../app/(drawer)/(tabs)/analyzer.tsx");
    expect(src).toContain(
      "usePlayerStore((state) => state.currentSong)",
    );
    expect(src).toContain(
      "usePlayerStore((state) => state.isPlaying)",
    );
    expect(src).toContain(
      "usePlayerStore((state) => state.audioSessionId)",
    );
    expect(src).not.toMatch(/usePlayerStore\(\);/);
    expect(src).not.toMatch(/const \{[^}]*\} = usePlayerStore\(\);/);
  });
});
