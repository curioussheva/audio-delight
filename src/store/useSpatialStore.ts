import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpatialPosition } from '../types/audio.types';
import AudioEngine from '../audio/AudioEngine';

interface SpatialState {
  isHRTFEnabled: boolean;
  isSurroundEnabled: boolean;
  isHeadTrackingEnabled: boolean;
  position: SpatialPosition;
  reverbAmount: number;

  toggleHRTF: () => void;
  toggleSurround: () => void;
  toggleHeadTracking: () => void;
  setPosition: (pos: SpatialPosition) => void;
  setReverbAmount: (amount: number) => void;
  resetPosition: () => void;
}

const DEFAULT_POSITION: SpatialPosition = { x: 0, y: 0, z: 0 };

export const useSpatialStore = create<SpatialState>()(
  persist(
    (set, get) => ({
      isHRTFEnabled: false,
      isSurroundEnabled: false,
      isHeadTrackingEnabled: false,
      position: DEFAULT_POSITION,
      reverbAmount: 0,

      toggleHRTF: () => {
        const enabled = !get().isHRTFEnabled;
        set({ isHRTFEnabled: enabled });
        AudioEngine.setSpatialEnabled(enabled);
      },

      toggleSurround: () => set(s => ({ isSurroundEnabled: !s.isSurroundEnabled })),

      toggleHeadTracking: () => set(s => ({ isHeadTrackingEnabled: !s.isHeadTrackingEnabled })),

      setPosition: (position) => {
        set({ position });
        if (get().isHRTFEnabled) AudioEngine.setSpatialPosition(position);
      },

      setReverbAmount: (reverbAmount) => set({ reverbAmount }),

      resetPosition: () => {
        set({ position: DEFAULT_POSITION });
        AudioEngine.setSpatialPosition(DEFAULT_POSITION);
      },
    }),
    {
      name: 'audiodelight-spatial',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
