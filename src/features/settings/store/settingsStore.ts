import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  enableOnlineArtistImage: boolean;
  downloadOnlyOnWiFi: boolean;
  // Actions
  setEnableOnlineArtistImage: (enabled: boolean) => void;
  setDownloadOnlyOnWiFi: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      enableOnlineArtistImage: true,
      downloadOnlyOnWiFi: true,

      setEnableOnlineArtistImage: (enableOnlineArtistImage) => 
        set({ enableOnlineArtistImage }),
        
      setDownloadOnlyOnWiFi: (downloadOnlyOnWiFi) => 
        set({ downloadOnlyOnWiFi }),
    }),
    {
      name: "pristine-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
