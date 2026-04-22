// src/features/hardware/hooks/useUSBDAC.ts
import { useState, useEffect, useCallback } from "react";
const Platform = require("react-native").Platform;
import AsyncStorage from "@react-native-async-storage/async-storage";
import USBDACService, { DACInfo, DACConfig } from "../api/USBDACModule";

const STORAGE_KEY = "@pristineaudio/dac_config";

export interface UseUSBDACReturn {
  dacs: DACInfo[];
  currentDAC: DACInfo | null;
  isExclusiveMode: boolean;
  loading: boolean;
  config: DACConfig | null;
  error: string | null;
  scanDACs: () => Promise<void>;
  selectDAC: (dacId: string) => Promise<void>;
  toggleExclusiveMode: () => Promise<boolean>;
  setSampleRate: (rate: number | "auto") => Promise<boolean>;
  checkExclusiveMode: () => Promise<boolean>;
}

export const useUSBDAC = (): UseUSBDACReturn => {
  const [dacs, setDacs] = useState<DACInfo[]>([]);
  const [currentDAC, setCurrentDAC] = useState<DACInfo | null>(null);
  const [isExclusiveMode, setIsExclusiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DACConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedConfig();

    const unsubscribe = USBDACService.addListener((dac) => {
      if (dac) {
        setCurrentDAC(dac);
        if (config?.dacId === dac.id && config.exclusiveMode) {
          activateExclusiveMode(dac.id);
        }
      } else {
        setCurrentDAC(null);
        setIsExclusiveMode(false);
      }
    });

    // ✅ addExclusiveModeListener dihapus — tidak ada di USBDACService.
    // isExclusiveMode di-sync via checkExclusiveMode() saat load config
    // dan saat activate/deactivate exclusive mode.

    if (Platform.OS === "android") {
      scanDACs();
    }

    return () => {
      unsubscribe();
    };
  }, [config?.dacId]);

  const loadSavedConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        checkExclusiveMode();
      }
    } catch (e) {
      console.error("[useUSBDAC] Failed to load DAC config:", e);
    }
  };

  const saveConfig = async (newConfig: DACConfig) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (e) {
      console.error("[useUSBDAC] Failed to save DAC config:", e);
    }
  };

  const scanDACs = useCallback(async () => {
    setLoading(true);
    try {
      const detected = await USBDACService.detectDACs();
      setDacs(detected);
      if (detected.length === 1 && !currentDAC) {
        await handleSelectDAC(detected[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [currentDAC]);

  const handleSelectDAC = useCallback(
    async (dacId: string) => {
      const selected = dacs.find((d) => d.id === dacId);
      if (!selected) return;

      const recommended = await USBDACService.getRecommendedSettings(dacId);

      const newConfig: DACConfig = {
        dacId,
        exclusiveMode: recommended.exclusiveModeRecommended,
        sampleRate: recommended.sampleRate,
        bitDepth: recommended.bitDepth as 16 | 24 | 32,
        bufferSize: recommended.bufferSize,
        dsdMode: recommended.dsdMode as "native" | "dop" | "off",
        mqaMode: "off",
        volumeControl: "hardware",
      };

      await saveConfig(newConfig);
      setCurrentDAC(selected);

      if (newConfig.exclusiveMode) {
        await activateExclusiveMode(dacId);
      }
    },
    [dacs],
  );

  const checkExclusiveMode = useCallback(async () => {
    try {
      const active = await USBDACService.isExclusiveModeActive();
      setIsExclusiveMode(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  const activateExclusiveMode = useCallback(
    async (dacId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const result = await USBDACService.setExclusiveMode(dacId, true);
        if (result.success) {
          setIsExclusiveMode(true);
          if (config) await saveConfig({ ...config, exclusiveMode: true });
          return true;
        }
        return false;
      } catch (e: any) {
        setError(e.message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [config],
  );

  const deactivateExclusiveMode = useCallback(async (): Promise<boolean> => {
    if (!currentDAC) return false;
    setLoading(true);
    setError(null);
    try {
      const result = await USBDACService.setExclusiveMode(currentDAC.id, false);
      if (result.success) {
        setIsExclusiveMode(false);
        if (config) await saveConfig({ ...config, exclusiveMode: false });
        return true;
      }
      return false;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentDAC, config]);

  const toggleExclusiveMode = useCallback(async (): Promise<boolean> => {
    if (!currentDAC) {
      setError("No DAC selected");
      return false;
    }
    return isExclusiveMode
      ? await deactivateExclusiveMode()
      : await activateExclusiveMode(currentDAC.id);
  }, [
    currentDAC,
    isExclusiveMode,
    activateExclusiveMode,
    deactivateExclusiveMode,
  ]);

  const setSampleRate = useCallback(
    async (rate: number | "auto"): Promise<boolean> => {
      if (!config || !currentDAC) return false;
      if (rate !== "auto" && !currentDAC.sampleRates?.includes(rate)) {
        setError(`Sample rate ${rate}Hz not supported by DAC`);
        return false;
      }
      await saveConfig({ ...config, sampleRate: rate });
      return true;
    },
    [config, currentDAC],
  );

  return {
    dacs,
    currentDAC,
    isExclusiveMode,
    loading,
    config,
    error,
    scanDACs,
    selectDAC: handleSelectDAC,
    toggleExclusiveMode,
    setSampleRate,
    checkExclusiveMode,
  };
};
