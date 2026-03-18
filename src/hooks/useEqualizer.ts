import { useCallback } from "react";
import { usePlayerStore } from "@/store/playerStore";
import { useEqualizerStore } from "@/store/equalizerStore";
import { ALL_PRESETS } from "@/constants/equalizerPresets";

export const useEqualizer = () => {
  const { audioMode } = usePlayerStore();

  // Ambil state dan action dari equalizerStore
  const {
    bands,
    activePresetId,
    customPresets,
    setBandGain,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
  } = useEqualizerStore();

  // Helper untuk mengecek apakah DSP boleh dimodifikasi
  const isDSPDisabled = audioMode === "bit-perfect";

  const updateBandGain = useCallback(
    (index: number, gain: number) => {
      // Blokir jika mode Bit-Perfect aktif
      if (isDSPDisabled) return;

      // Panggil store (store sudah otomatis memanggil AudioEngine)
      setBandGain(index, gain);
    },
    [isDSPDisabled, setBandGain],
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      if (isDSPDisabled) return;

      applyPreset(presetId);
    },
    [isDSPDisabled, applyPreset],
  );

  // Gabungkan preset bawaan dan preset buatan user untuk ditampilkan di UI
  const availablePresets = [...ALL_PRESETS, ...customPresets];

  return {
    isDSPDisabled,
    currentBands: bands,
    activePresetId,
    allPresets: availablePresets,
    updateBandGain,
    applyPreset: handleApplyPreset,
    savePreset: saveCustomPreset,
    deletePreset: deleteCustomPreset,
  };
};
