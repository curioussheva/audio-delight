// src/features/visualizer/api/frequencyAxis.ts
//
// U-P1-34: label sumbu frekuensi SpectogramView.
//
// Bin FFT di-resample LINEAR 0–Nyquist (handleFFTData: step =
// fftData.length / bins), tapi label lama "20 Hz / 2 kHz / 20 kHz"
// berjarak sama seolah skala log — titik tengah sumbu linear sebenarnya
// ~12 kHz, bukan 2 kHz (meleset ~6x), dan bin pertama mencakup 0 Hz,
// bukan 20 Hz. Label dihitung linear dari Nyquist = sampleRate / 2.
//
// Laju sampel sesi FFT tidak diekspos native ke JS; default 48 kHz
// (Nyquist 24 kHz, laju output umum engine) dan pemanggil boleh
// mengoper sampleRate yang sebenarnya bila mengetahuinya.
export const DEFAULT_SPECTROGRAM_SAMPLE_RATE = 48000;

/** "0" | "512 Hz" | "6 kHz" | "5.5 kHz" — tanpa desimal yang tidak perlu. */
export function formatFrequencyHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return "0";
  if (hz >= 1000) {
    const rounded = Math.round((hz / 1000) * 10) / 10;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1);
    return `${text} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

/**
 * Label sumbu-x linear 0–Nyquist, `count` titik berjarak sama
 * (pertama 0, terakhir Nyquist). Default 5 titik untuk 48 kHz:
 * ["0", "6 kHz", "12 kHz", "18 kHz", "24 kHz"].
 */
export function frequencyAxisLabels(
  sampleRate: number,
  count = 5,
): string[] {
  const safeRate =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? sampleRate
      : DEFAULT_SPECTROGRAM_SAMPLE_RATE;
  const safeCount = Math.max(2, Math.floor(count));
  const nyquist = safeRate / 2;
  const labels: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    labels.push(formatFrequencyHz((nyquist * i) / (safeCount - 1)));
  }
  return labels;
}
