/**
 * useVisualizer — Week 2
 * Polls AudioEngine FFT setiap frame.
 * Saat idle/paused: tampilkan animasi idle yang smooth.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import AudioEngine from '../audio/AudioEngine';

const BINS = 48;

function generateIdleFFT(t: number): number[] {
  return Array.from({ length: BINS }, (_, i) => {
    const freq = i / BINS;
    const wave1 = Math.sin(t * 1.2 + i * 0.4) * 0.3;
    const wave2 = Math.sin(t * 0.7 + i * 0.8) * 0.15;
    const envelope = Math.exp(-freq * 1.5) * 0.4;
    return Math.max(0.02, (wave1 + wave2 + 0.1) * envelope + 0.02);
  });
}

export function useVisualizer() {
  const fftData = useSharedValue<number[]>(new Array(BINS).fill(0));
  const rafRef = useRef<number>(0);
  const isActive = useRef(false);
  const startTime = useRef(Date.now());

  const downsample = (raw: Uint8Array): number[] => {
    const step = Math.max(1, Math.floor(raw.length / BINS));
    return Array.from({ length: BINS }, (_, i) => {
      let sum = 0;
      const start = i * step;
      for (let j = 0; j < step && start + j < raw.length; j++) sum += raw[start + j];
      return sum / step / 255;
    });
  };

  const poll = useCallback(() => {
    if (!isActive.current) return;

    if (AudioEngine.isInitialized && !AudioEngine.isMockMode) {
      const fft = AudioEngine.getFFTData();
      if (fft.length > 0) fftData.value = downsample(fft);
    } else {
      // Mock idle animation
      const t = (Date.now() - startTime.current) / 1000;
      fftData.value = generateIdleFFT(t);
    }

    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const start = useCallback(() => {
    if (isActive.current) return;
    isActive.current = true;
    startTime.current = Date.now();
    rafRef.current = requestAnimationFrame(poll);
  }, [poll]);

  const stop = useCallback(() => {
    isActive.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Fade out
    fftData.value = new Array(BINS).fill(0);
  }, []);

  useEffect(() => {
    start(); // Always show idle animation
    return () => stop();
  }, []);

  return { fftData, start, stop };
}
