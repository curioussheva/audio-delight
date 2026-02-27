/**
 * trackPlayerAdapter.ts
 * 
 * Safe wrapper untuk react-native-track-player.
 * Kalau RNTP gagal diload (compile error / env issue),
 * otomatis fallback ke expo-av untuk basic playback.
 * 
 * Import dari sini, bukan langsung dari 'react-native-track-player'
 */

import { Audio } from 'expo-av';

// ─── Try load RNTP ────────────────────────────────────────────────────────────
let TrackPlayer: any = null;
let RNTPAvailable = false;

try {
  TrackPlayer = require('react-native-track-player').default;
  RNTPAvailable = true;
} catch (e) {
  console.warn('[TrackPlayerAdapter] react-native-track-player tidak bisa diload, pakai expo-av fallback.');
}

// ─── expo-av fallback state ───────────────────────────────────────────────────
let avSound: Audio.Sound | null = null;
let avIsPlaying = false;

async function avPlay() {
  if (avSound) await avSound.playAsync();
  avIsPlaying = true;
}

async function avPause() {
  if (avSound) await avSound.pauseAsync();
  avIsPlaying = false;
}

async function avStop() {
  if (avSound) {
    await avSound.stopAsync();
    await avSound.unloadAsync();
    avSound = null;
  }
  avIsPlaying = false;
}

async function avLoad(uri: string) {
  await avStop();
  await Audio.setAudioModeAsync({
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
  });
  const { sound } = await Audio.Sound.createAsync({ uri });
  avSound = sound;
}

// ─── Unified API ──────────────────────────────────────────────────────────────

export const Player = {
  isRNTP: RNTPAvailable,

  async setup() {
    if (RNTPAvailable) {
      const { setupTrackPlayer } = require('../services/TrackPlayerService');
      return setupTrackPlayer();
    }
    await Audio.setAudioModeAsync({ staysActiveInBackground: true });
    return false;
  },

  async play(uri?: string) {
    if (RNTPAvailable) return TrackPlayer.play();
    if (uri) await avLoad(uri);
    return avPlay();
  },

  async pause() {
    if (RNTPAvailable) return TrackPlayer.pause();
    return avPause();
  },

  async stop() {
    if (RNTPAvailable) return TrackPlayer.stop();
    return avStop();
  },

  async skipToNext() {
    if (RNTPAvailable) return TrackPlayer.skipToNext();
    // no-op in fallback
  },

  async skipToPrevious() {
    if (RNTPAvailable) return TrackPlayer.skipToPrevious();
    // no-op in fallback
  },

  async seekTo(pos: number) {
    if (RNTPAvailable) return TrackPlayer.seekTo(pos);
    if (avSound) await avSound.setPositionAsync(pos * 1000);
  },

  async setVolume(vol: number) {
    if (RNTPAvailable) return TrackPlayer.setVolume(vol);
    if (avSound) await avSound.setVolumeAsync(vol);
  },

  async reset() {
    if (RNTPAvailable) return TrackPlayer.reset();
    return avStop();
  },

  async add(tracks: any[]) {
    if (RNTPAvailable) return TrackPlayer.add(tracks);
    // fallback: load first track
    if (tracks[0]?.url) await avLoad(tracks[0].url);
  },
};

export { RNTPAvailable };
export default RNTPAvailable ? TrackPlayer : Player;
