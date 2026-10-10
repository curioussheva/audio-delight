import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// =====================================================
// CATATAN: ATURAN TIPE DI FILE SPEC TURBOMODULE
// =====================================================
//
// Codegen React Native mem-PARSE file ini untuk menghasilkan kode JNI/Kotlin.
// Parser-nya TIDAK mendukung seluruh TypeScript. Yang TIDAK boleh dipakai di
// signature method:
//
//   - TSIndexedAccessType : `(typeof X)[keyof typeof X]`
//   - conditional type    : `T extends U ? A : B`
//   - mapped type         : `{ [K in keyof T]: ... }`
//   - template literal type
//
// Pelanggaran TIDAK menghasilkan error TypeScript - `tsc` lolos sepenuhnya.
// Yang muncul: build GAGAL di task `:app:generateCodegenSchemaFromJavaScript`
// dengan `UnsupportedTypeAnnotationParserError`. Dua kali terjadi di proyek ini.
//
// Aturan praktis: signature method hanya pakai primitif (`number`, `boolean`,
// `string`), array primitif, dan `Promise`/objek sederhana. Untuk "enum",
// pakai `number` di signature + konstanta bertipe TERPISAH di bawah.
//
// `./scripts/check_codegen_spec.py` memeriksa ini secara lokal, karena
// `tsc` dan clangd sama-sama tidak bisa menangkapnya.

export interface Spec extends TurboModule {
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

  // ð¥ Status stream AKTUAL, bukan yang diminta.
  // AAudio bisa menolak exclusive â Oboe fallback ke shared secara diam-diam.
  // isExclusiveModeActive() false meski setExclusiveMode(true) dipanggil.
  // getActualSampleRate() = laju stream yang benar-benar dibuka Oboe.
  // Sinkron supaya satu read atomic (stop/start stream di tengah bisa kasih
  // data dari stream lama).
  isExclusiveModeActive(): boolean;
  getActualSampleRate(): number;

  // Additional engine controls
  setDSPEnabled(enabled: boolean): void;
  setLimiterEnabled(enabled: boolean): void;
  setSolfeggioFreq(freq: number): void;
  setBrainwaveFreq(freq: number): void;
  setResonanceIntensity(intensity: number): void;
  setImmersiveEnabled(enabled: boolean): void;

  /**
   * Pilih mode pemrosesan: 0 = BitPerfect, 1 = DSP, 2 = Immersive.
   *
   * Live - mode dibaca dari atomic setiap buffer, jadi perubahan berlaku pada
   * frame berikutnya tanpa restart stream dan tanpa jeda.
   *
   * Bertipe `number` (bukan union literal) karena codegen tidak menerima
   * indexed-access type. Pakai `ProcessingModeValue` untuk nilainya.
   */
  setProcessingMode(mode: number): void;

  /**
   * Sakelar pemrosesan DSP di jalur produksi.
   *
   * Sebelum 2026-10-07 AudioPipeline tidak pernah dipanggil saat memutar lagu,
   * jadi mode DSP/Immersive tidak berefek dan bit-perfect hanya benar secara
   * kebetulan. Menyalakannya mengubah suara yang keluar.
   *
   * UI memakai ini untuk membandingkan "dengan DSP" vs "tanpa DSP" tanpa build
   * ulang. Bukan preferensi user - ini kontrol diagnostik.
   */
  setDSPProcessingEnabled(enabled: boolean): void;
  isDSPProcessingEnabled(): boolean;

  // =============================================
  // KOREKSI HEADPHONE
  // =============================================

  /**
   * Muat preset koreksi headphone dari teks (format AutoEQ/Squiglink).
   *
   * Resolve `true` kalau preset terpasang, `false` kalau ditolak. Preset cacat
   * DITOLAK seluruhnya, tidak diterapkan sebagian - pemanggil WAJIB memeriksa
   * hasilnya dan memberi tahu user.
   */
  loadHeadphonePreset(presetText: string): Promise<boolean>;

  clearHeadphonePreset(): Promise<boolean>;

  /**
   * Nyalakan/matikan koreksi. Koreksi hanya berlaku kalau ada preset
   * terpasang; tanpa preset, node dilewati sepenuhnya.
   */
  setHeadphoneCorrectionEnabled(enabled: boolean): void;

  isHeadphoneCorrectionEnabled(): Promise<boolean>;
}

/**
 * Nilai `ProcessingMode` di C++ (`core/AudioTypes.h`). Jangan diacak - nomor
 * ini dipakai langsung sebagai `jint` di JNI dan di-cast ke enum C++.
 */
export const ProcessingModeValue = {
  BitPerfect: 0,
  DSP: 1,
  Immersive: 2,
} as const;

/** Tipe nilai enum di atas - untuk pemakaian JS/TS, BUKAN di signature spec. */
export type ProcessingModeValueType =
  (typeof ProcessingModeValue)[keyof typeof ProcessingModeValue];

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDSPModule');
