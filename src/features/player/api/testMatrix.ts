/**
 * Test Matrix — automated multi-file audio test.
 */

import { getAudioSnapshot, startAudioDiagnostics, printDiagnosticReport } from "./diagnostics";
import { NativeModules } from "react-native";

const NativePlaybackService = NativeModules.NativePlaybackService;

export interface TestFile {
  name: string;
  uri: string;
  durationSec?: number;
}

export const DEFAULT_TEST_FILES: TestFile[] = [
  {
    name: "MP3 44.1kHz",
    uri: "/storage/emulated/0/Music/test.mp3",
    durationSec: 18,
  },
  {
    name: "FLAC 96kHz (Enya)",
    uri: "/storage/emulated/0/Music/Enya_-_Dark_Sky_Island.flac",
    durationSec: 30,
  },
  {
    name: "FLAC 44.1kHz (Leo Rojas)",
    uri: "/storage/emulated/0/Music/The Rose - Leo Rojas.mp3",
    durationSec: 20,
  },
];

export async function runAudioTestMatrix(
  files: TestFile[] = DEFAULT_TEST_FILES,
  playDurationSec = 10,
) {
  if (!NativePlaybackService) {
    console.error("[TEST] NativePlaybackService not found");
    return;
  }

  const results: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  [${i + 1}/${files.length}] Testing: ${file.name}`);
    console.log(`  URI: ${file.uri}`);
    console.log(`═══════════════════════════════════════════`);

    const t0 = Date.now();

    try {
      // 1. Set queue
      await Promise.resolve(
        NativePlaybackService.setQueue([file.uri]),
      );
      const tSetQueue = Date.now() - t0;
      console.log(`  ⏱️  setQueue: ${tSetQueue}ms`);

      // 2. Play
      const t1 = Date.now();
      await Promise.resolve(NativePlaybackService.play());
      const tPlay = Date.now() - t1;
      console.log(`  ⏱️  play(): ${tPlay}ms`);

      // 3. Monitor
      const diag = startAudioDiagnostics({ intervalMs: 1000, verbose: false });

      await new Promise((r) => setTimeout(r, playDurationSec * 1000));

      diag.stop();
      const events = diag.getEvents();
      printDiagnosticReport(diag);

      const snap = await getAudioSnapshot();

      results.push({
        file: file.name,
        setQueueMs: tSetQueue,
        playMs: tPlay,
        finalStatus: snap?.statusLabel ?? "N/A",
        finalPositionMs: snap?.positionMs ?? 0,
        slowEvents: events.filter((e) => e.type === "SLOW").length,
        fastEvents: events.filter((e) => e.type === "FAST").length,
        stuckEvents: events.filter((e) => e.type === "STUCK").length,
      });

      // 4. Stop
      await Promise.resolve(NativePlaybackService.stop());
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  ❌ Error:`, e);
      results.push({ file: file.name, error: String(e) });
    }
  }

  console.log(`\n\n═══════════════════════════════════════════`);
  console.log(`  FINAL TEST MATRIX RESULTS`);
  console.log(`═══════════════════════════════════════════`);
  console.table(results);

  return results;
}