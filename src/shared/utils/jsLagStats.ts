// src/shared/utils/jsLagStats.ts
//
// JL-1 (Fase 0): sampler lag event-loop JS 100 ms + p50/p95/p99/max per
// skenario (play/idle + drag + scan + enrich). Dipasang di _layout.tsx
// modul scope, di samping startJsLagMonitor(). Matikan flag LAG_STATS
// di _layout.tsx setelah pengukuran selesai.
//
// console.warn dipakai sengaja: tetap hidup setelah plugin
// transform-remove-console (lihat V-7).

type Sampler = {
  timer: ReturnType<typeof setInterval> | null;
  reportTimer: ReturnType<typeof setInterval> | null;
  last: number;
  getScenario: () => string;
  samples: Record<string, number[]>;
};
const g = globalThis as typeof globalThis & { __jsLagStats?: Sampler };

const TICK_MS = 100;
const MAX_SAMPLES = 3000; // ±5 menit per skenario

const pct = (sorted: number[], p: number): number =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
    : 0;

export function startJsLagStats(
  getScenario: () => string,
  reportEveryMs = 30_000,
): void {
  if (g.__jsLagStats?.timer) return; // aman untuk Fast Refresh
  const st: Sampler = {
    timer: null,
    reportTimer: null,
    last: Date.now(),
    getScenario,
    samples: {},
  };
  st.timer = setInterval(() => {
    const now = Date.now();
    const lag = Math.max(0, now - st.last - TICK_MS);
    st.last = now;
    const arr = (st.samples[st.getScenario()] ??= []);
    arr.push(lag);
    if (arr.length > MAX_SAMPLES) arr.shift();
  }, TICK_MS);
  st.reportTimer = setInterval(() => {
    for (const [key, arr] of Object.entries(st.samples)) {
      if (arr.length < 20) continue;
      const s = [...arr].sort((a, b) => a - b);
      // console.warn: tetap hidup setelah plugin remove-console (lihat V-7)
      console.warn(
        `[JSLagStats] ${key} n=${s.length} p50=${pct(s, 50)} p95=${pct(s, 95)} p99=${pct(s, 99)} max=${s[s.length - 1]} ms`,
      );
      st.samples[key] = [];
    }
  }, reportEveryMs);
  g.__jsLagStats = st;
}
