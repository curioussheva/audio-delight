// src/shared/utils/splashTiming.ts
//
// Durasi fase splash saat cold start (ms) — satu sumber kebenaran untuk
// RootLayout (`src/app/_layout.tsx`). Diukur dari kode, bukan dari logcat:
// tiap konstanta adalah jeda setTimeout yang nyata dijalankan.
//
// SEBELUM (HEAD 0b53c5881):
//   splash native hilang SEGERA setelah animasi keluar LoadingScreen
//   (500 ms) selesai, lalu ready 200 ms kemudian — di HP yang init-nya
//   cepat, splash.png (splash native, app.json) hanya berkedip.
// SESUDAH:
//   1. SPLASH_HOLD_MS — tahan splash native setelah LoadingScreen selesai
//      keluar, supaya gambarnya sempat terlihat.
//   2. SPLASH_IMAGE_MS — splash.png tampil lagi sebagai interstitial
//      in-app (SplashImageScreen, contain, latar tema) sebelum rute tampil.
//   3. SPLASH_READY_DELAY_MS — jeda lama sebelum ready (tidak berubah).
// Total tambahan sebelum rute tampil: 700 + 900 = 1.600 ms ("sedikit").
// Alur akhir: splash native (splash.png) → interstitial splash.png →
// index Redirect → onboarding (baru) / Library (sudah onboarded).
// Guard onboarding TIDAK disentuh — user yang sudah onboarded tidak
// pernah melihat onboarding lagi karena interstitial ini.
export const SPLASH_HOLD_MS = 700;
export const SPLASH_IMAGE_MS = 900;
export const SPLASH_READY_DELAY_MS = 200;

/** Total waktu tambahan sebelum rute tampil, dibanding alur lama. */
export const SPLASH_EXTRA_MS = SPLASH_HOLD_MS + SPLASH_IMAGE_MS;
