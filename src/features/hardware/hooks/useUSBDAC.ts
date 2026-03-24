// src/hooks/useUSBDAC.ts
import { useState, useEffect, useCallback } from "react";
import { NativeModules, Platform } from "react-native";
import { DACInfo, DACConfig } from "@/shared/types/dac";
import AsyncStorage from "@react-native-async-storage/async-storage";
import USBDACService from "@/features/hardware/api/usb"; // Import service kita

const { USBDACModule } = NativeModules;
const STORAGE_KEY = "@pristineaudio/dac_config";

export const useUSBDAC = () => {
  const [dacs, setDacs] = useState<DACInfo[]>([]);
  const [currentDAC, setCurrentDAC] = useState<DACInfo | null>(null);
  const [isExclusiveMode, setIsExclusiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DACConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Integrasi dengan USBDACService Listener
  useEffect(() => {
    loadSavedConfig();

    // Subscribe ke perubahan hardware dari Service
    const unsubscribe = USBDACService.addListener((dac) => {
      if (dac) {
        setCurrentDAC(dac);
        // Jika DAC dicolok dan kita punya config tersimpan untuk ID ini, aktifkan
        if (config?.dacId === dac.id && config.exclusiveMode) {
          activateExclusiveMode(dac.id);
        }
      } else {
        setCurrentDAC(null);
        setIsExclusiveMode(false);
      }
    });

    if (Platform.OS === "android") {
      scanDACs();
    }

    return () => unsubscribe();
  }, [config?.dacId]); // Re-run jika config ID berubah

  const loadSavedConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        if (parsed.exclusiveMode) {
          // Cek apakah mode exclusive masih aktif
          checkExclusiveMode();
        }
      }
    } catch (error) {
      console.error("Failed to load DAC config:", error);
    }
  };

  const saveConfig = async (newConfig: DACConfig) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error("Failed to save DAC config:", error);
    }
  };

  const scanDACs = useCallback(async () => {
    if (!USBDACModule) {
      setError("USBDACModule not available");
      return;
    }

    setLoading(true);
    try {
      const detected = await USBDACService.detectDACs(); // Gunakan service agar logic parsing seragam
      setDacs(detected);

      if (detected.length === 1 && !currentDAC) {
        await handleSelectDAC(detected[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [currentDAC]);

  const handleSelectDAC = useCallback(
    async (dacId: string) => {
      const selected = dacs.find((d) => d.id === dacId);
      if (!selected) return;

      // 2. Default Config yang lebih Audiophile-focused
      const newConfig: DACConfig = {
        dacId,
        exclusiveMode: true,
        sampleRate: "auto",
        bitDepth: selected.bitDepths.includes(32) ? 32 : 24,
        bufferSize: 512, // Buffer sedikit lebih besar untuk stabilitas Hi-Res
        dsdMode: selected.capabilities.dsdNative
          ? "native"
          : selected.capabilities.dsdDoP
            ? "dop"
            : "off",
        mqaMode: selected.capabilities.mqaRenderer ? "renderer" : "off",
        volumeControl: "hardware",
      };

      await saveConfig(newConfig);
      setCurrentDAC(selected);
      await activateExclusiveMode(dacId);
    },
    [dacs],
  );

  const checkExclusiveMode = useCallback(async () => {
    if (!USBDACModule) return false;
    try {
      const active = await USBDACModule.isExclusiveModeActive();
      setIsExclusiveMode(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  const activateExclusiveMode = useCallback(
    async (dacId: string) => {
      if (!USBDACModule) return false;

      setLoading(true);
      setError(null);
      try {
        const result = await USBDACModule.setExclusiveMode(dacId, true);

        if (result?.success) {
          setIsExclusiveMode(true);

          // Update config
          if (config) {
            await saveConfig({ ...config, exclusiveMode: true });
          }

          return true;
        }
        return false;
      } catch (error: any) {
        setError(error.message);
        console.error("Failed to activate exclusive mode:", error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [config],
  );

  const deactivateExclusiveMode = useCallback(async () => {
    if (!USBDACModule || !currentDAC) return false;

    setLoading(true);
    setError(null);
    try {
      const result = await USBDACModule.setExclusiveMode(currentDAC.id, false);

      if (result?.success) {
        setIsExclusiveMode(false);

        // Update config
        if (config) {
          await saveConfig({ ...config, exclusiveMode: false });
        }

        return true;
      }
      return false;
    } catch (error: any) {
      setError(error.message);
      console.error("Failed to deactivate exclusive mode:", error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentDAC, config]);

  const toggleExclusiveMode = useCallback(async () => {
    if (!currentDAC) {
      setError("No DAC selected");
      return false;
    }

    if (isExclusiveMode) {
      return await deactivateExclusiveMode();
    } else {
      return await activateExclusiveMode(currentDAC.id);
    }
  }, [
    currentDAC,
    isExclusiveMode,
    activateExclusiveMode,
    deactivateExclusiveMode,
  ]);

  // Set sample rate
  const setSampleRate = useCallback(
    async (rate: number | "auto") => {
      if (!config || !currentDAC) return false;

      // Jika 'auto', biarkan sistem yang menentukan
      if (rate !== "auto") {
        // Cek apakah sample rate didukung
        if (!currentDAC.sampleRates?.includes(rate)) {
          setError(`Sample rate ${rate}Hz not supported by DAC`);
          return false;
        }
      }

      const newConfig = {
        ...config,
        sampleRate: rate,
      };

      await saveConfig(newConfig);

      // Di sini kita perlu memberi tahu TrackPlayer untuk mengubah sample rate
      // Ini akan diimplementasikan nanti

      return true;
    },
    [config, currentDAC, saveConfig],
  );

  return {
    dacs,
    currentDAC,
    isExclusiveMode,
    outputMode: isExclusiveMode ? "exclusive" : "system",
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
