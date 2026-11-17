import { AppState } from "react-native";

// Pemantau lag event-loop JS (murni JS). Interval 1 dtk yang terlambat = JS
// tidak sempat berjalan. Bedakan dari idle: JS yang idle TETAP menjalankan
// interval tepat waktu (lag ~0, di bawah threshold), jadi tidak ada log.
// Sinyal beku yang benar adalah SATU log [JSLag] bernilai BESAR (mis.
// ~73000 ms) tepat saat JS bangun — bukan tidak adanya log selama gap (JS
// yang beku tidak bisa menjalankan callback interval, jadi diam selama gap
// adalah hal yang diharapkan). Dipasang atas usulan Sonnet, diverifikasi di
// VERIFIKASI-SONNET-LOGCAT28.md (butir 4). Di-port dari branch app-debug
// (1fe6458a) ke fix/ffmpeg-disable-doc.
//
// J3-4: timer + subscription + timestamp terakhir disimpan di `global`
// (pola `__audioDiag` di _layout.tsx), BUKAN `let` level modul. Guard lama
// `if (timer) return` hanya berlaku dalam satu instance modul — Metro Fast
// Refresh mengeksekusi ulang modul → interval 1 dtk + AppState listener
// baru tanpa membersihkan yang lama, menumpuk satu per refresh dan
// mengotori sesi DevTools Performance yang dipakai mengukur saturasi JS.
// Dengan state di global, eksekusi ulang modul adalah no-op. Di APK
// release modul dimuat sekali (aman), tapi sesi Metro kini aman juga.
type JsLagMonitorGlobals = {
  __jsLagTimer?: ReturnType<typeof setInterval> | null;
  __jsLagListener?: { remove: () => void } | null;
  __jsLagLast?: number;
};

const g = global as typeof globalThis & JsLagMonitorGlobals;

export function startJsLagMonitor(thresholdMs = 400) {
  if (g.__jsLagTimer) return;
  g.__jsLagLast = Date.now();
  g.__jsLagListener = AppState.addEventListener("change", (s) => {
    if (s === "active") g.__jsLagLast = Date.now();
  });
  g.__jsLagTimer = setInterval(() => {
    const now = Date.now();
    const last = g.__jsLagLast ?? now;
    const lag = now - last - 1000; // timer 1 dtk yang terlambat = JS tidak sempat berjalan
    if (lag > thresholdMs && AppState.currentState === "active") {
      console.warn(`[JSLag] ${lag} ms`);
    }
    g.__jsLagLast = now;
  }, 1000);
}

// Pasangan stop — untuk pemakaian manual / tes. Sengaja TIDAK dipanggil dari
// HMR dispose: dispose yang membersihkan timer tanpa restart akan mematikan
// monitor bila hanya modul ini yang di-refresh Metro; guard global di atas
// sudah cukup membuat refresh ulang menjadi no-op.
export function stopJsLagMonitor() {
  if (g.__jsLagTimer) {
    clearInterval(g.__jsLagTimer);
    g.__jsLagTimer = null;
  }
  g.__jsLagListener?.remove();
  g.__jsLagListener = null;
}
// panggil sekali di startup (src/app/_layout.tsx, modul scope)
