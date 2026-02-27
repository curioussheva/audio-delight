import { useEffect, useRef, useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import AudioEngine from '../audio/AudioEngine';
import { AUDIO_CONFIG } from '../constants/eq';

const TARGET_BINS = AUDIO_CONFIG.VISUALIZER_BINS;

/**
 * useVisualizer
 * Polls AudioEngine FFT data on every animation frame.
 * Returns Reanimated shared values for direct use in Skia/Animated components.
 */
export function useVisualizer() {
  const fftData = useSharedValue<number[]>(new Array(TARGET_BINS).fill(0));
  const waveformData = useSharedValue<number[]>(new Array(TARGET_BINS).fill(0.5));
  const rafRef = useRef<number>(0);
  const isActive = useRef(false);

  const downsample = (raw: Uint8Array, targetBins: number): number[] => {
    const step = Math.floor(raw.length / targetBins);
    const result: number[] = [];
    for (let i = 0; i < targetBins; i++) {
      // Average a small window for smoother look
      let sum = 0;
      const start = i * step;
      for (let j = 0; j < step && start + j < raw.length; j++) {
        sum += raw[start + j];
      }
      result.push(sum / step / 255); // Normalize 0-1
    }
    return result;
  };

  const poll = useCallback(() => {
    if (!isActive.current) return;

    if (AudioEngine.isInitialized) {
      const fft = AudioEngine.getFFTData();
      if (fft.length > 0) {
        fftData.value = downsample(fft, TARGET_BINS);
      }

      const wave = AudioEngine.getWaveformData();
      if (wave.length > 0) {
        waveformData.value = downsample(wave, TARGET_BINS);
      }
    }

    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const start = useCallback(() => {
    isActive.current = true;
    rafRef.current = requestAnimationFrame(poll);
  }, [poll]);

  const stop = useCallback(() => {
    isActive.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { fftData, waveformData, start, stop };
}
