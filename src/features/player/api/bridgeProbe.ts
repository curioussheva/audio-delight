// src/features/player/api/bridgeProbe.ts
//
// [BRIDGE-PROBE] — DIAGNOSTIK SEMENTARA (logcat #8, 2026-11-20).
// BUKAN fitur. Hapus seluruh file ini + 1 pemanggilan di
// equalizerStore.ts (noteBridgeProbeApply) + start/stop di _layout.tsx
// begitu pertanyaan di bawah terjawab.
//
// PERTANYAAN: dua baris `[DSP] Applied` di logcat #8 menunjukkan tiap
// setter native butuh ~980 ms (apply #1) → ~4.550 ms (apply #2) di sisi
// JS, sementara native sendiri 0–2 ms per `[DSP-TIMING]`. Tiga slider
// hanya ~1 update/detik saat di-drag padahal throttle dirancang 100 ms.
// Ke mana 1–4,5 dtk itu hilang BELUM terbukti: antrean bridge vs beban
// render/store JS per tick vs resolusi promise. Memperbaiki sekarang =
// menebak — probe ini yang memutuskan.
//
// CARA KERJA: satu panggilan native trivial per detik
// (`setCrossfadeSeconds` dengan NILAI SAAT INI — lihat bawah kenapa
// aman), diukur round-trip-nya di sisi JS (`performance.now()` sebelum /
// sesudah `await`). Ditambah satu sampel per apply DSP (angka yang SUDAH
// terukur di apply path — tanpa panggilan native tambahan). Tiap sampel
// ditandai konteksnya: `idle` vs `drag` (apply < 1 dtk lalu) vs `apply`.
// Ringkasan min/median/maks per konteks tiap 10 sampel; sampel > 1 dtk
// langsung dilog sebagai SLOW.
//
// KENAPA `setCrossfadeSeconds` AMAN (terverifikasi ke kode):
// - Native (NativeDSPModule.kt:284): satu panggilan JNI ke
//   PlaybackController, 0–2 ms per `[DSP-TIMING]` — murah.
// - Probe SELALU mengirim nilai tersimpan saat ini (dari
//   crossfadeStore) — mengatur ulang durasi yang sama tidak mengubah
//   suara apa pun (fade hanya berlaku saat auto-advance antar lagu).
// - TIDAK PERNAH dipanggil saat mode bit-perfect (di-gate di sampler).
// - Paling-paling SATU panggilan outstanding (flag inFlight): saat bridge
//   macet, tick berikutnya dilewati, bukan mengantre — probe tidak
//   menambah beban pada stall yang sedang diukurnya.
//
// CARA BACA HASIL (aturan keputusan, lihat bridge-probe-report.md):
// - Round-trip idle pun ~1 dtk → masalahnya di jalur bridge.
// - Idle cepat, lambat HANYA saat drag/apply → beban JS (render/store)
//   per tick.
// - Keduanya cepat → stall 1–4,5 dtk BUKAN dari satu setter; cari di
//   tempat lain (mis. Promise.all 8 setter yang saling menunggu).
//
// Modul ini SENGAJA tidak mengimpor modul native (spec TurboModule):
// supaya tetap logika murni yang bisa diuji jest tanpa mock react-native
// (aturan jest.config.cjs). Panggilan native-nya diinjeksikan sebagai
// `callNative`/`createSession` dari _layout.tsx (composition root).

/** Konteks satu sampel: apa yang sedang terjadi saat diukur. */
export type BridgeProbeContext = "idle" | "drag" | "apply";

export interface BridgeProbeSample {
  /** Round-trip sisi JS, milidetik. */
  ms: number;
  context: BridgeProbeContext;
  /** performance.now() saat sampel dicatat. */
  at: number;
}

export interface BridgeProbeStats {
  count: number;
  min: number;
  median: number;
  max: number;
}

const MAX_SAMPLES = 120;
const DRAG_WINDOW_MS = 1000;
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_SLOW_THRESHOLD_MS = 1000;
const DEFAULT_SUMMARY_EVERY_SAMPLES = 10;

