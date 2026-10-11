/**
 * Kontrak warna aksen.
 *
 * Menguji JAMINAN yang diberikan `contrast.ts` + token `accent` di semua tema,
 * bukan cuma aritmetika WCAG. Kalau seseorang menambah tema baru dengan aksen
 * yang tidak terbaca, test ini gagal.
 */

import {
  accentOn,
  contrastRatio,
  AA_NORMAL,
} from "../../../shared/utils/contrast";
import { ALL_THEMES } from "../../../shared/constants/theme";

const themes = Object.values(ALL_THEMES);

const SURFACES = ["primary", "secondary", "tertiary", "elevated"] as const;
const ACCENT_KEYS = ["blue", "purple", "orange", "red", "green", "primary"] as const;

describe("kontrak accent", () => {
  it("setiap tema punya accent lengkap", () => {
    for (const t of themes) {
      for (const key of [...ACCENT_KEYS, "onPrimary", "onPrimaryKey"] as const) {
        expect(typeof t.colors.accent[key]).toBe("string");
        expect(t.colors.accent[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("onPrimary terbaca di atas accent.primary", () => {
    for (const t of themes) {
      const r = contrastRatio(t.colors.accent.onPrimary, t.colors.accent.primary);
      expect({ theme: t.id, ratio: Number(r.toFixed(2)) }).toEqual({
        theme: t.id,
        ratio: expect.any(Number),
      });
      expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("onPrimaryKey terbaca di atas primary[500]", () => {
    for (const t of themes) {
      const r = contrastRatio(t.colors.accent.onPrimaryKey, t.colors.primary[500]);
      expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("accentOn selalu mengembalikan warna yang terbaca", () => {
    for (const t of themes) {
      const c = t.colors;
      for (const key of ACCENT_KEYS) {
        for (const surface of SURFACES) {
          const bg = c.background[surface];
          const chosen = accentOn([c.accent[key]], bg, [
            c.text.primary,
            c.text.secondary,
          ]);
          const r = contrastRatio(chosen, bg);
          expect({ theme: t.id, key, surface, ratio: r }).toMatchObject({
            theme: t.id,
          });
          expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
        }
      }
    }
  });

  it("accentOn mengembalikan aksen tema saat aksen itu sendiri sudah terbaca", () => {
    // Cari satu kasus yang pasti: aksen yang kontrasnya tinggi di latarnya.
    const found = themes
      .flatMap((t) =>
        ACCENT_KEYS.map((key) => ({
          t,
          key,
          bg: t.colors.background.primary,
          accent: t.colors.accent[key],
          ratio: contrastRatio(t.colors.accent[key], t.colors.background.primary),
        })),
      )
      .find((x) => x.ratio >= AA_NORMAL);

    expect(found).toBeDefined();

    if (found) {
      const chosen = accentOn(
        [found.accent],
        found.bg,
        [found.t.colors.text.primary],
      );
      expect(chosen).toBe(found.accent);
    }
  });

  it("accentOn jatuh ke teks tema saat aksen tidak terbaca", () => {
    // Hitam di atas hitam: aksen gagal, harus jatuh ke kandidat berikutnya.
    const chosen = accentOn(["#000000"], "#000000", ["#FFFFFF"]);
    expect(chosen).toBe("#FFFFFF");
    expect(contrastRatio(chosen, "#000000")).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("accentOn tidak pernah mengembalikan nilai kosong", () => {
    expect(accentOn([undefined], "#000000", ["#FFFFFF"])).toBe("#FFFFFF");
    expect(accentOn([], "#000000", ["#FFFFFF"])).toBe("#FFFFFF");
    // Semua kosong -> "transparent", bukan crash dan bukan string kosong
    expect(accentOn([], "#000000", [])).toBe("transparent");
  });
});
