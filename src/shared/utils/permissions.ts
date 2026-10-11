import { PermissionsAndroid } from "react-native";
const Platform = require("react-native").Platform;

/**
 * Minta izin baca media yang benar untuk versi Android yang berjalan.
 *
 * KENAPA DIPISAH PER VERSI
 *
 * `READ_EXTERNAL_STORAGE` sudah tidak berlaku sejak Android 13 (API 33) dan
 * digantikan `READ_MEDIA_AUDIO`. Versi lama fungsi ini meminta KEDUANYA:
 *
 *     requestMultiple([RECORD_AUDIO, READ_EXTERNAL_STORAGE])
 *     if (Platform.Version >= 33) request("android.permission.READ_MEDIA_AUDIO")
 *
 * Tiga masalah dari bentuk itu:
 *
 *   1. `RECORD_AUDIO` tidak dibutuhkan sama sekali. App ini tidak merekam
 *      apa pun - user melihat dialog "izinkan merekam audio" dari pemutar
 *      musik, dan menolaknya membuat fungsi ini mengembalikan `false`
 *      walau izin media sudah diberikan.
 *   2. Di API 33+, `READ_EXTERNAL_STORAGE` selalu ditolak sistem, jadi
 *      cabang `return` yang memeriksa keduanya tidak pernah tercapai.
 *   3. Hasil `READ_MEDIA_AUDIO` menimpa hasil `requestMultiple` tanpa
 *      memeriksa, sehingga nilai balik tidak mencerminkan izin notifikasi
 *      apa pun yang mungkin ikut diminta.
 *
 * Sekarang: satu izin per versi, dan nilai baliknya berarti apa yang
 * dikatakan.
 */
export const requestAudioPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== "android") return true;

  try {
    // Android 13+ (API 33+): READ_MEDIA_AUDIO menggantikan READ_EXTERNAL_STORAGE.
    if (Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        "android.permission.READ_MEDIA_AUDIO" as any,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }

    // Android 12 ke bawah: READ_EXTERNAL_STORAGE masih berlaku.
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("[Permissions] Gagal meminta izin media:", err);
    return false;
  }
};
