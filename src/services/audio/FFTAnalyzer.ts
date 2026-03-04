import FFT from 'fft.js';
import { FrequencyData } from '@/types/dsp.types';  // Gunakan path alias

class FFTAnalyzer {
  private fft: any;
  private bufferSize = 2048;
  
  constructor() {
    this.fft = new FFT(this.bufferSize);
  }
  
  analyze(samples: Float32Array): FrequencyData {
    const complex = new Array(this.bufferSize * 2).fill(0);
    for (let i = 0; i < Math.min(samples.length, this.bufferSize); i++) {
      complex[2*i] = samples[i];
    }
    
    this.fft.transform(complex);
    
    const magnitudes = new Float32Array(this.bufferSize/2);
    for (let i = 0; i < this.bufferSize/2; i++) {
      const real = complex[2*i];
      const imag = complex[2*i+1];
      magnitudes[i] = Math.sqrt(real*real + imag*imag);
    }
    
    return {
      frequencies: magnitudes,
      sampleRate: 44100,
      bins: this.bufferSize/2
    };
  }
}

export default FFTAnalyzer;