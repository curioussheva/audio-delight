import NativeDSPModule from "../../../specs/NativeDSPModule";

export interface NativeDSPInterface {
  // Equalizer & effects
  setEqualizer(band: number, level: number, sessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBassBoost(strength: number, sessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, sessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;

  // Audio session
  createAudioSession(): Promise<{ sessionId: number; isNew: boolean }>;

  // Direct controls
  setMasterGain(gain: number): void;
  setBalance(balance: number): void;
  setExclusiveMode(enabled: boolean): void;

  // Status stream aktual — AAudio bisa tolak exclusive, fallback diam-diam.
  isExclusiveModeActive(): boolean;
  getActualSampleRate(): number;
  // F2: laju HARDWARE stream (bukan laju sisi app). 0 = belum dibuka /
  // tidak diketahui. `?.()` di pemakai supaya JS lama tetap jalan lawan
  // APK lama (tanpa metode ini, tampilkan "—", bukan menebak).
  getHardwareSampleRate(): number;
  // C3.3: laju stream AKTUAL == laju file? (spec/Kotlin/JNI baru; `?.()`
  // di pemakai supaya JS lama tetap jalan lawan APK lama).
  isRateHonored(): boolean;

  // Mode pemrosesan (0 = BitPerfect, 1 = DSP, 2 = Immersive). Live.
  setProcessingMode(mode: number): void;

  // Sakelar diagnostik: proses DSP di jalur produksi.
  setDSPProcessingEnabled(enabled: boolean): void;
  isDSPProcessingEnabled(): boolean;

  // Additional engine controls
  setLimiterEnabled(enabled: boolean): void;
  setSolfeggioFreq(freq: number): void;
  setBrainwaveFreq(freq: number): void;
  setResonanceIntensity(intensity: number): void;
}


if (!NativeDSPModule) {
  console.error("NativeDSPModule tidak ditemukan! Pastikan library native sudah ter-load.");
}

export { NativeDSPModule };
export default NativeDSPModule as NativeDSPInterface;