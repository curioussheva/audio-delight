// src/store/equalizerStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EqualizerStore, Preset } from '@/types/equalizer';
import { ALL_PRESETS, makeBands } from '@/constants/equalizerPresets';
import AudioEngine from '@/services/audio/AudioEngine'; // Sesuaikan path jika beda

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      // --- INITIAL STATE ---
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // Default rata
      activePresetId: 'flat',
      isEQEnabled: false,
      customPresets: [],

      // --- ACTIONS ---
      setEQEnabled: (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        // Opsional: Beritahu AudioEngine untuk bypass/aktifkan efek
      },

      applyPreset: (presetId: string) => {
        const { customPresets } = get();
        
        // Cari di preset bawaan dulu, kalau tidak ada cari di preset custom
        const preset = 
          ALL_PRESETS.find(p => p.id === presetId) || 
          customPresets.find(p => p.id === presetId);

        if (preset) {
          // Deep copy bands agar referensinya terpisah
          const newBands = JSON.parse(JSON.stringify(preset.bands));
          
          set({
            activePresetId: presetId,
            bands: newBands
          });

          // Aplikasikan ke mesin audio
          newBands.forEach((band: any) => {
            AudioEngine.setEqBand(band.id, band.gain);
          });
        }
      },

      setBandGain: (index: number, gain: number) => {
        const { bands } = get();
        const newBands = [...bands];
        newBands[index] = { ...newBands[index], gain };

        set({
          bands: newBands,
          activePresetId: 'custom_unsaved' // Tandai bahwa user sedang memodifikasi
        });

        // Langsung aplikasikan perubahan secara real-time
        AudioEngine.setEqBand(index, gain);
      },

      saveCustomPreset: (name: string) => {
        const { bands, customPresets } = get();
        
        const newPreset: Preset = {
          id: `custom_${Date.now()}`, // Generate ID unik pakai timestamp
          name: name,
          description: 'Custom user preset',
          isCustom: true,
          bands: JSON.parse(JSON.stringify(bands)) // Simpan formasi band saat ini
        };

        set({
          customPresets: [...customPresets, newPreset],
          activePresetId: newPreset.id // Langsung aktifkan preset yang baru dibuat
        });
      },

      deleteCustomPreset: (id: string) => {
        const { customPresets, activePresetId, applyPreset } = get();
        const updatedPresets = customPresets.filter(p => p.id !== id);

        set({ customPresets: updatedPresets });

        // Jika preset yang dihapus sedang dipakai, reset kembali ke Flat
        if (activePresetId === id) {
          applyPreset('flat');
        }
      }
    }),
    {
      name: 'equalizer-storage', // Nama key di AsyncStorage
      storage: createJSONStorage(() => AsyncStorage),
      // Kita tidak perlu menyimpan 'isEQEnabled' jika ingin EQ selalu off saat app baru dibuka (Opsional)
      // partialize: (state) => ({ bands: state.bands, activePresetId: state.activePresetId, customPresets: state.customPresets }),
    }
  )
);
