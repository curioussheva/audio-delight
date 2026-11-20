// src/features/player/api/eventLag.ts
//
// [EVENT-LAG] + [DIAG] mode-switch — DIAGNOSTIK SEMENTARA (logcat #8, 2026-11-20).
// BUKAN fitur. Hapus file ini + pemakaian di playerStore.ts (4 listener
// native→JS, position watcher, setAudioMode) + penyalaan di _layout.tsx
// begitu pertanyaan di bawah terjawab.
//
// PERTANYAAN: logcat #8 menunjukkan setter DSP butuh ~1–4,5 dtk di sisi
// JS sementara native 0–2 ms, dan slider hanya ~1 update/detik saat
// di-drag. [BRIDGE-PROBE] mengukur arah JS→native. Yang ini mengukur
// arah SEBALIKNYA — native→JS:
//  - Event native (track-ended, playback-state, track-changed,
//    repeat/shuffle) SUDAH dilog saat tiba (`[Player] ... event:` di
//    playerStore) — yang kurang adalah kapan penanganannya SELESAI.
//    Selisih tiba→selesai = beban handler JS (termasuk syncFromNative
//    yang memanggil bridge). Kalau handler sendiri lambat, JS-nya yang
//    sibuk; kalau handler cepat tapi event datang berkelompok sesudah
//    jeda panjang, JS-nya yang tidur.
//  - Position watcher 500 ms: celah antar tick (interval yang kelaparan
//    = JS tidak sempat jalan) + durasi await getPosition() (panggilan
//    bridge sinkron yang dicurigai insight migrasi). Tick yang dilewati
//    karena tick sebelumnya masih in-flight juga dihitung.
//  - Mode-switch: satu baris [DIAG] per ganti mode (from → to +
//    exclusiveToggled/restartExpected) — instrumen tes penentu bug 01:24
//    yang disetujui csheva. "Mode yang benar-benar diterapkan pipeline"
//    dibuktikan baris [MODE-DIAG] noteMode di C++ (AudioPipeline.cpp);
//    "stream restart" dibuktikan baris `AudioStreamController open:` di
//    log yang sama (lihat debug-logging-strategy-report.md).
//
// BATAS JUJUR: delay murni bridge native-emit → callback JS TIDAK bisa
// diukur dari JS saja (payload event tidak membawa timestamp native) —
// itu butuh perubahan native di emit (follow-up, bukan ronde ini).
// Yang diukur di sini adalah waktu handler + celah tick, yang bersama
// [BRIDGE-PROBE] dan [JSLag] cukup memisahkan "bridge lambat" dari
// "JS kelaparan".
//
// Modul ini SENGAJA tidak mengimpor react-native / spec TurboModule:
// logika murni yang bisa diuji jest (aturan jest.config.cjs). Dinyalakan
// lewat diagGate (flag globalThis, diset _layout.tsx di efek dev-only);
// default MATI, jadi release tidak pernah log.

import { isTempDiagEnabled } from "@/shared/utils/diagGate";

/** Event native→JS yang dipantau (satu per listener di playerStore). */
export type NativePlayerEvent =
  | "track-ended"
  | "playback-state"
  | "track-changed"
  | "repeat-shuffle";

/** Handler ≥ ini langsung dilog sebagai SLOW (ms). */
const SLOW_EVENT_MS = 100;
/** getPosition() ≥ ini langsung dilog sebagai SLOW (ms). */
const SLOW_POSITION_AWAIT_MS = 100;
/** Celah tick ≥ ini langsung dilog (interval 500 ms yang kelaparan). */
const SLOW_POSITION_GAP_MS = 1000;
/** Ringkas event tiap N sampel. */
const SUMMARY_EVERY_EVENT_SAMPLES = 10;
/** Ringkas position watcher tiap N tick. */
const SUMMARY_EVERY_POSITION_TICKS = 60;

export interface EventLagSample {
  event: NativePlayerEvent;
  /** Tiba → penanganan selesai, milidetik. */
  ms: number;
  at: number;
}

export interface EventLagStats {
  count: number;
  median: number;
  max: number;
}

const MAX_SAMPLES = 120;

let eventSamples: EventLagSample[] = [];
let positionTicks = 0;
let positionSkipped = 0;
let positionFailed = 0;
let maxPositionAwait = 0;
let maxPositionGap = 0;
/** null = belum pernah log skip (skip pertama selalu dilog langsung). */
let lastSkippedLogAt: number | null = null;

/** Median (rata-rata dua tengah bila genap). NaN bila kosong. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Statistik per event; event tanpa sampel = null. */
export function summarizeEventLags(
  list: EventLagSample[],
): Record<NativePlayerEvent, EventLagStats | null> {
  const out: Record<NativePlayerEvent, EventLagStats | null> = {
    "track-ended": null,
    "playback-state": null,
    "track-changed": null,
    "repeat-shuffle": null,
  };
  (Object.keys(out) as NativePlayerEvent[]).forEach((name) => {
    const ms = list.filter((s) => s.event === name).map((s) => s.ms);
    if (ms.length === 0) return;
    out[name] = { count: ms.length, median: median(ms), max: Math.max(...ms) };
  });
  return out;
}

