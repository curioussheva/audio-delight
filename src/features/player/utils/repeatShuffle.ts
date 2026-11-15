// src/features/player/utils/repeatShuffle.ts
//
// Pemetaan + validasi payload event native→JS `onPlaybackRepeatShuffleChanged`
// (Cleanup-4, 2026-11-15): lock screen / Android Auto mengubah repeat/shuffle
// lewat MediaSession callback → PlaybackNativeBridge.emitRepeatShuffleChanged
// mengirim WritableMap {repeatMode, shuffle} — repeatMode string
// "off"|"all"|"track" sesuai RepeatMode di playerStore.ts, shuffle boolean.
//
// Dipisah dari playerStore supaya bisa diuji murni (jest) tanpa store /
// bridge: listener di playerStore hanya memanggil parseRepeatShuffleEvent
// lalu set state — tanpa panggil balik ke native (tidak ada loop).

import type { RepeatMode } from "@/features/player/store/playerStore";

/** Native int → RepeatMode. Kontrak native: 0=off, 1=track, 2=all. */
export function repeatModeFromNativeInt(mode: number): RepeatMode {
  switch (mode) {
    case 1:
      return "track";
    case 2:
      return "all";
    case 0:
    default:
      return "off";
  }
}

export interface RepeatShuffleState {
  repeat: RepeatMode;
  shuffle: boolean;
}

const VALID_REPEAT_MODES: readonly string[] = ["off", "all", "track"];

/**
 * Validasi payload event `onPlaybackRepeatShuffleChanged`.
 * Mengembalikan null kalau payload bukan objek / repeatMode bukan salah satu
 * dari "off"|"all"|"track" / shuffle bukan boolean — listener mengabaikan
 * event seperti itu daripada menulis state sampah ke store.
 */
export function parseRepeatShuffleEvent(
  payload: unknown,
): RepeatShuffleState | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { repeatMode, shuffle } = payload as {
    repeatMode?: unknown;
    shuffle?: unknown;
  };
  if (
    typeof repeatMode !== "string" ||
    !VALID_REPEAT_MODES.includes(repeatMode)
  ) {
    return null;
  }
  if (typeof shuffle !== "boolean") return null;
  return { repeat: repeatMode as RepeatMode, shuffle };
}
