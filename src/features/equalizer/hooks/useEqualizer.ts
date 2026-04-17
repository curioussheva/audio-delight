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
    // ✅ Ambil state baru dari store
    isBassEnabled,
    isVirtualizerEnabled,
    isReverbEnabled,

    bassStrength,
    virtualizerLevel,
    reverbPreset,

    setBandGain,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
    setBassBoost,
    setVirtualizer,
    setReverb,
    toggleEQ,
    // ✅ Ambil setters baru dari store
    setBassEnabled,
    setVirtualizerEnabled,
    setReverbEnabled,
    resetToDefault,
  } = useEqualizerStore();

  const isDSPDisabled = audioMode === "bit-perfect";

  // --- Wrapper Actions dengan Guard Bit-Perfect ---

  const handleToggleEQ = useCallback(() => {
    if (isDSPDisabled) return;
    toggleEQ();
  }, [isDSPDisabled, toggleEQ]);

  // ✅ Wrapper untuk individual switches
  const handleSetBassEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setBassEnabled(val);
    },
    [isDSPDisabled, setBassEnabled],
  );

  const handleSetVirtualizerEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setVirtualizerEnabled(val);
    },
    [isDSPDisabled, setVirtualizerEnabled],
  );

  const handleSetReverbEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setReverbEnabled(val);
    },
    [isDSPDisabled, setReverbEnabled],
  );

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

  const handleResetToDefault = useCallback(() => {
    if (isDSPDisabled) return;
    resetToDefault();
  }, [isDSPDisabled, resetToDefault]);

  const allPresets = useMemo(
    () => [...ALL_PRESETS, ...customPresets],
    [customPresets],
  );

  return {
    // States
    isEQEnabled,
    isBassEnabled, // ✅ Expose ke UI
    isVirtualizerEnabled, // ✅ Expose ke UI
    isReverbEnabled, // ✅ Expose ke UI
    isDSPDisabled,
    currentBands: bands,
    activePresetId,
    allPresets,
    bassStrength,
    virtualizerLevel,
    reverbPreset,

    // Actions
    toggleEQ: handleToggleEQ,
    setBassEnabled: handleSetBassEnabled, // ✅ Expose ke UI
    setVirtualizerEnabled: handleSetVirtualizerEnabled, // ✅ Expose ke UI
    setReverbEnabled: handleSetReverbEnabled, // ✅ Expose ke UI
    updateBandGain,
    applyPreset: handleApplyPreset,
    savePreset: saveCustomPreset,
    deletePreset: deleteCustomPreset,
    setBassBoost: handleSetBass,
    setVirtualizer: handleSetVirtualizer,
    setReverb: handleSetReverb,
    resetToDefault: handleResetToDefault,
  };
};
