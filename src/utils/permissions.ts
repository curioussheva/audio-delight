import { PermissionsAndroid, Platform } from "react-native";

export const requestAudioPermissions = async () => {
  if (Platform.OS !== "android") return true;

  try {
    const grants = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    ]);

    // Untuk Android 13+ (SDK 33+), gunakan READ_MEDIA_AUDIO
    if (Platform.Version >= 33) {
      const audioGrant = await PermissionsAndroid.request(
        "android.permission.READ_MEDIA_AUDIO" as any,
      );
      return audioGrant === PermissionsAndroid.RESULTS.GRANTED;
    }

    return (
      grants["android.permission.RECORD_AUDIO"] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      grants["android.permission.READ_EXTERNAL_STORAGE"] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.warn(err);
    return false;
  }
};
