/**
 * AudioPlayer.ts — Week 2
 * Playback engine pakai expo-av sebagai pengganti react-native-track-player.
 * Support: MP3, FLAC, OGG, AAC, M4A, WAV
 * Features: background audio, progress tracking, queue management
 */

import { Audio, AVPlaybackStatus } from 'expo-av';
import { Track } from '../types/audio.types';

type ProgressCallback = (position: number, duration: number) => void;
type StateCallback = (state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped') => void;
type TrackCallback = (track: Track) => void;

class AudioPlayerService {
  private static _instance: AudioPlayerService;
  private sound: Audio.Sound | null = null;
  private currentTrack: Track | null = null;
  private queue: Track[] = [];
  private queueIndex = 0;
  private repeatMode: 'off' | 'track' | 'queue' = 'off';

  private onProgress: ProgressCallback | null = null;
  private onStateChange: StateCallback | null = null;
  private onTrackChange: TrackCallback | null = null;

  static getInstance() {
    if (!AudioPlayerService._instance)
      AudioPlayerService._instance = new AudioPlayerService();
    return AudioPlayerService._instance;
  }

  async setup() {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    console.log('[AudioPlayer] ✅ Setup complete');
  }

  // ─── Callbacks ──────────────────────────────────────────────────────────────
  setOnProgress(cb: ProgressCallback) { this.onProgress = cb; }
  setOnStateChange(cb: StateCallback) { this.onStateChange = cb; }
  setOnTrackChange(cb: TrackCallback) { this.onTrackChange = cb; }

  // ─── Queue ───────────────────────────────────────────────────────────────────
  setQueue(tracks: Track[], startIndex = 0) {
    this.queue = tracks;
    this.queueIndex = startIndex;
  }

  getQueue() { return this.queue; }
  getCurrentTrack() { return this.currentTrack; }

  // ─── Playback ────────────────────────────────────────────────────────────────
  async play(track?: Track) {
    if (track) {
      await this._loadTrack(track);
    } else if (this.sound) {
      await this.sound.playAsync();
      this.onStateChange?.('playing');
    }
  }

  async pause() {
    if (!this.sound) return;
    await this.sound.pauseAsync();
    this.onStateChange?.('paused');
  }

  async stop() {
    if (!this.sound) return;
    await this.sound.stopAsync();
    this.onStateChange?.('stopped');
  }

  async seekTo(seconds: number) {
    if (!this.sound) return;
    await this.sound.setPositionAsync(Math.round(seconds * 1000));
  }

  async setVolume(vol: number) {
    if (!this.sound) return;
    await this.sound.setVolumeAsync(Math.max(0, Math.min(1, vol)));
  }

  async skipToNext() {
    if (!this.queue.length) return;
    const nextIndex = this.queueIndex + 1;
    if (nextIndex < this.queue.length) {
      this.queueIndex = nextIndex;
      await this._loadTrack(this.queue[nextIndex]);
    } else if (this.repeatMode === 'queue') {
      this.queueIndex = 0;
      await this._loadTrack(this.queue[0]);
    }
  }

  async skipToPrevious() {
    if (!this.queue.length) return;
    const prevIndex = this.queueIndex - 1;
    if (prevIndex >= 0) {
      this.queueIndex = prevIndex;
      await this._loadTrack(this.queue[prevIndex]);
    } else if (this.repeatMode === 'queue') {
      this.queueIndex = this.queue.length - 1;
      await this._loadTrack(this.queue[this.queue.length - 1]);
    }
  }

  setRepeatMode(mode: 'off' | 'track' | 'queue') {
    this.repeatMode = mode;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────
  private async _loadTrack(track: Track) {
    this.onStateChange?.('loading');

    // Unload previous
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: true, volume: 1.0 },
        this._onPlaybackStatus.bind(this)
      );

      this.sound = sound;
      this.currentTrack = track;

      // Update queue index
      const idx = this.queue.findIndex(t => t.id === track.id);
      if (idx !== -1) this.queueIndex = idx;

      this.onTrackChange?.(track);
      this.onStateChange?.('playing');
      console.log('[AudioPlayer] ▶ Playing:', track.title);
    } catch (e) {
      console.error('[AudioPlayer] Load error:', e);
      this.onStateChange?.('idle');
    }
  }

  private _onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;

    const pos = (status.positionMillis ?? 0) / 1000;
    const dur = (status.durationMillis ?? 0) / 1000;
    this.onProgress?.(pos, dur);

    // Auto advance queue
    if (status.didJustFinish) {
      if (this.repeatMode === 'track') {
        this.sound?.replayAsync();
      } else {
        this.skipToNext();
      }
    }
  }
}

export default AudioPlayerService.getInstance();
