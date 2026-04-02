import { useProgress } from "react-native-track-player";

export const useAudioProgress = (updateInterval = 250) => {
  // Masukkan updateInterval ke dalam useProgress agar 
  // UI Slider bergerak mulus (misal: tiap 250ms bukan 1000ms)
  const { position, duration, buffered } = useProgress(updateInterval);

  const durationSafe = duration || 0;
  const positionSafe = position || 0;

  return {
    position: positionSafe,
    duration: durationSafe,
    buffered,
    // Menghitung persentase 0 - 1 untuk ProgressBar / Slider
    progress: durationSafe > 0 ? positionSafe / durationSafe : 0,
    // Helper untuk sisa waktu (Countdown mode)
    remaining: Math.max(0, durationSafe - positionSafe),
  };
};
 