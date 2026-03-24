import { FrequencyData } from "@/shared/types/dsp";

class FFTAnalyzer {
  private readonly bufferSize = 2048;
  private readonly defaultSampleRate = 44100;

  /**
   * Mengolah data FFT mentah yang dikirim oleh NativeVisualizerBridge.
   * Native sudah melakukan FFT, jadi kita tinggal melakukan normalisasi jika perlu.
   */
  processNativeData(
    fftData: number[],
    customSampleRate?: number,
  ): FrequencyData {
    // Data dari Android Visualizer biasanya sudah berupa besaran (magnitude)
    // atau gabungan real/imaginary tergantung implementasi Kotlin-mu.

    const magnitudes = new Float32Array(fftData);

    return {
      frequencies: magnitudes,
      sampleRate: customSampleRate || this.defaultSampleRate,
      bins: fftData.length,
    };
  }

  /**
   * Helper untuk memetakan indeks bin ke frekuensi Hz
   * Rumus: f = i * (sampleRate / nfft)
   */
  getFrequencyAtIndex(index: number, sampleRate: number, bins: number): number {
    return index * (sampleRate / (bins * 2));
  }
}

export default new FFTAnalyzer();
