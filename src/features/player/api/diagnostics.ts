/**
 * Audio Diagnostics — Top-down telemetry from JS.
 * Semua data diambil via NativePlaybackService, no native log needed.
 */

import { NativeModules, Platform } from "react-native";

const NativePlaybackService = NativeModules.NativePlaybackService;
const NativePlaybackModule = NativeModules.NativePlaybackModule;

function getService() {
  return NativePlaybackService || NativePlaybackModule || null;
}

// ─────────────────────────────────────────────
// Single-shot snapshot
// ─────────────────────────────────────────────

export interface AudioSnapshot {
  timestamp: number;
  status: number;
  statusLabel: string;
  positionMs: number;
  currentTrack: string;
}

export async function getAudioSnapshot(): Promise<AudioSnapshot | null> {
  const svc = getService();
  if (!svc) {
    console.warn("[DIAG] No NativePlaybackService");
    return null;
  }

  try {
    // Support berbagai signature (promise / sync)
    const status = await Promise.resolve(
      typeof svc.getStatus === "function"
        ? svc.getStatus.length > 0
          ? new Promise((res) => svc.getStatus(res))
          : svc.getStatus()
        : 0,
    );
    const position = await Promise.resolve(
      typeof svc.getPosition === "function"
        ? svc.getPosition.length > 0
          ? new Promise((res) => svc.getPosition(res))
          : svc.getPosition()
        : 0,
    );
    const track = await Promise.resolve(
      typeof svc.getCurrentTrack === "function"
        ? svc.getCurrentTrack.length > 0
          ? new Promise((res) => svc.getCurrentTrack(res))
          : svc.getCurrentTrack()
        : "",
    );

    return {
      timestamp: Date.now(),
      status,
      statusLabel: status === 0 ? "STOPPED" : status === 1 ? "PLAYING" : status === 2 ? "PAUSED" : `UNKNOWN(${status})`,
      positionMs: typeof position === "number" ? position : 0,
      currentTrack: typeof track === "string" ? track : String(track),
    };
  } catch (e) {
    console.warn("[DIAG] Snapshot error:", e);
    return null;
  }
}

// ─────────────────────────────────────────────
// Continuous monitor
// ─────────────────────────────────────────────

export interface DiagnosticEvent {
  type: "SLOW" | "FAST" | "STUCK" | "RESUMED" | "STATE_CHANGE";
  detail: string;
  timestamp: number;
}

export interface AudioDiagnosticsHandle {
  stop: () => void;
  getEvents: () => DiagnosticEvent[];
  getLastSnapshot: () => AudioSnapshot | null;
}

export function startAudioDiagnostics(options?: {
  intervalMs?: number;
  speedLowThreshold?: number;
  speedHighThreshold?: number;
  verbose?: boolean;
}): AudioDiagnosticsHandle {
  const intervalMs = options?.intervalMs ?? 2000;
  const speedLow = options?.speedLowThreshold ?? 0.5;
  const speedHigh = options?.speedHighThreshold ?? 1.5;
  const verbose = options?.verbose ?? true;

  const events: DiagnosticEvent[] = [];
  let lastPosition = 0;
  let lastTime = Date.now();
  let lastStatus = -1;
  let lastSnapshot: AudioSnapshot | null = null;

  const timer = setInterval(async () => {
    const snap = await getAudioSnapshot();
    if (!snap) return;
    lastSnapshot = snap;

    const now = snap.timestamp;
    const elapsed = (now - lastTime) / 1000;
    const deltaPos = (snap.positionMs - lastPosition) / 1000;
    const speed = elapsed > 0 ? deltaPos / elapsed : 0;

    // Detect state change
    if (snap.status !== lastStatus) {
      events.push({
        type: "STATE_CHANGE",
        detail: `${lastStatus} → ${snap.status} (${snap.statusLabel})`,
        timestamp: now,
      });
      lastStatus = snap.status;
    }

    // Detect speed issues (only saat playing)
    if (snap.status === 2) {
      if (speed < speedLow && speed >= 0) {
        events.push({
          type: "SLOW",
          detail: `${speed.toFixed(2)}x (expected 1.0x)`,
          timestamp: now,
        });
      } else if (speed > speedHigh) {
        events.push({
          type: "FAST",
          detail: `${speed.toFixed(2)}x (expected 1.0x)`,
          timestamp: now,
        });
      }
    }

    if (verbose) {
      console.log(
        `[DIAG] ${snap.statusLabel} pos=${snap.positionMs}ms speed=${speed.toFixed(2)}x`,
      );
    }

    lastPosition = snap.positionMs;
    lastTime = now;
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
    getEvents: () => [...events],
    getLastSnapshot: () => lastSnapshot,
  };
}

// ─────────────────────────────────────────────
// Quick report
// ─────────────────────────────────────────────

export function printDiagnosticReport(handle: AudioDiagnosticsHandle) {
  const events = handle.getEvents();
  const snap = handle.getLastSnapshot();

  console.log("═══════════════════════════════════════════");
  console.log("  AUDIO DIAGNOSTIC REPORT");
  console.log("═══════════════════════════════════════════");
  console.log(`  Last snapshot: ${snap?.statusLabel ?? "N/A"} @ ${snap?.positionMs ?? 0}ms`);
  console.log(`  Total events:  ${events.length}`);

  const grouped = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [type, count] of Object.entries(grouped)) {
    console.log(`  ${type}: ${count}x`);
  }

  console.log("═══════════════════════════════════════════");
}