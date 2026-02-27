import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpatialPosition } from '../types/audio.types';
import AudioEngine from '../audio/AudioEngine';

interface SpatialState {
  enabled: boolean;
  binauralEnabled: boolean;
  headTrackingEnabled: boolean;
  position: SpatialPosition;
  reverbAmount: number;  // 0.0 - 1.0

  // Actions
  setSpatialEnabled: (enabled: boolean) => void;
  setBinauralEnabled: (enabled: boolean) => void;
  setHeadTrackingEnabled: (enabled: boolean) => void;
  setPosition: (pos: SpatialPosition) => void;
  setReverbAmount: (amount: number) => void;
  resetPosition: () => void;
}

const DEFAULT_POSITION: SpatialPosition = { x: 0, y: 0, z: -1 };

export const useSpatialStore = create<SpatialState>()(
  persist(
    (set, get) => ({
      enabled: false,
      binauralEnabled: false,
      headTrackingEnabled: false,
      position: DEFAULT_POSITION,
      reverbAmount: 0,

      setSpatialEnabled: (enabled) => {
        set({ enabled });
        AudioEngine.setSpatialEnabled(enabled);
      },

      setBinauralEnabled: (binauralEnabled) => {
        set({ binauralEnabled });
        // HRTF is enabled/disabled via spatial enabled state
        if (binauralEnabled) AudioEngine.setSpatialEnabled(true);
      },

      setHeadTrackingEnabled: (headTrackingEnabled) => {
        set({ headTrackingEnabled });
      },

      setPosition: (position) => {
        set({ position });
        if (get().enabled) {
          AudioEngine.setSpatialPosition(position);
        }
      },

      setReverbAmount: (reverbAmount) => set({ reverbAmount }),

      resetPosition: () => {
        const pos = DEFAULT_POSITION;
        set({ position: pos });
        AudioEngine.setSpatialPosition(pos);
      },
    }),
    {
      name: 'audiodelight-spatial',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
