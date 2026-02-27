import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppMode } from '../types/audio.types';

interface AppState {
  onboardingComplete: boolean;
  appMode: AppMode;
  isPremium: boolean;
  theme: 'dark';  // Only dark for now

  // Actions
  completeOnboarding: (mode: AppMode) => void;
  setAppMode: (mode: AppMode) => void;
  setPremium: (premium: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      appMode: 'clarity',
      isPremium: false,
      theme: 'dark',

      completeOnboarding: (mode) =>
        set({ onboardingComplete: true, appMode: mode }),

      setAppMode: (appMode) => set({ appMode }),

      setPremium: (isPremium) => set({ isPremium }),
    }),
    {
      name: 'audiodelight-app',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
