// src/features/visualizer/api/fft.ts

import { FrequencyData } from "@/shared/types/dsp";

/**
 * FFT Data Processor
 *
 * CATATAN: Data dari NativeVisualizerBridge sudah:
 * 1. FFT transformed (magnitude)
 * 2. Downsampled ke 128 bins dari 2048 points
 * 3. Log-scaled: db = log10(1.0 + 9.0 * normalized)
 * 4. Range: 0.0 - 1.0 (0 = silence, 1 = max signal)
 */

class FFTAnalyzer {
  private readonly nativeBins = 128; // Dari NativeVisualizerBridge
  private readonly nativeFFTSize = 2048; // Android Visualizer default
  private readonly defaultSampleRate = 44100;

  /**
   * Process native FFT data untuk visualisasi
   *
   * Data sudah dalam format yang siap pakai:
   * - 128 bins
   * - Log-scaled (perceptual)
   * - Range 0.0-1.0
   */
  processNativeData(
    fftData: number[],
    sampleRate: number = this.defaultSampleRate,
  ): FrequencyData {
    // Validasi input
    if (!Array.isArray(fftData) || fftData.length !== this.nativeBins) {
      console.warn(
        `[FFTAnalyzer] Expected ${this.nativeBins} bins, got ${fftData?.length}`,
      );
      return this.getEmptyData(sampleRate);
    }

    // ✅ Data sudah log-scaled dari native, langsung pakai
    // Tidak perlu transformasi lagi
    const normalizedData = new Float32Array(fftData);

    // Optional: Apply smoothing atau additional scaling jika diperlukan
    // const smoothed = this.applySmoothing(normalizedData);

    return {
      frequencies: normalizedData, // 128 bins, 0.0-1.0 range
      sampleRate,
      bins: this.nativeBins,
      // ✅ Estimasi frekuensi per bin (approximate karena sudah downsampled)
      binWidth: sampleRate / this.nativeFFTSize, // ~21.5 Hz per bin @ 44.1k
      maxFrequency: sampleRate / 2, // Nyquist
      binCount: this.nativeBins,
      timestamp: Date.now(),
    };
  }

  /**
   * Get frequency range untuk setiap bin (approximate)
   *
   * Karena native sudah downsample 2048 → 128 bins,
   * setiap bin mewakili rentang frekuensi, bukan single point.
   */
  getBinFrequencyRange(
    binIndex: number,
    sampleRate: number = this.defaultSampleRate,
  ): {
    startHz: number;
    centerHz: number;
    endHz: number;
  } {
    // 128 bins merepresentasikan 2048 FFT points
    // Setiap bin = 2048/128 = 16 FFT bins
    const binsPerNativeBin = this.nativeFFTSize / this.nativeBins; // 16

    const binWidth = sampleRate / this.nativeFFTSize; // ~21.5 Hz

    const startBin = binIndex * binsPerNativeBin;
    const endBin = (binIndex + 1) * binsPerNativeBin - 1;

    return {
      startHz: startBin * binWidth,
      centerHz: (startBin + binsPerNativeBin / 2) * binWidth,
      endHz: (endBin + 1) * binWidth,
    };
  }

  /**
   * Group bins ke dalam frequency bands (untuk bar visualizer)
   * Contoh: sub-bass, bass, mid, treble
   */
  getFrequencyBands(
    fftData: Float32Array,
    sampleRate: number = this.defaultSampleRate,
  ): {
    subBass: number; // 20-60 Hz
    bass: number; // 60-250 Hz
    lowMid: number; // 250-500 Hz
    mid: number; // 500-2000 Hz
    highMid: number; // 2000-4000 Hz
    presence: number; // 4000-6000 Hz
    brilliance: number; // 6000-20000 Hz
  } {
    const bands = {
      subBass: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      brilliance: 0,
    };

    if (fftData.length !== this.nativeBins) return bands;

    // Hitung average untuk setiap rentang frekuensi
    // Mapping: 128 bins merepresentasikan 0-22050 Hz (Nyquist @ 44.1k)
    // Bin width: ~172 Hz per bin (22050/128)

    const binWidth = sampleRate / 2 / this.nativeBins; // ~172 Hz @ 44.1k

    for (let i = 0; i < fftData.length; i++) {
      const freq = i * binWidth;
      const value = fftData[i];

      if (freq < 60) bands.subBass += value;
      else if (freq < 250) bands.bass += value;
      else if (freq < 500) bands.lowMid += value;
      else if (freq < 2000) bands.mid += value;
      else if (freq < 4000) bands.highMid += value;
      else if (freq < 6000) bands.presence += value;
      else bands.brilliance += value;
    }

    // Normalize by bin count in each band
    const binCounts = {
      subBass: Math.ceil(60 / binWidth),
      bass: Math.ceil((250 - 60) / binWidth),
      lowMid: Math.ceil((500 - 250) / binWidth),
      mid: Math.ceil((2000 - 500) / binWidth),
      highMid: Math.ceil((4000 - 2000) / binWidth),
      presence: Math.ceil((6000 - 4000) / binWidth),
      brilliance: Math.ceil((22050 - 6000) / binWidth),
    };

    return {
      subBass: bands.subBass / binCounts.subBass,
      bass: bands.bass / binCounts.bass,
      lowMid: bands.lowMid / binCounts.lowMid,
      mid: bands.mid / binCounts.mid,
      highMid: bands.highMid / binCounts.highMid,
      presence: bands.presence / binCounts.presence,
      brilliance: bands.brilliance / binCounts.brilliance,
    };
  }

  /**
   * Smoothing untuk mengurangi flickering
   */
  applySmoothing(
    data: Float32Array,
    previousData?: Float32Array,
    factor: number = 0.3, // 0 = full smooth, 1 = no smooth
  ): Float32Array {
    if (!previousData || previousData.length !== data.length) {
      return data;
    }

    const smoothed = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // Exponential moving average
      smoothed[i] = previousData[i] * (1 - factor) + data[i] * factor;
    }
    return smoothed;
  }

  /**
   * Get empty data structure (fallback)
   */
  private getEmptyData(sampleRate: number): FrequencyData {
    return {
      frequencies: new Float32Array(this.nativeBins),
      sampleRate,
      bins: this.nativeBins,
      binWidth: sampleRate / this.nativeFFTSize,
      maxFrequency: sampleRate / 2,
      binCount: this.nativeBins,
      timestamp: Date.now(),
    };
  }
}

// Singleton instance
export const fftAnalyzer = new FFTAnalyzer();
export default fftAnalyzer;
