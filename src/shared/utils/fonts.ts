// src/shared/utils/fonts.ts
//
// Font keluarga aplikasi (keputusan redesign final, 2026-11-18):
// Playfair Display = display/headings (serif elegan, meniru splashscreen),
// Inter = body/UI (bersih, legible). Keduanya OFL, dibundel sebagai file
// TTF di assets/fonts/.
//
// CATATAN SUMBER: file TTF disalin langsung dari paket
// @expo-google-fonts/inter dan @expo-google-fonts/playfair-display
// (bukan dependensi baru — `pnpm add` terhalang EPERM chown di sandbox
// VM, jadi TTF-nya disalin ke repo). Lisensi OFL ada di
// assets/fonts/OFL-LICENSE.txt.
import * as Font from "expo-font";

import { FONT_FAMILY } from "../constants/themes/base";

// Diekspor ulang supaya pemakai cukup mengimpor dari satu tempat.
export { FONT_FAMILY };
export type { AppFontFamily } from "../constants/themes/base";

/**
 * Muat semua font aplikasi lewat expo-font. Dipanggil sekali di boot
 * (`_layout` performInitialization), SEBELUM UI pertama — tapi TIDAK
 * PERNAH memblokir boot: kalau gagal (mis. aset hilang), kembalikan
 * `false` dan aplikasi lanjut dengan font sistem. Font dirujuk lewat
 * token (`theme.typography.fontFamily`), bukan dipanggil per komponen.
 */
export async function loadAppFonts(): Promise<boolean> {
  try {
    await Font.loadAsync({
      [FONT_FAMILY.regular]: require("../../../assets/fonts/Inter-Regular.ttf"),
      [FONT_FAMILY.medium]: require("../../../assets/fonts/Inter-Medium.ttf"),
      [FONT_FAMILY.semiBold]: require("../../../assets/fonts/Inter-SemiBold.ttf"),
      [FONT_FAMILY.bold]: require("../../../assets/fonts/Inter-Bold.ttf"),
      [FONT_FAMILY.display]: require("../../../assets/fonts/PlayfairDisplay-Regular.ttf"),
      [FONT_FAMILY.displayBold]: require("../../../assets/fonts/PlayfairDisplay-Bold.ttf"),
    });
    return true;
  } catch (e) {
    console.warn(
      "[FONTS] Gagal memuat font, lanjut dengan font sistem:",
      e,
    );
    return false;
  }
}