/** Buffer sampel (rolling window, maks 120) + penanda apply terakhir. */
let samples: BridgeProbeSample[] = [];
let lastApplyAt: number | null = null;
let failCount = 0;
let skippedBitPerfect = 0;
let skippedInFlight = 0;

/** Median (rata-rata dua tengah bila genap). NaN bila kosong. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Statistik per konteks; konteks tanpa sampel = null. */
export function summarizeSamples(
  list: BridgeProbeSample[],
): Record<BridgeProbeContext, BridgeProbeStats | null> {
  const out: Record<BridgeProbeContext, BridgeProbeStats | null> = {
    idle: null,
    drag: null,
    apply: null,
  };
  (Object.keys(out) as BridgeProbeContext[]).forEach((ctx) => {
    const ms = list.filter((s) => s.context === ctx).map((s) => s.ms);
    if (ms.length === 0) return;
    out[ctx] = {
      count: ms.length,
      min: Math.min(...ms),
      median: median(ms),
      max: Math.max(...ms),
    };
  });
  return out;
}

/**
 * Konteks sampler: `drag` bila sebuah apply DSP tercatat dalam 1 dtk
 * terakhir, `idle` bila tidak (atau belum pernah ada apply).
 */
export function classifyProbeContext(
  lastApply: number | null,
  now: number,
  windowMs: number = DRAG_WINDOW_MS,
): "idle" | "drag" {
  return lastApply !== null && now - lastApply <= windowMs ? "drag" : "idle";
}

function pushSample(sample: BridgeProbeSample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) {
    samples = samples.slice(samples.length - MAX_SAMPLES);
  }
}

/**
 * Catat SATU sampel konteks `apply` per apply DSP — dipanggil dari
 * applyAllEffectsToNative (equalizerStore) dengan durasi setter
 * TERLAMBAT yang sudah terukur di sana. TANPA panggilan native.
 * Juga memperbarui penanda apply-terakhir untuk klasifikasi idle/drag.
 */
export function noteBridgeProbeApply(maxSetterMs: number): void {
  lastApplyAt = performance.now();
  pushSample({ ms: maxSetterMs, context: "apply", at: lastApplyAt });
}

/** Salinan buffer sampel (untuk tes + diagnostik lanjutan). */
export function getBridgeProbeSamples(): BridgeProbeSample[] {
  return [...samples];
}

/** Reset seluruh state probe (tes; juga dipakai saat probe di-stop). */
export function resetBridgeProbeState(): void {
  samples = [];
  lastApplyAt = null;
  failCount = 0;
  skippedBitPerfect = 0;
  skippedInFlight = 0;
}

export interface BridgeProbeOptions {
  /** Mode audio saat ini ("bit-perfect" | "dsp" | "immersive"). */
  getAudioMode: () => string;
  /** Durasi crossfade tersimpan saat ini (detik) — SELALU yang dikirim. */
  getCrossfadeSeconds: () => number;
  /** Jeda antar sampel, ms. Default 1000. */
  intervalMs?: number;
  /** Ambang sampel langsung dilog sebagai SLOW, ms. Default 1000. */
  slowThresholdMs?: number;
  /** Ringkas tiap N sampel sampler. Default 10. */
  summaryEverySamples?: number;
  /** Jam (untuk tes; default performance.now). */
  now?: () => number;
  /**
   * Panggilan native yang diukur — WAJIB diinjeksikan pemanggil (di app:
   * _layout.tsx, `NativeDSPModule.setCrossfadeSeconds`). Modul ini tidak
   * mengimpor spec supaya tetap logika murni (lihat header).
   */
  callNative: (seconds: number, sessionId: number) => Promise<unknown>;
  /**
   * Pembuat session — WAJIB diinjeksikan pemanggil (di app: _layout.tsx,
   * `NativeDSPModule.createAudioSession`, diambil sessionId-nya).
   */
  createSession: () => Promise<number>;
}

