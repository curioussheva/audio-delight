// src/features/equalizer/api/dragDiag.ts
//
// [DRAG-DIAG] — DIAGNOSTIK SEMENTARA (logcat #8, 2026-11-20).
// BUKAN fitur. Hapus file ini + pemakaian di equalizerStore.ts
// (applyEqThrottled, setBandGain store throttle, pushMasterGainThrottled,
// setBassBoost / setVirtualizer / setReverb) + penyalaan di _layout.tsx
// begitu pertanyaan di bawah terjawab.
//
// PERTANYAAN: logcat #8 menunjukkan ketiga slider (gain, widener, bass)
// hanya ~1 update/detik saat di-drag padahal throttle dirancang 100 ms.
// Dua mekanisme yang bisa menjelaskan, dan keduanya buta sebelum ronde ini:
//  - Throttle (bands/store/gain): tick dalam jendela yang digabung ke
//    trailing fire = "dropped" (nilai akhir tetap terkirim, tapi tick
//    hilang). Kalau dropped mendominasi, ~1 update/detik itu WAJAR dari
//    sisi throttle — bukan bug.
//  - Setter TANPA throttle (setVirtualizer / setBassBoost / setReverb —
//    terverifikasi: tiap tick langsung `await` native, tanpa throttle
//    apa pun): kalau satu panggilan butuh ~1–4,5 dtk, tick berikutnya
//    menumpuk di belakangnya (overlap). Kalau overlap mendominasi,
//    fix-nya adalah throttle/fire-and-forget untuk ketiga setter ini.
//  - applyEqThrottled / pushMasterGainThrottled: "apply masih PENDING
//    saat tick berikut datang" = trailing timer sudah terjadwal saat tick
//    masuk (dihitung sebagai dropped di atas) — dan fire() yang tidak
//    mengirim apa-apa karena guard (EQ mati / session -1) dihitung
//    sebagai "skipped".
//
// Modul ini SENGAJA tidak mengimpor react-native / spec TurboModule:
// logika murni yang bisa diuji jest (aturan jest.config.cjs). Dinyalakan
// lewat diagGate (flag globalThis, diset _layout.tsx di efek dev-only);
// default MATI, jadi release tidak pernah log dan tidak menambah beban.

import { isTempDiagEnabled } from "@/shared/utils/diagGate";

/** Throttle yang dipantau (satu per jalur drag di equalizerStore). */
export type ThrottleName =
  | "bands"
  | "store"
  | "gain"
  // (logcat #9) tiga setter drag yang dulu tanpa throttle — kini lewat
  // effectPusher (leading + trailing, 100 ms), satu nama per setter.
  | "bass"
  | "widener"
  | "reverb";

/** Hasil satu tick throttle. */
export type ThrottleOutcome = "fired" | "trailing" | "dropped" | "skipped";

/** Setter drag tanpa throttle (tiap tick langsung await native). */
export type DragSetterName = "setVirtualizer" | "setBassBoost" | "setReverb";

/** Round-trip setter ≥ ini langsung dilog sebagai SLOW (ms). */
const SLOW_SETTER_MS = 1000;
/** Ringkas setter tiap N panggilan selesai. */
const SUMMARY_EVERY_SETTER_CALLS = 10;
/** Jeda minimum antar ringkasan throttle per nama (ms). */
const THROTTLE_SUMMARY_MIN_GAP_MS = 1000;
/** Jeda minimum antar baris overlap per setter (ms). */
const OVERLAP_LOG_MIN_GAP_MS = 1000;

export interface SetterHandle {
  name: DragSetterName;
  t0: number;
  /** false bila start dipanggil saat diagnostik mati (end jadi no-op). */
  active: boolean;
}

type ThrottleCounts = Record<ThrottleOutcome, number>;

const emptyCounts = (): ThrottleCounts => ({
  fired: 0,
  trailing: 0,
  dropped: 0,
  skipped: 0,
});

let throttleCounts: Record<ThrottleName, ThrottleCounts> = {
  bands: emptyCounts(),
  store: emptyCounts(),
  gain: emptyCounts(),
  bass: emptyCounts(),
  widener: emptyCounts(),
  reverb: emptyCounts(),
};
let throttleActivitySinceSummary: Record<ThrottleName, boolean> = {
  bands: false,
  store: false,
  gain: false,
  bass: false,
  widener: false,
  reverb: false,
};
let throttleLastSummaryAt: Record<ThrottleName, number> = {
  bands: 0,
  store: 0,
  gain: 0,
  bass: 0,
  widener: 0,
  reverb: 0,
};

let setterInFlight: Record<DragSetterName, number> = {
  setVirtualizer: 0,
  setBassBoost: 0,
  setReverb: 0,
};
let setterOverlaps: Record<DragSetterName, number> = {
  setVirtualizer: 0,
  setBassBoost: 0,
  setReverb: 0,
};
let setterLastOverlapLogAt: Record<DragSetterName, number> = {
  setVirtualizer: 0,
  setBassBoost: 0,
  setReverb: 0,
};
let setterSamples: Array<{ name: DragSetterName; ms: number }> = [];
const MAX_SETTER_SAMPLES = 120;

