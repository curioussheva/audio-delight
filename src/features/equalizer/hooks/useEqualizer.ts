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
    masterGain,

    setBandGain,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
    setBassBoost,
    setVirtualizer,
    setReverb,
    setMasterGain,
    toggleEQ,
    // ✅ Ambil setters baru dari store
    setBassEnabled,
    setVirtualizerEnabled,
    setReverbEnabled,
    resetToDefault,
    // (Item 7) Flush saat drag dilepas — lihat store.
    flushBandDrag,
    flushBassBoostDrag,
    flushVirtualizerDrag,
    flushMasterGainDrag,
  } = useEqualizerStore();

  // DUA mode mematikan mesin DSP, bukan satu.
  //
  // Mode Bit-Perfect melewati pemrosesan supaya output murni. Mode Immersive
  // TIDAK memakai mesin DSP sama sekali - ia menjalankan rantai resonansinya
  // sendiri (solfeggio, exciter, spatial, brainwave). Menyalakan EQ/bass/width
  // di mode Immersive berarti kontrol di layar EQ mengaku mengubah suara,
  // padahal yang memproses justru rangkaian lain. Karena itu keduanya beku.
  //
  // Satu-satunya mode yang menghidupkan mesin ini adalah `dsp`.
  const isDSPDisabled =
    audioMode === "bit-perfect" || audioMode === "immersive";

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

  const handleSetMasterGain = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setMasterGain(val);
    },
    [isDSPDisabled, setMasterGain],
  );

  const handleResetToDefault = useCallback(() => {
    if (isDSPDisabled) return;
    resetToDefault();
  }, [isDSPDisabled, resetToDefault]);

  // (Item 7) Flush nilai akhir drag saat release — guard DSP yang sama
  // seperti setter-nya: di bit-perfect / immersive tidak ada drag yang
  // bisa menaruh pending, jadi flush di sana no-op yang dilewati.
  const handleFlushBandDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBandDrag();
  }, [isDSPDisabled, flushBandDrag]);

  const handleFlushBassBoostDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBassBoostDrag();
  }, [isDSPDisabled, flushBassBoostDrag]);

  const handleFlushVirtualizerDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushVirtualizerDrag();
  }, [isDSPDisabled, flushVirtualizerDrag]);

  const handleFlushMasterGainDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushMasterGainDrag();
  }, [isDSPDisabled, flushMasterGainDrag]);

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
    masterGain,

    // Actions
    toggleEQ: handleToggleEQ,
    setBassEnabled: handleSetBassEnabled, // ✅ Expose ke UI
    setVirtualizerEnabled: handleSetVirtualizerEnabled, // ✅ Expose ke UI
    setReverbEnabled: handleSetReverbEnabled, // ✅ Expose ke UI
    setMasterGain: handleSetMasterGain,
    updateBandGain,
    applyPreset: handleApplyPreset,
    savePreset: saveCustomPreset,
    deletePreset: deleteCustomPreset,
    setBassBoost: handleSetBass,
    setVirtualizer: handleSetVirtualizer,
    setReverb: handleSetReverb,
    resetToDefault: handleResetToDefault,
    // (Item 7) Flush saat drag dilepas.
    flushBandDrag: handleFlushBandDrag,
    flushBassBoostDrag: handleFlushBassBoostDrag,
    flushVirtualizerDrag: handleFlushVirtualizerDrag,
    flushMasterGainDrag: handleFlushMasterGainDrag,
  };
};
