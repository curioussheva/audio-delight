import { DSPPipeline } from './DSPPipeline';
import { EqualizerBand } from '../../types/dsp.types';

export class AudioEngine {
  private pipeline: DSPPipeline;
  private context: AudioContext;
  private bufferSize = 4096;
  
  constructor(sampleRate: number = 48000) {
    // @ts-ignore - AudioContext type issue
    this.context = new (window.AudioContext || webkitAudioContext)({
      sampleRate,
      latencyHint: 'playback'
    });
    
    this.pipeline = new DSPPipeline(this.context, []);
  }
  
  async processAudio(buffer: AudioBuffer) {
    const channelData = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channelData.push(buffer.getChannelData(i));
    }
    
    return this.pipeline.process(channelData);
  }
  
  setEqualizerBands(bands: EqualizerBand[]) {
    this.pipeline = new DSPPipeline(this.context, bands);
  }
}