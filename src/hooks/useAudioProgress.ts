import { useProgress } from 'react-native-track-player';

export const useAudioProgress = (updateInterval = 250) => {
  // lovegaoshi fork mendukung interval update milidetik
  const { position, duration, buffered } = useProgress(); 

  return {
    position,
    duration,
    buffered,
    // Menghitung persentase 0 - 1 untuk ProgressBar
    progress: duration > 0 ? position / duration : 0,
    // Helper untuk sisa waktu
    remaining: duration - position,
  };
};
