import TrackPlayer, { Capability, Event, RepeatMode, State } from 'react-native-track-player';
import USBDACService from '@/services/hardware/USBDACService';
import { Song } from '@/types/audio';
import { EqualizerBand } from '@/types/dsp.types';
import NativeDSPModule from '../native/NativeDSPModule';
import { startVisualizer, stopVisualizer } from '../native/VisualizerBridge';
import { requestAudioPermissions } from '@/utils/permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class AudioEngine {
  private isInitialized = false;
  private currentSessionId: number | null = null;

  private convertToTrack(song: Song) {
    return {
      id: song.id,
      url: song.uri,
      title: song.title,
      artist: song.artist,
      album: song.album || 'Pristine Audio',
      duration: song.duration,
      artwork: song.artwork,
      contentType: song.uri.toLowerCase().endsWith('.flac') ? 'audio/flac' : 'audio/mpeg',
      sampleRate: song.sampleRate,
      bitDepth: song.bitDepth,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await TrackPlayer.setupPlayer({
        minBuffer: 60,
        maxBuffer: 120,
        playBuffer: 1,
        backBuffer: 30,
        waitForBuffer: true,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: 'stop-playback-and-remove-notification' as any,
          alwaysPauseOnInterruption: true, 
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
          Capability.SeekTo,
        ],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      });

      this.isInitialized = true;
      
      const sessionId = await (TrackPlayer as any).getAudioSessionId();
      if (sessionId) {
        this.currentSessionId = sessionId;
        console.log(`[AudioEngine] Session ID Secured: ${sessionId}`);
      }
    } catch (error) {
      console.error('[AudioEngine] Setup failed:', error);
    }
  }

  // --- HARDWARE & DSP LOGIC ---

  async setExclusiveMode(enabled: boolean): Promise<boolean> {
    if (enabled) {
      stopVisualizer();
      // Bypass tipe dengan "as any" untuk menghindari TS error
      if (NativeDSPModule) await (NativeDSPModule as any).disableAllEffects();
    } else {
      if (this.currentSessionId) startVisualizer(this.currentSessionId);
    }
    
    if (NativeDSPModule) {
      return await (NativeDSPModule as any).toggleExclusiveMode(enabled);
    }
    return false;
  }

  async setEqBand(index: number, gain: number): Promise<void> {
    if (NativeDSPModule && !USBDACService.isExclusiveActive()) {
      // Bypass tipe dengan "as any"
      await (NativeDSPModule as any).updateEqualizerBand(index, gain);
    }
  }

  // --- QUEUE MANAGEMENT ---

  async setQueue(songs: Song[], startIndex: number = 0) {
    if (!this.isInitialized) await this.initialize();
    
    await TrackPlayer.reset();
    const tracks = songs.map(song => this.convertToTrack(song));
    await TrackPlayer.add(tracks);
    
    if (startIndex > 0) {
      // Bypass tipe custom d.ts yang tidak lengkap
      await (TrackPlayer as any).skip(startIndex);
    }
  }

  // --- CONTROLS ---

  async play(): Promise<void> {
    await TrackPlayer.play();
    
    const mode = await AsyncStorage.getItem('audio_mode_preference');
    if (mode !== 'bit-perfect') {
      const hasPermission = await requestAudioPermissions();
      if (hasPermission && this.currentSessionId) {
        await startVisualizer(this.currentSessionId);
      }
    }
  }

  async pause(): Promise<void> { 
    await TrackPlayer.pause(); 
    stopVisualizer(); 
  }

  async skipToNext(): Promise<void> {
    await TrackPlayer.skipToNext();
  }

  async skipToPrevious(): Promise<void> {
    await TrackPlayer.skipToPrevious();
  }

  async seek(position: number): Promise<void> { 
    await TrackPlayer.seekTo(position); 
  }

  async setPlaybackRate(speed: number) {
     await (TrackPlayer as any).setRate(speed);
  }

  async setRepeatMode(mode: 'off' | 'all' | 'track'): Promise<void> {
    const rMode = mode === 'track' ? RepeatMode.Track : 
                  mode === 'all' ? RepeatMode.Queue : RepeatMode.Off;
    await (TrackPlayer as any).setRepeatMode(rMode);
  }
  
  async getPosition(): Promise<number> {
    try {
      const player: any = TrackPlayer;
      // Menyesuaikan API v4 (getProgress) dan API v3 (getPosition) secara dinamis
      if (player.getProgress) {
        const progress = await player.getProgress();
        return progress.position;
      }
      return await player.getPosition();
    } catch {
      return 0;
    }
  }

  async destroy(): Promise<void> {
    stopVisualizer();
    await TrackPlayer.reset();
    this.isInitialized = false;
  }
}

export default new AudioEngine();
