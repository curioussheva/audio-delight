declare module 'fft-js' {
  // Main FFT functions
  export function fft(signal: number[]): [number[], number[]];
  export function fftInPlace(signal: number[]): void;
  
  // Utility functions (top-level, not under 'util')
  export function fftFreq(fftBins: [number[], number[]], sampleRate: number): number[];
  export function fftMag(fftBins: [number[], number[]]): number[];
  
  // Inverse FFT
  export function ifft(signal: number[]): number[];
  export function ifftInPlace(signal: number[]): void;
}