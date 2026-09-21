#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('src/specs/NativePlaybackService.ts')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

new_content = '''import type { TurboModule } from 'react-native';
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
  setQueue(uris: string[]): Promise<void>;

  // Query
  getPosition(): Promise<number>;
  getStatus(): Promise<number>;
  getQueue(): Promise<string[]>;
  getCurrentTrack(): Promise<string>;

  // Media session
  updateMetadata(
    title: string,
    artist: string,
    album: string,
    durationMs: number,
  ): Promise<void>;

  updatePlaybackState(
    isPlaying: boolean,
    positionMs: number,
  ): Promise<void>;

  // Lazy resolve
  resolveUri(rawUri: string): Promise<string>;
  clearCache(): Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');
'''

FILE.write_text(new_content)
print("✅ Spec rewritten with async signatures")
print("🎉 Done!")
