/**
 * Gradient Player + token font display (Fase 3, layar Player).
 *
 * Mengunci dua hal yang diverifikasi di audit Fase 3:
 *
 * 1. Gradient Player hangat (2–3 stop, vertikal, statis) di tema yang
 *    dinamai tugas: pristine-ember, pristine-hearth, pristine-porcelain.
 *    "Hangat" diuji sebagai R >= G >= B per stop — definisi yang sama
 *    dengan palet rencana (#B7791F, #1D130C, #FDF9F1 semuanya lolos).
 *    Gradient dibaca Player dari token tema (`colors.gradient.primary`),
 *    jadi test ini mengunci tokennya, bukan komponennya.
 *
 * 2. PENGECUALIAN yang disengaja — pristine-noir: stop bawah gradient
 *    BUKAN hangat, melainkan navy #0A1628 = background.primary tema itu
 *    sendiri. Navy adalah identitas Noir yang didokumentasikan di
 *    header pristine.ts ("Background noir = #0A1628 persis", splash
 *    navy/perak/emas) — gradient yang hangat di sini justru merusak
 *    identitas tema + menimbulkan sambungan cokelat di atas panel navy.
 *    Yang dikunci: stop bawah SELALU sama dengan background.primary
 *    (gradient menyatu mulus ke panel), bukan nilai hangat.
 *
 * 3. Token font display: semua tema menyediakan display/displayBold =
 *    Playfair Display (Fase 1). Judul Player merujuk token ini; bila
 *    token hilang, judul jatuh diam-diam ke font sistem — test ini
 *    mencegah regresi sunyi itu.
 */
import { ALL_THEMES } from "../../../shared/constants/theme";
import { FONT_FAMILY } from "../../../shared/constants/themes/base";
import { parseHex } from "../../../shared/utils/contrast";

/** Hangat = merah paling dominan, biru paling kecil (R >= G >= B). */
function isWarmHex(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return rgb.r >= rgb.g && rgb.g >= rgb.b;
}

describe("gradient Player hangat (Fase 3)", () => {
  it.each(["pristine-ember", "pristine-hearth", "pristine-porcelain"] as const)(
    "tema %s: semua stop gradient.primary hangat (R >= G >= B)",
    (id) => {
      const theme = ALL_THEMES[id];
      expect(theme).toBeDefined();
      const stops = theme.colors.gradient?.primary ?? [];
      expect(stops.length).toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(isWarmHex(stop)).toBe(true);
      }
    },
  );

  it("pristine-noir: stop bawah gradient = background.primary (identitas navy, bukan hangat)", () => {
    const noir = ALL_THEMES["pristine-noir"];
    expect(noir).toBeDefined();
    const stops = noir.colors.gradient?.primary ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(2);
    expect(stops[stops.length - 1]).toBe(noir.colors.background.primary);
    expect(noir.colors.background.primary).toBe("#0A1628");
  });
});

describe("token font display (Fase 3)", () => {
  it("semua tema: display + displayBold = Playfair Display (token Fase 1)", () => {
    for (const theme of Object.values(ALL_THEMES)) {
      expect(theme.typography?.fontFamily?.display).toBe(
        FONT_FAMILY.display,
      );
      expect(theme.typography?.fontFamily?.displayBold).toBe(
        FONT_FAMILY.displayBold,
      );
    }
  });

  it("nama keluarga font sesuai yang didaftarkan ke expo-font", () => {
    expect(FONT_FAMILY.display).toBe("PlayfairDisplay-Regular");
    expect(FONT_FAMILY.displayBold).toBe("PlayfairDisplay-Bold");
  });
});
