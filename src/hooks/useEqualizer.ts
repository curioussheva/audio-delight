// src/hooks/useEqualizer.ts (update)
import { useState, useEffect, useCallback } from 'react';
import EqualizerService, { EqualizerBand } from '@/services/audio/EqualizerService';
import { ALL_PRESETS } from '@/constants/equalizerPresets';
import { loadCustomPresets } from '@/services/PresetStorage';

export const useEqualizer = () => {
  const [bands, setBands] = useState<EqualizerBand[]>(EqualizerService.getBands());
  const [isActive, setIsActive] = useState(false);
  const [presetName, setPresetName] = useState<string>('Flat');
  const [presets, setPresets] = useState<string[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('flat');

  // Load presets
  useEffect(() => {
    const loadPresets = async () => {
      const custom = await loadCustomPresets();
      const allPresetNames = [
        ...ALL_PRESETS.map(p => p.name),
        ...custom.map(p => p.name)
      ];
      setPresets(allPresetNames);
    };
    loadPresets();
  }, []);

  const updateBand = useCallback(async (index: number, gain: number) => {
    await EqualizerService.setBand(index, gain);
    setBands(EqualizerService.getBands());
    setPresetName('Custom');
    setActivePresetId('custom');
  }, []);

  const applyPreset = useCallback(async (presetId: string) => {
    // Cari preset di ALL_PRESETS
    const preset = ALL_PRESETS.find(p => p.id === presetId);
    if (preset) {
      await EqualizerService.setBands(preset.bands);
      setBands(preset.bands);
      setPresetName(preset.name);
      setActivePresetId(preset.id);
    }
  }, []);

  const toggleEQ = useCallback(async () => {
    if (isActive) {
      await EqualizerService.disable();
    } else {
      await EqualizerService.enable();
    }
    setIsActive(!isActive);
  }, [isActive]);

  return {
    bands,
    isActive,
    presetName,
    activePresetId,
    updateBand,
    applyPreset,
    toggleEQ,
    presets,
  };
};