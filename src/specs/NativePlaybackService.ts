import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Service (sync)
  startService(): void;
  stopService(): void;

  // Transport (Promise — sesuai Kotlin)
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: number): Promise<void>;
  // 🔥 FIX (2026-11-10, P-M9): laju playback 0.5–2.0 (WSOLA time-stretch).
  setPlaybackRate(rate: number): Promise<void>;
  // 🔥 FASE R (2026-11-11): retune — rasio pitch 0.5–2.0 (phase vocoder).
  // 1.0 = A=440, 432/440 = A=432.
  setPitchRatio(ratio: number): Promise<void>;
  // B17-P-b (2026-11-15): startIndex — indeks lagu yang di-tap /
  // di-resume di antrean ASLI (JS tidak lagi me-rotate). Default 0 =
  // perilaku lama. Opsional di TS, tapi @ReactMethod Kotlin mengharapkan
  // argumen ini selalu dikirim — semua pemanggil wajib eksplisit.
  // B17-headless (2026-11-15): metadata per trek (judul/artis/album/
  // artwork/durasi-ms) — urutan + panjang SAMA dengan `uris` (antrean
  // yang sudah difilter). Native menyimpannya di TrackInfo supaya
  // MediaSessionManager bisa menampilkan trek yang benar saat Next
  // headless (lock screen / headset, JS mati). Entri boleh "" / 0
  // (native memakai "" / 0 sebagai "tidak diketahui"); array yang
  // lebih pendek dari uris juga aman (native mengisi sisanya "").
  // Arity @ReactMethod harus cocok — semua pemanggil wajib kirim ke-8
  // argumen ini. Parameter metadata dibuat REQUIRED (bukan opsional
  // seperti startIndex) supaya tsc menangkap pemanggil yang ketinggalan.
  setQueue(
    uris: string[],
    sampleRates: number[] | null,
    startIndex: number,
    titles: string[],
    artists: string[],
    albums: string[],
    artworkUris: string[],
    durationsMs: number[],
  ): Promise<void>;

  // Query
  getPosition(): Promise<number>;
  getStatus(): Promise<number>;
  getQueue(): Promise<string[]>;
  getCurrentTrack(): Promise<string>;

  // Queue & navigasi (native yang memegang queue dan indeks).
  // getCurrentIndex/getQueueSize sinkron: pembacaan cepat, dipakai untuk
  // menampilkan posisi di queue dan harus akurat setelah next/prev/jumpTo.
  getCurrentIndex(): number;
  getQueueSize(): number;
  jumpTo(index: number): Promise<void>;

  // Media session
  updateMetadata(
    title: string,
    artist: string,
    album: string,
    durationMs: number,
    artworkUri: string | null,
  ): Promise<void>;

  updatePlaybackState(
    isPlaying: boolean,
    positionMs: number,
  ): Promise<void>;

  // 🔥 MediaSession sync untuk shuffle/repeat (lock screen ikut state).
  updateShuffleMode(enabled: boolean): Promise<void>;
  updateRepeatMode(mode: number): Promise<void>;

  clearCache(): Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');