function logEventSummary(): void {
  const byEvent = summarizeEventLags(eventSamples);
  const parts: string[] = [];
  (Object.keys(byEvent) as NativePlayerEvent[]).forEach((name) => {
    const stats = byEvent[name];
    if (stats) {
      parts.push(
        `${name}: n=${stats.count} med=${Math.round(stats.median)}ms max=${Math.round(stats.max)}ms`,
      );
    }
  });
  if (parts.length > 0) {
    console.log(`[EVENT-LAG] summary ${parts.join(" | ")}`);
  }
}

/**
 * Catat selesainya penanganan satu event native. Dipanggil dari blok
 * `finally` tiap listener di playerStore (startedAt dicatat di entri
 * handler = saat event TIBA di JS). Hanya dilog langsung bila SLOW;
 * ringkasan tiap 10 sampel.
 */
export function noteNativeEventHandled(
  event: NativePlayerEvent,
  startedAtMs: number,
  nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  const ms = nowMs - startedAtMs;
  eventSamples.push({ event, ms, at: nowMs });
  if (eventSamples.length > MAX_SAMPLES) {
    eventSamples = eventSamples.slice(eventSamples.length - MAX_SAMPLES);
  }
  if (ms >= SLOW_EVENT_MS) {
    console.log(
      `[EVENT-LAG] event=${event} handledLag=${Math.round(ms)}ms`,
    );
  }
  if (eventSamples.length % SUMMARY_EVERY_EVENT_SAMPLES === 0) {
    logEventSummary();
  }
}

/**
 * Catat satu tick position watcher. `awaitMs` = durasi await
 * getPosition() (-1 = getPosition gagal, catch diam-diam di watcher);
 * `gapMs` = celah sejak tick sebelumnya (500 nominal). Hanya dilog
 * langsung bila SLOW; ringkasan tiap 60 tick.
 */
export function notePositionTick(
  awaitMs: number,
  gapMs: number,
  _nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  positionTicks += 1;
  if (awaitMs < 0) {
    positionFailed += 1;
  } else {
    maxPositionAwait = Math.max(maxPositionAwait, awaitMs);
  }
  maxPositionGap = Math.max(maxPositionGap, gapMs);
  if (awaitMs >= SLOW_POSITION_AWAIT_MS || gapMs >= SLOW_POSITION_GAP_MS) {
    console.log(
      `[EVENT-LAG] position await=${awaitMs < 0 ? "fail" : `${Math.round(awaitMs)}ms`} gap=${Math.round(gapMs)}ms`,
    );
  }
  if (positionTicks % SUMMARY_EVERY_POSITION_TICKS === 0) {
    console.log(
      `[EVENT-LAG] position summary ticks=${positionTicks} maxAwait=${Math.round(maxPositionAwait)}ms maxGap=${Math.round(maxPositionGap)}ms skipped=${positionSkipped} failed=${positionFailed}`,
    );
    maxPositionAwait = 0;
    maxPositionGap = 0;
  }
}

/**
 * Catat tick yang dilewati karena tick sebelumnya masih in-flight
 * (guard `_posInFlight` di watcher). Dilog paling sekali per detik
 * supaya stall 20 dtk tidak membanjiri log (40 baris) — hitungannya
 * tetap muncul di ringkasan position.
 */
export function notePositionTickSkipped(
  nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  positionSkipped += 1;
  if (lastSkippedLogAt === null || nowMs - lastSkippedLogAt >= 1000) {
    lastSkippedLogAt = nowMs;
    console.log(
      `[EVENT-LAG] position tick skipped prevInFlight=true skipped=${positionSkipped}`,
    );
  }
}

/**
 * Satu baris [DIAG] per ganti mode (tes penentu bug 01:24).
 * `exclusiveToggled` = toggleExclusiveMode dipanggil (hanya transisi
 * masuk/keluar bit-perfect) — dan toggle itu stop+start stream, jadi
 * restartExpected = exclusiveToggled. Restart yang BENAR-BENAR terjadi
 * dibaca dari baris `AudioStreamController open:` di log yang sama;
 * mode yang diterapkan pipeline dibaca dari `[MODE-DIAG] noteMode`.
 */
export function noteModeSwitch(
  from: string,
  to: string,
  exclusiveToggled: boolean,
): void {
  if (!isTempDiagEnabled()) return;
  console.log(
    `[DIAG] mode-switch from=${from} to=${to} exclusiveToggled=${exclusiveToggled} restartExpected=${exclusiveToggled}`,
  );
}

/** Salinan buffer sampel (untuk tes). */
export function getEventLagSamples(): EventLagSample[] {
  return [...eventSamples];
}

/** Hitungan position watcher (untuk tes). */
export function getPositionTickCounts(): {
  ticks: number;
  skipped: number;
  failed: number;
} {
  return { ticks: positionTicks, skipped: positionSkipped, failed: positionFailed };
}

/** Reset seluruh state (tes; juga dipakai saat diagnostik di-stop). */
export function resetEventLagState(): void {
  eventSamples = [];
  positionTicks = 0;
  positionSkipped = 0;
  positionFailed = 0;
  maxPositionAwait = 0;
  maxPositionGap = 0;
  lastSkippedLogAt = null;
}
