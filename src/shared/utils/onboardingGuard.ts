// src/shared/utils/onboardingGuard.ts
//
// U-P2-48: guard re-entry onboarding + arah tombol back hardware.
//
// Masalah yang diperbaiki:
// - Deep link `pristineaudio://onboarding` membuka onboarding lagi walau
//   user sudah selesai (dan menyelesaikannya menimpa
//   `audio_mode_preference`). `index.tsx` memang me-Redirect berdasarkan
//   `has_onboarded`, tapi tidak ada pengecekan di `onboarding.tsx` sendiri.
// - Hardware back dari onboarding kembali ke `index`, yang langsung
//   me-Redirect ke onboarding lagi bila belum onboarded — tombol back
//   tampak tidak berfungsi (berputar).
//
// Aturan yang dipakai layar onboarding (logika murni di sini supaya bisa
// diuji Jest tanpa React Native):
// - Sudah onboarded + dibuka TANPA sengaja -> alihkan ke Library.
//   "Dibuka sengaja" = deep link / navigasi dengan param `reopen=true`.
//   Tidak ada tombol Skip (keputusan desain) dan tidak ada jalan masuk UI
//   ke onboarding ulang — param ini hanya untuk deep link yang disengaja.

export type OnboardingBackAction = "block" | "exit-app" | "go-library";

/**
 * True bila layar onboarding harus langsung mengalihkan ke Library:
 * user sudah menyelesaikan onboarding dan layar ini TIDAK dibuka sengaja.
 * `hasOnboarded === null` = status belum terbaca -> jangan alihkan dulu,
 * layar menampilkan loading sampai status jelas.
 */
export function shouldRedirectFromOnboarding(
  hasOnboarded: boolean | null,
  reopenedIntentionally: boolean,
): boolean {
  return hasOnboarded === true && !reopenedIntentionally;
}

/**
 * Arah hardware back dari layar onboarding.
 * - Sedang submit (`isSubmitting`): tahan — jangan biarkan user keluar di
 *   tengah penyimpanan preferensi + permintaan izin.
 * - Sudah onboarded (onboarding dibuka lagi secara sengaja): kembali ke
 *   Library, jangan ke `index` (di sana Redirect akan melempar balik ke
 *   onboarding bila flag belum terbaca / berputar).
 * - Belum onboarded: tidak ada layar sebelumnya — `index` langsung
 *   me-Redirect ke onboarding lagi, jadi back yang "normal" hanya berputar.
 *   Satu-satunya arah yang jujur adalah keluar aplikasi.
 */
export function resolveOnboardingBack(options: {
  isSubmitting: boolean;
  alreadyOnboarded: boolean;
}): OnboardingBackAction {
  if (options.isSubmitting) return "block";
  if (options.alreadyOnboarded) return "go-library";
  return "exit-app";
}