function formatStats(stats: BridgeProbeStats | null): string | null {
  if (!stats) return null;
  return `n=${stats.count} med=${Math.round(stats.median)}ms max=${Math.round(stats.max)}ms`;
}

function logSummary(): void {
  const byContext = summarizeSamples(samples);
  const parts: string[] = [];
  (Object.keys(byContext) as BridgeProbeContext[]).forEach((ctx) => {
    const text = formatStats(byContext[ctx]);
    if (text) parts.push(`${ctx}: ${text}`);
  });
  const extras: string[] = [];
  if (failCount > 0) extras.push(`fail=${failCount}`);
  if (skippedBitPerfect > 0) extras.push(`skippedBitPerfect=${skippedBitPerfect}`);
  if (skippedInFlight > 0) extras.push(`skippedInFlight=${skippedInFlight}`);
  console.log(
    `[BRIDGE-PROBE] summary ${parts.join(" | ")}${extras.length > 0 ? ` (${extras.join(" ")})` : ""}`,
  );
}

/**
 * Mulai sampler 1/detik. Dev-only — dipanggil dari blok diagnostik
 * _layout.tsx (yang sudah di-gate `__DEV__` + appState ready).
 */
export function startBridgeProbe(options: BridgeProbeOptions): {
  stop: () => void;
} {
  const {
    getAudioMode,
    getCrossfadeSeconds,
    intervalMs = DEFAULT_INTERVAL_MS,
    slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
    summaryEverySamples = DEFAULT_SUMMARY_EVERY_SAMPLES,
    now = () => performance.now(),
    callNative,
    createSession,
  } = options;

  let sessionId: number | null = null;
  let inFlight = false;
  let stopped = false;
  let samplerSamples = 0;

  console.log(
    `[BRIDGE-PROBE] started — 1 sampel/detik setCrossfadeSeconds(nilai saat ini); ringkas tiap ${summaryEverySamples} sampel; SLOW ≥${slowThresholdMs}ms; tidak jalan di bit-perfect`,
  );

  const tick = async (): Promise<void> => {
    if (stopped) return;
    // Jangan antre panggilan baru di atas bridge yang sedang macet —
    // probe mengukur stall, bukan menambahnya.
    if (inFlight) {
      skippedInFlight += 1;
      return;
    }
    // TIDAK PERNAH menyentuh jalur audio di bit-perfect.
    if (getAudioMode() === "bit-perfect") {
      skippedBitPerfect += 1;
      return;
    }
    inFlight = true;
    try {
      // Session diambil DI LUAR jendela ukur: yang diukur hanya satu
      // setter (createAudioSession stabil — F7, ID sama sesudah pertama).
      if (sessionId === null) {
        const id = await createSession();
        if (stopped) return;
        if (id <= 0) {
          failCount += 1;
        } else {
          sessionId = id;
        }
      }
      if (sessionId !== null) {
        const t0 = now();
        const firedWall = Date.now();
        const result = await callNative(getCrossfadeSeconds(), sessionId);
        const ms = now() - t0;
        if (result === false) {
          failCount += 1;
        } else {
          const context = classifyProbeContext(lastApplyAt, now());
          pushSample({ ms, context, at: now() });
          if (ms >= slowThresholdMs) {
            console.log(
              `[BRIDGE-PROBE] SLOW round-trip=${Math.round(ms)}ms context=${context} fireWall=${firedWall}`,
            );
          }
        }
      }
    } catch {
      failCount += 1;
    } finally {
      inFlight = false;
    }
    // Satu "upaya ukur" selesai (berhasil/gagal) — hitung ke irama
    // ringkasan supaya ringkasan tetap muncul walau semua panggilan
    // gagal (sebelumnya hanya sampel sukses yang dihitung).
    if (!stopped) {
      samplerSamples += 1;
      if (samplerSamples >= summaryEverySamples) {
        samplerSamples = 0;
        logSummary();
      }
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      console.log("[BRIDGE-PROBE] stopped");
    },
  };
}
