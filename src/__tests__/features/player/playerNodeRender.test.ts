// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// layar Player harus memenuhi prinsip render per-node:
// - induk tidak melanggan seluruh playerStore
// - tick posisi + drag seek hanya me-render ulang PlayerSeekBar
// - detak 1 detik sleep timer hanya me-render ulang SleepTimerButton
// - komponen anak layar (lirik/antrean/sleep modal) selector per nilai
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("player node render", () => {
  test("PlayerScreen: selector per nilai, bukan seluruh store", () => {
    const src = stripComments(
      read("../../../app/player/index.tsx"),
    );
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
    // posisi/durasi tidak dilanggan induk — milik PlayerSeekBar
    const screenBody = src.slice(
      src.indexOf("export default function PlayerScreen"),
    );
    expect(screenBody).not.toContain("useAudioProgress()");
    expect(screenBody).not.toContain("dragPosition");
    expect(screenBody).not.toContain("sleepNow");
  });

  test("PlayerSeekBar: memo + langganan posisi + drag lokal sendiri", () => {
    const src = read("../../../app/player/index.tsx");
    expect(src).toContain("const PlayerSeekBar = memo(function PlayerSeekBar");
    const body = src.slice(src.indexOf("const PlayerSeekBar = memo"));
    expect(body).toContain("const { position, duration } = useAudioProgress();");
    expect(body).toContain("const [dragPosition, setDragPosition]");
    expect(body).toContain("useEffect(() => {\n    setDragPosition(null);\n  }, [songId]);");
    expect(src).toContain("<PlayerSeekBar");
    expect(src).toContain("songId={currentSong.id}");
  });

  test("SleepTimerButton: memo + detak 1 detik + langganan sleepTimerEnd sendiri", () => {
    const src = read("../../../app/player/index.tsx");
    expect(src).toContain(
      "const SleepTimerButton = memo(function SleepTimerButton",
    );
    const body = src.slice(src.indexOf("const SleepTimerButton = memo"));
    expect(body).toContain(
      "usePlayerStore((state) => state.sleepTimerEnd)",
    );
    expect(body).toContain("setInterval(() => setSleepNow(Date.now()), 1000)");
    expect(src).toContain("<SleepTimerButton");
    expect(src).toContain("handleOpenTimer = useCallback");
  });

  test("PS-6: position watcher hanya bekerja saat bermain, interval tetap 500 ms", () => {
    const src = stripComments(
      read("../../../features/player/store/playerStore.ts"),
    );
    const watcher = src.slice(src.indexOf("__positionWatcher = setInterval"));
    // Interval tetap satu dan tetap 500 ms — tidak dimatikan, tidak
    // dibuat ulang mengikuti isPlaying (singleton di initStore).
    expect(src).toContain("Position watcher started (500ms)");
    expect(watcher).toContain("}, 500);");
    // Cabang pause: lewati getPosition/MediaSession, TAPI perbarui
    // jangkar statistik — dan cabang ini harus datang SEBELUM
    // getPosition dipanggil.
    expect(watcher).toContain(
      "if (!s.isPlaying) {\n          notePlaybackPosition(s.currentSong.id, get().position);",
    );
    expect(
      watcher.indexOf("if (!s.isPlaying)"),
    ).toBeLessThan(watcher.indexOf("NativePlaybackService.getPosition()"));
    // STAT-3: interval tetap 500 ms → gate ±2 dtk tetap cukup (delta
    // nominal ~1 dtk di 2x); jangan naikkan MAX tanpa mengubah interval.
    const stats = stripComments(
      read("../../../features/stats/api/statsService.ts"),
    );
    expect(stats).toContain("const MAX_COUNTED_DELTA_SECONDS = 2;");
  });

  test("FullLyricsView / QueueManager / SleepTimerModal: selector per nilai", () => {
    const lyrics = read(
      "../../../features/player/components/FullLyricsView.tsx",
    );
    expect(lyrics).toContain("usePlayerStore((state) => state.lyrics)");
    expect(lyrics).toContain("usePlayerStore((state) => state.position)");
    expect(lyrics).not.toMatch(/usePlayerStore\(\);/);

    const queue = read(
      "../../../features/player/components/QueueManager.tsx",
    );
    expect(queue).toContain("usePlayerStore((state) => state.queue)");
    expect(queue).toContain(
      "usePlayerStore((state) => state.currentSong)",
    );
    expect(queue).toContain("usePlayerStore((state) => state.playSong)");
    expect(queue).not.toMatch(/usePlayerStore\(\);/);

    const timer = read(
      "../../../features/player/components/SleepTimerModal.tsx",
    );
    expect(timer).toContain(
      "usePlayerStore((state) => state.setSleepTimer)",
    );
    expect(timer).toContain(
      "usePlayerStore((state) => state.sleepTimerEnd)",
    );
    expect(timer).not.toMatch(/usePlayerStore\(\);/);
  });
});
