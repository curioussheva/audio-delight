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
  // Equalizer & effects.
  // F7: `sessionId` di setter di bawah diterima demi kompatibilitas API,
  // tapi DIABAIKAN native — engine memegang satu stream global tanpa state
  // per-sesi. Jangan membangun logika yang mengandalkan ID berbeda =
  // state berbeda.
  setEqualizer(band: number, level: number, sessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBassBoost(strength: number, sessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, sessionId: number): Promise<boolean>;
  setHrtfEnabled(enabled: boolean, sessionId: number): Promise<boolean>;
  /**
   * applyDspEffects (2026-11-20, fix drag pile-up logcat #9): SATU
   * panggilan native untuk seluruh apply — 7 setter murni (gains, bass,
   * virtualizer, reverb, hrtf, crossfade, masterGain) + toggle
   * convolver. IR convolver dimuat terpisah di JS sebelum batch bila
   * ada (lihat preloadConvolverIr) — load file TIDAK termasuk di sini.
   *
   * Menggantikan `Promise.all` 8 setter di applyAllEffectsToNative:
   * round-trip idle median ~1,2 dtk membuat 8 round-trip per apply
   * mahal. sessionId diterima demi kompatibilitas API tapi diabaikan
   * native (F7: satu stream global). Resolve false bila engine tidak
   * tersedia (pola setter lain); pemanggil WAJIB memeriksa.
   *
   * KOMPATIBILITAS: APK lama (tanpa metode ini) tidak memilikinya di
   * proxy TurboModule — pemanggil HARUS memeriksa
   * `typeof applyDspEffects === "function"` dan fallback ke setter
   * individual bila tidak ada (pola `?.setMasterGain` P1-9).
   */
  applyDspEffects(
    gains: number[],
    bass: number,
    virtualizer: number,
    reverb: number,
    hrtf: boolean,
    crossfade: number,
    convolverEnabled: boolean,
    masterGain: number,
    sessionId: number,
  ): Promise<boolean>;
  // Crossfade (2026-11-20): durasi transisi antar lagu, detik 0..12
  // (0 = mati = perilaku lama). Berlaku pada auto-advance di mode
  // processing (DSP/Solfeggio); di Bit-Perfect diabaikan native
  // (fade tetap 10 ms anti-klik). sessionId diterima demi
  // kompatibilitas API tapi diabaikan native (F7: satu stream global).
  setCrossfadeSeconds(seconds: number, sessionId: number): Promise<boolean>;
  // Gapless (2026-11-20): putar album bersambung tanpa jeda — pre-roll
  // track berikutnya + trim priming/padding encoder di decoder.
  // Default ON (setting gapless, persist "gapless-storage"). OFF =
  // perilaku lama (jeda load + fade-out 500 ms). Crossfade > 0 MENANG
  // atas gapless untuk transisi itu (native). sessionId diterima demi
  // kompatibilitas API tapi diabaikan native (F7: satu stream global).
  setGaplessEnabled(enabled: boolean, sessionId: number): Promise<boolean>;
  // Convolver — IR (2026-11-20): toggle sendiri, DI LUAR preset EQ
  // (keputusan yang sama dengan HRTF). loadConvolverIr resolve status
  // kLoad* ConvolverNode — lihat ConvolverIrStatus di bawah; pemanggil
  // WAJIB memeriksa (IR cacat ditolak, bukan diterapkan sebagian).
  setConvolverEnabled(
    enabled: boolean,
    sessionId: number,
  ): Promise<boolean>;
  loadConvolverIr(path: string): Promise<number>;
  clearConvolverIr(): Promise<boolean>;
  getConvolverIrInfo(): Promise<{
    loaded: boolean;
    sampleRateHz: number;
    taps: number;
    durationMs: number;
  }>;
  // Master EQ (P0-1, 2026-11-19): sakelar master "Pemrosesan DSP".
  // false = DSPChain passthrough bit-exact (DSPConfig.enabled).
  setEqEnabled(enabled: boolean, sessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;

  // Audio session.
  // F7: SATU sesi stabil untuk satu stream global. Panggilan pertama
  // mengalokasikan ID Android baru (isNew true); panggilan berikut
  // mengembalikan ID yang sama (isNew false). ID hanya token "native siap"
  // — tidak ada AudioEffect yang dibuat dengannya.
  createAudioSession(): Promise<{ sessionId: number; isNew: boolean }>;

  // Direct controls
  // P1-9 (2026-11-19): Promise<boolean> supaya keberhasilan apply bisa
  // diverifikasi seperti setter lain (dulu void).
  setMasterGain(gain: number): Promise<boolean>;
  setBalance(balance: number): void;
  setExclusiveMode(enabled: boolean): void;

  // USB Direct — backend output kedua (UAC2 via usbdevfs, 2026-11-19).
  // isUsbDirectAvailable(): ada perangkat audio USB tercolok. TRUE di
  // sini BELUM berarti bisa dipakai — daftar Kotlin memuat UAC1 juga
  // (CM108 csheva ikut terdaftar); verifikasi UAC2 terjadi di open()
  // native (parser bcdADC), dan setUsbDirectEnabled mencoba perangkat
  // berikut bila yang pertama ditolak.
  // setUsbDirectEnabled(true): cari DAC -> minta izin -> open -> pindah
  // output ke USB; resolve false bila tidak ada DAC UAC2 / izin ditolak
  // / open gagal — AAudio tetap jalan seperti sekarang. Resolve true
  // hanya bila USB benar-benar streaming. Tidak ada UI toggle di ronde
  // ini (menunggu bukti device).
  isUsbDirectAvailable(): boolean;
  setUsbDirectEnabled(enabled: boolean): Promise<boolean>;

  // 🔥 Status stream AKTUAL, bukan yang diminta.
  // AAudio bisa menolak exclusive → Oboe fallback ke shared secara diam-diam.
  // isExclusiveModeActive() false meski setExclusiveMode(true) dipanggil.
  // getActualSampleRate() = laju SISI APP (getSampleRate() Oboe) — BUKAN
  // laju hardware. Setelah Oboe menyisipkan FilterAudioStream, nilai itu =
  // laju file yang diminta app, sementara hardware bisa jalan di laju lain
  // (F2, 2026-11-16: komentar lama "laju stream yang benar-benar dibuka
  // Oboe" di sini SALAH). Untuk laju hardware pakai
  // getHardwareSampleRate() di bawah. Sinkron supaya satu read atomic
  // (stop/start stream di tengah bisa kasih data dari stream lama).
  isExclusiveModeActive(): boolean;
  getActualSampleRate(): number;

  // F2 (2026-11-16): laju HARDWARE stream (getHardwareSampleRate() Oboe).
  // 0 = stream belum dibuka / tidak diketahui. Dipakai UI supaya "Laju
  // stream" tidak lagi menampilkan laju app saja.
  getHardwareSampleRate(): number;

  // C3.3 (Batch 18 susulan): laju stream AKTUAL == laju file?
  // EngineManager::isRateHonored() membandingkan laju FILE vs laju
  // HARDWARE (bukan laju app, bukan yang diminta) — kalau hardware jalan
  // 48 kHz sementara file 44,1 kHz, ini false dan label "Bit-Perfect
  // aktif" tidak boleh tampil. Sinkron seperti dua query di atas.
  isRateHonored(): boolean;

  // Additional engine controls
  setLimiterEnabled(enabled: boolean): void;
  setSolfeggioFreq(freq: number): void;
  setBrainwaveFreq(freq: number): void;
  setResonanceIntensity(intensity: number): void;

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

  /**
   * Parse saja: memvalidasi teks preset TANPA memasangnya.
   *
   * Resolve jumlah filter aktif, atau `-1` kalau preset ditolak. Dipakai alur
   * impor supaya memeriksa preset tidak mengubah suara yang sedang keluar.
   */
  validateHeadphonePreset(presetText: string): Promise<number>;

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

/**
 * Status load IR convolver (`IrLoadStatus` di C++,
 * `dsp/convolution/IRLoader.h`, dan kLoad* di `ConvolverNode.h`).
 * Jangan diacak - nomor ini dipakai langsung sebagai `jint` di JNI.
 */
export const ConvolverIrStatus = {
  Ok: 0,
  FileError: 1,
  FormatError: 2,
  TooLong: 3,
  Silent: 4,
  RateError: 5,
} as const;

/** Tipe nilai enum di atas - untuk pemakaian JS/TS, BUKAN di signature spec. */
export type ConvolverIrStatusType =
  (typeof ConvolverIrStatus)[keyof typeof ConvolverIrStatus];

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDSPModule');
