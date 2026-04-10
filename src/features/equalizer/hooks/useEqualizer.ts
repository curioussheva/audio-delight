import { useCallback, useMemo } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { ALL_PRESETS } from "@/features/equalizer/constants/presets";

export const useEqualizer = () => {
  const { audioMode } = usePlayerStore();

  const {
    bands,
    activePresetId,
    customPresets,
    isEQEnabled,
    bassStrength,
    virtualizerLevel,
    reverbPreset,

    // Actions dari store
    setBandGain,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
    setBassBoost,
    setVirtualizer,
    setReverb,
    toggleEQ, // ← WAJIB diambil dari store
  } = useEqualizerStore();

  const isDSPDisabled = audioMode === "bit-perfect";

  // Toggle EQ (untuk Switch)
  const handleToggleEQ = useCallback(() => {
    if (isDSPDisabled) {
      console.warn("⚠️ DSP is locked in Bit-Perfect mode");
      return;
    }
    toggleEQ(); // ← Sekarang aman
  }, [isDSPDisabled, toggleEQ]);

  const updateBandGain = useCallback(
    (index: number, gain: number) => {
      if (isDSPDisabled) return;
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

  const handleSetBass = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setBassBoost(val);
    },
    [isDSPDisabled, setBassBoost],
  );

  const handleSetVirtualizer = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setVirtualizer(val);
    },
    [isDSPDisabled, setVirtualizer],
  );

  const handleSetReverb = useCallback(
    (presetIdx: number) => {
      if (isDSPDisabled) return;
      setReverb(presetIdx);
    },
    [isDSPDisabled, setReverb],
  );

  const allPresets = useMemo(
    () => [...ALL_PRESETS, ...customPresets],
    [customPresets],
  );

  return {
    // States
    isEQEnabled,
    isDSPDisabled,
    currentBands: bands,
    activePresetId,
    allPresets,
    bassStrength,
    virtualizerLevel,
    reverbPreset,

    // Actions
    toggleEQ: handleToggleEQ, // ← Ini yang dipakai di Screen
    updateBandGain,
    applyPreset: handleApplyPreset,
    savePreset: saveCustomPreset,
    deletePreset: deleteCustomPreset,
    setBassBoost: handleSetBass,
    setVirtualizer: handleSetVirtualizer,
    setReverb: handleSetReverb,
  };
};
