import { useState, useEffect, useCallback } from 'react';
import EqualizerService, { EqualizerBand, EQ_PRESETS } from '@/services/audio/EqualizerService';

export const useEqualizer = () => {
  const [bands, setBands] = useState<EqualizerBand[]>(EqualizerService.getBands());
  const [isActive, setIsActive] = useState(false);
  const [presetName, setPresetName] = useState<keyof typeof EQ_PRESETS>('flat');

  const updateBand = useCallback(async (index: number, gain: number) => {
    await EqualizerService.setBand(index, gain);
    setBands(EqualizerService.getBands());
  }, []);

  const applyPreset = useCallback(async (name: keyof typeof EQ_PRESETS) => {
    const preset = EQ_PRESETS[name];
    await EqualizerService.setBands(preset);
    setBands(preset);
    setPresetName(name);
  }, []);

  const toggleEQ = useCallback(async () => {
    if (isActive) {
      await EqualizerService.disable();
    } else {
      await EqualizerService.enable();
    }
    setIsActive(!isActive);
  }, [isActive]);

  useEffect(() => {
    // Load saved EQ state
  }, []);

  return {
    bands,
    isActive,
    presetName,
    updateBand,
    applyPreset,
    toggleEQ,
    presets: Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[],
  };
};