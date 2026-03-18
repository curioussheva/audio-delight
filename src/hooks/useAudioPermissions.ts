import { useState } from "react";
import * as FileSystem from "expo-file-system";

export const useAudioPermissions = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  /**
   * Menggunakan Storage Access Framework (SAF)
   * Ini adalah standar Android modern untuk membaca folder musik kustom
   */
  const requestPermission = async () => {
    try {
      // Meminta user memilih folder musik mereka (misal folder /Music atau /Download)
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      const isGranted = permissions.granted;
      setHasPermission(isGranted);

      if (isGranted) {
        // Kamu bisa simpan URI folder ini ke AsyncStorage/Zustand
        // agar Scanner tahu folder mana yang harus diproses
        console.log("Directory URI granted:", permissions.directoryUri);
        return { granted: true, directoryUri: permissions.directoryUri };
      }

      return { granted: false };
    } catch (e) {
      console.error("Failed to get folder permissions:", e);
      setHasPermission(false);
      return { granted: false };
    }
  };

  return { hasPermission, requestPermission };
};
