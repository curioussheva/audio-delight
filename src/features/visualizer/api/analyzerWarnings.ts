// src/features/visualizer/api/analyzerWarnings.ts
//
// U-P2-21: daftar warnings analyzer dirender mentah, sementara
// `fakeReason` dibersihkan dari prefix internal "[FFT] ".
// Dua masalah: (1) tag internal "[FFT] " bocor ke UI; (2) temuan
// spektral yang sama tampil dua kali — sekali bersih sebagai
// fakeReason, sekali ber-tag sebagai warning.
//
// `fakeReason` di BitDepthVerifier diambil dari warning pertama yang
// berawalan "[FFT] " (atau fallback "Spectral verdict: …"), jadi
// membersihkan prefix saja tidak cukup: warning yang SAMA dengan
// fakeReason harus dibuang dari daftar.
//
// Logika MURNI (tanpa React Native) supaya bisa diuji Jest.

/** Prefix internal yang ditempel analyzer.ts pada catatan spektral. */
export const FFT_WARNING_PREFIX = "[FFT] ";

/** Buang prefix "[FFT] " dari satu baris warning, kalau ada. */
export function cleanWarningText(warning: string): string {
  return warning.startsWith(FFT_WARNING_PREFIX)
    ? warning.slice(FFT_WARNING_PREFIX.length)
    : warning;
}

/**
 * Daftar warnings yang siap dirender: prefix "[FFT] " dibersihkan, dan
 * baris yang isinya sama dengan `fakeReason` (sesudah dibersihkan)
 * dibuang supaya temuan spektral tidak tampil dua kali.
 */
export function cleanAnalyzerWarnings(
  warnings: readonly string[] | undefined | null,
  fakeReason?: string | null,
): string[] {
  const cleanedReason = fakeReason ? cleanWarningText(fakeReason) : null;
  return (warnings ?? [])
    .map(cleanWarningText)
    .filter((w) => w.length > 0 && w !== cleanedReason);
}
