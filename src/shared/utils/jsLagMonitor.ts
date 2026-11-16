import { AppState } from "react-native";

// Pemantau lag event-loop JS (murni JS) — HANYA untuk branch app-debug.
// Interval 1 dtk yang terlambat = JS tidak sempat berjalan. Bedakan dari idle:
// JS yang idle TETAP menjalankan interval tepat waktu (lag ~0, di bawah threshold),
// jadi tidak ada log. Sinyal beku yang benar adalah SATU log [JSLag] bernilai
// BESAR (mis. ~73000 ms) tepat saat JS bangun — bukan tidak adanya log selama gap
// (JS yang beku tidak bisa menjalankan callback interval, jadi diam selama gap
// adalah hal yang diharapkan). Dipasang atas usulan Sonnet, diverifikasi di
// VERIFIKASI-SONNET-LOGCAT28.md (butir 4).
let timer: ReturnType<typeof setInterval> | null = null;
let last = Date.now();

export function startJsLagMonitor(thresholdMs = 400) {
  if (timer) return;
  last = Date.now();
  AppState.addEventListener("change", (s) => { if (s === "active") last = Date.now(); });
  timer = setInterval(() => {
    const now = Date.now();
    const lag = now - last - 1000;                    // timer 1 dtk yang terlambat = JS tidak sempat berjalan
    if (lag > thresholdMs && AppState.currentState === "active") {
      console.warn(`[JSLag] ${lag} ms`);
    }
    last = now;
  }, 1000);
}
// panggil sekali di startup (src/app/_layout.tsx, modul scope)
