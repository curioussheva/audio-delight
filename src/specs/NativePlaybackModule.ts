import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// F1 (revisi, bukan hapus — putusan csheva K5): spec ini DULU drift parah
// dari Kotlin dan tidak diimpor siapa pun, tapi spec adalah sumber codegen
// — siapa pun yang memakainya akan menabrak runtime. Kini dicocokkan
// method per method dengan
// android/app/src/main/java/com/pristineaudio/audio/NativePlaybackModule.kt:
//
//   - play() ber-Promise di Kotlin (reject PLAY_FAILED) — dulu void.
//   - setQueue() DIHAPUS di Kotlin (Opsi B, 2026-11-13; yang live hanya
//     setQueueFromService via NativePlaybackService) — dihapus dari spec.
//   - Ditambahkan yang ada di Kotlin tapi tidak di spec: setPlaybackRate,
//     setPitchRatio, jumpTo (Promise), getCurrentIndex, getQueueSize.
//   - getPosition/getStatus/getQueue/getCurrentTrack/getCurrentIndex/
//     getQueueSize sinkron di Kotlin (isBlockingSynchronousMethod) —
//     dideklarasikan sebagai return polos, seperti getCurrentIndex/
//     getQueueSize di spec NativePlaybackService.
//   - Yang HANYA ada sebagai *FromService di Kotlin (tanpa @ReactMethod)
//     sengaja TIDAK masuk spec: getPlaybackRate, getCurrentTrackInfo.
//
// Aturan tipe codegen (lihat header NativeDSPModule.ts): signature hanya
// primitif, array primitif, Promise — dipatuhi di sini.
export interface Spec extends TurboModule {
  // Transport (Promise — sesuai Kotlin: play menolak bila native gagal).
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(positionMs: number): void;
  next(): void;
  previous(): void;
  setShuffle(enabled: boolean): void;
  setRepeatMode(mode: number): void;
  // 🔥 FIX (2026-11-10, P-M9): laju playback (WSOLA time-stretch).
  setPlaybackRate(rate: number): void;
  // 🔥 FASE R (2026-11-11): retune — rasio pitch (1.0 = A=440).
  setPitchRatio(ratio: number): void;
  // Pindah ke indeks tertentu; Promise karena memuat trek (bisa gagal).
  jumpTo(index: number): Promise<void>;

  // Query sinkron (isBlockingSynchronousMethod di Kotlin).
  getPosition(): number;
  getStatus(): number;
  getQueue(): string[];
  getCurrentTrack(): string;
  getCurrentIndex(): number;
  getQueueSize(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackModule');
