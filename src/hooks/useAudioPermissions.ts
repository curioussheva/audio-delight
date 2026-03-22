import { useState } from "react";
import { StorageAccessFramework } from "expo-file-system/legacy";

export const useAudioPermissions = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const requestPermission = async () => {
    try {
      const permissions =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();

      const isGranted = permissions.granted;
      setHasPermission(isGranted);

      if (isGranted) {
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