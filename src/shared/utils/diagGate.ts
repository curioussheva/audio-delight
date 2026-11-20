// src/shared/utils/diagGate.ts
//
// Sakelar SATU untuk semua log diagnostik SEMENTARA (2026-11-20).
//
// Kenapa satu sakelar, bukan `__DEV__` di tiap modul: file yang diuji jest
// memakai ts-jest tanpa preset react-native (jest.config.cjs: "hanya untuk
// logika murni"), jadi `__DEV__` tidak ada di lingkungan tes dan modul yang
// merujuknya langsung akan melempar ReferenceError saat diimpor tes.
// Pola yang sama dengan bridgeProbe.ts: modul diagnostik tetap logika
// murni; yang menyalakan/mematikan adalah composition root (_layout.tsx,
// efek dev-only) — di sini lewat flag di globalThis supaya tahan Metro
// Fast Refresh (pola `__audioDiag` / jsLagMonitor J3-4: state di `let`
// level modul hilang saat modul dieksekusi ulang, flag di global tidak).
//
// Default MATI: release tidak pernah log apa pun dari modul diagnostik.
// _layout.tsx menyalakan di efek dev-only (di samping startBridgeProbe)
// dan mematikan di cleanup-nya.
//
// CARA CABUT: hapus file ini + semua pemakaian isTempDiagEnabled /
// setTempDiagEnabled (eventLag.ts, dragDiag.ts, flingDiag.ts, _layout.tsx).

const FLAG_KEY = "__pristineTempDiagEnabled";

/** true hanya bila dinyalakan eksplisit dari _layout.tsx (dev-only). */
export function isTempDiagEnabled(): boolean {
  return (globalThis as Record<string, unknown>)[FLAG_KEY] === true;
}

/** Dipanggil _layout.tsx saja (nyala di efek dev-only, mati di cleanup). */
export function setTempDiagEnabled(enabled: boolean): void {
  (globalThis as Record<string, unknown>)[FLAG_KEY] = enabled;
}
