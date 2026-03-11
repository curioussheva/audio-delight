import { useState, useEffect, useCallback } from 'react';
import USBDACService from '@/services/hardware/USBDACService';
import { DACInfo, DACConfig } from '@/types/dac.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@pristineaudio/dac_config';

export const useUSBDAC = () => {
  const [dacs, setDacs] = useState<DACInfo[]>([]);
  const [currentDAC, setCurrentDAC] = useState<DACInfo | null>(null);
  const [isExclusiveMode, setIsExclusiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DACConfig | null>(null);

  const loadSavedConfig = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load DAC config:', error);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: DACConfig) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error('Failed to save DAC config:', error);
    }
  }, []);

  const scanDACs = useCallback(async () => {
    setLoading(true);
    try {
      const detected = await USBDACService.detectDACs();
      setDacs(detected);
      
      // Auto-select jika hanya satu DAC
      if (detected.length === 1 && config?.dacId !== detected[0].id) {
        handleSelectDAC(detected[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [config]);

  const handleSelectDAC = useCallback(async (dacId: string) => {
    const selected = dacs.find(d => d.id === dacId);
    if (!selected) return;

    // Buat konfigurasi default berdasarkan kemampuan DAC
    const newConfig: DACConfig = {
      dacId,
      exclusiveMode: true,
      sampleRate: 'auto',
      bitDepth: selected.capabilities.pcm768 ? 32 : 24,
      bufferSize: 256,
      dsdMode: selected.capabilities.dsdNative ? 'native' : 
               selected.capabilities.dsdDoP ? 'dop' : 'off',
      mqaMode: selected.capabilities.mqaRenderer ? 'renderer' : 'off',
    };

    await saveConfig(newConfig);
    await activateExclusiveMode(newConfig);
  }, [dacs, saveConfig]);

  const activateExclusiveMode = useCallback(async (dacConfig: DACConfig) => {
    setLoading(true);
    try {
      const success = await USBDACService.setExclusiveMode(
        dacConfig.exclusiveMode,
        dacConfig.dacId
      );
      
      if (success) {
        setIsExclusiveMode(dacConfig.exclusiveMode);
        setCurrentDAC(dacs.find(d => d.id === dacConfig.dacId) || null);
      }
    } finally {
      setLoading(false);
    }
  }, [dacs]);

  const toggleExclusiveMode = useCallback(async () => {
    if (!config) return;
    
    const newConfig = {
      ...config,
      exclusiveMode: !config.exclusiveMode,
    };
    
    await saveConfig(newConfig);
    await activateExclusiveMode(newConfig);
  }, [config, saveConfig, activateExclusiveMode]);

  useEffect(() => {
    loadSavedConfig();
    scanDACs();

    // Listen untuk perubahan DAC (misal dicabut)
    const unsubscribe = USBDACService.addListener((dac) => {
      setCurrentDAC(dac);
      setIsExclusiveMode(!!dac);
    });

    return unsubscribe;
  }, []);

  return {
    dacs,
    currentDAC,
    isExclusiveMode,
    loading,
    config,
    scanDACs,
    selectDAC: handleSelectDAC,
    toggleExclusiveMode,
  };
};