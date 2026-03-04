import { EqualizerBand } from '../../types/dsp.types';

export class DSPPipeline {
  private filters: any[] = [];
  private context: AudioContext;
  
  constructor(context: AudioContext, bands: EqualizerBand[]) {
    this.context = context;
    
    // Buat filter untuk tiap band
    bands.forEach(band => {
      const filter = context.createBiquadFilter();
      filter.type = this.getFilterType(band.frequency);
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q || 1.414;
      
      this.filters.push(filter);
    });
    
    // Connect in series
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
  }
  
  private getFilterType(freq: number): BiquadFilterType {
    if (freq < 100) return 'lowshelf';
    if (freq > 8000) return 'highshelf';
    return 'peaking';
  }
  
  process(channelData: Float32Array[]): Float32Array[] {
    // Implementasi proses DSP
    return channelData;
  }
  
  updateBand(index: number, gain: number) {
    if (this.filters[index]) {
      this.filters[index].gain.value = gain;
    }
  }
}