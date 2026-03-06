declare module 'fft.js' {
  class FFT {
    constructor(size: number);
    forward(input: Float32Array | number[]): Float32Array;
    inverse(output: Float32Array): void;
    // tambah method lain jika kamu pakai
  }
  export default FFT;
}