/** Median (rata-rata dua tengah bila genap). NaN bila kosong. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Catat hasil satu tick throttle. Ringkasan per nama paling sekali
 * per detik dan hanya bila ada aktivitas sejak ringkasan terakhir —
 * drag 20 dtk menghasilkan ~20 baris per throttle, bukan per tick.
 */
export function noteThrottleTick(
  name: ThrottleName,
  outcome: ThrottleOutcome,
  nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  throttleCounts[name][outcome] += 1;
  throttleActivitySinceSummary[name] = true;
  if (
    throttleActivitySinceSummary[name] &&
    nowMs - throttleLastSummaryAt[name] >= THROTTLE_SUMMARY_MIN_GAP_MS
  ) {
    throttleLastSummaryAt[name] = nowMs;
    throttleActivitySinceSummary[name] = false;
    const c = throttleCounts[name];
    console.log(
      `[DRAG-DIAG] throttle=${name} fired=${c.fired} trailing=${c.trailing} dropped=${c.dropped} skipped=${c.skipped}`,
    );
  }
}

/**
 * Catat mulainya satu panggilan setter tanpa throttle. Kalau panggilan
 * sebelumnya masih in-flight, hitung overlap (dilog paling sekali per
 * detik per setter — drag yang macet tidak membanjiri log).
 */
export function noteSetterStart(
  name: DragSetterName,
  nowMs: number = performance.now(),
): SetterHandle {
  if (!isTempDiagEnabled()) return { name, t0: nowMs, active: false };
  setterInFlight[name] += 1;
  if (setterInFlight[name] > 1) {
    setterOverlaps[name] += 1;
    if (nowMs - setterLastOverlapLogAt[name] >= OVERLAP_LOG_MIN_GAP_MS) {
      setterLastOverlapLogAt[name] = nowMs;
      console.log(
        `[DRAG-DIAG] setter=${name} overlap depth=${setterInFlight[name]} overlaps=${setterOverlaps[name]}`,
      );
    }
  }
  return { name, t0: nowMs, active: true };
}

/**
 * Catat selesainya satu panggilan setter. SLOW (≥1 dtk) dilog
 * langsung; ringkasan tiap 10 panggilan selesai.
 */
export function noteSetterEnd(
  handle: SetterHandle,
  nowMs: number = performance.now(),
): void {
  if (!handle.active) return;
  const ms = nowMs - handle.t0;
  setterInFlight[handle.name] = Math.max(
    0,
    setterInFlight[handle.name] - 1,
  );
  setterSamples.push({ name: handle.name, ms });
  if (setterSamples.length > MAX_SETTER_SAMPLES) {
    setterSamples = setterSamples.slice(
      setterSamples.length - MAX_SETTER_SAMPLES,
    );
  }
  if (ms >= SLOW_SETTER_MS) {
    console.log(
      `[DRAG-DIAG] setter=${handle.name} SLOW roundTrip=${Math.round(ms)}ms inFlight=${setterInFlight[handle.name]}`,
    );
  }
  if (setterSamples.length % SUMMARY_EVERY_SETTER_CALLS === 0) {
    const parts: string[] = [];
    (
      Object.keys(setterInFlight) as DragSetterName[]
    ).forEach((name) => {
      const msList = setterSamples
        .filter((s) => s.name === name)
        .map((s) => s.ms);
      if (msList.length === 0) return;
      parts.push(
        `${name}: n=${msList.length} med=${Math.round(median(msList))}ms max=${Math.round(Math.max(...msList))}ms overlaps=${setterOverlaps[name]}`,
      );
    });
    if (parts.length > 0) {
      console.log(`[DRAG-DIAG] setters summary ${parts.join(" | ")}`);
    }
  }
}

/** Hitungan throttle (untuk tes). */
export function getThrottleCounts(): Record<ThrottleName, ThrottleCounts> {
  return {
    bands: { ...throttleCounts.bands },
    store: { ...throttleCounts.store },
    gain: { ...throttleCounts.gain },
    bass: { ...throttleCounts.bass },
    widener: { ...throttleCounts.widener },
    reverb: { ...throttleCounts.reverb },
  };
}

/** In-flight + overlap per setter (untuk tes). */
export function getSetterState(): {
  inFlight: Record<DragSetterName, number>;
  overlaps: Record<DragSetterName, number>;
} {
  return {
    inFlight: { ...setterInFlight },
    overlaps: { ...setterOverlaps },
  };
}

/** Reset seluruh state (tes; juga dipakai saat diagnostik di-stop). */
export function resetDragDiagState(): void {
  throttleCounts = {
    bands: emptyCounts(),
    store: emptyCounts(),
    gain: emptyCounts(),
    bass: emptyCounts(),
    widener: emptyCounts(),
    reverb: emptyCounts(),
  };
  throttleActivitySinceSummary = {
    bands: false,
    store: false,
    gain: false,
    bass: false,
    widener: false,
    reverb: false,
  };
  throttleLastSummaryAt = {
    bands: 0,
    store: 0,
    gain: 0,
    bass: 0,
    widener: 0,
    reverb: 0,
  };
  setterInFlight = { setVirtualizer: 0, setBassBoost: 0, setReverb: 0 };
  setterOverlaps = { setVirtualizer: 0, setBassBoost: 0, setReverb: 0 };
  setterLastOverlapLogAt = {
    setVirtualizer: 0,
    setBassBoost: 0,
    setReverb: 0,
  };
  setterSamples = [];
}
