// src/__tests__/features/gapless/gapless.test.ts
//
// Logika murni gapless (gapless.ts): default ON + deskripsi Settings.
// Tanpa mock — modul ini tidak mengimpor native / AsyncStorage.

import {
  GAPLESS_DEFAULT_ENABLED,
  GAPLESS_STORAGE_KEY,
  gaplessDescription,
} from "@/features/gapless/gapless";

describe("gapless (logika murni)", () => {
  it("default ON — perilaku yang diharapkan player audiophile", () => {
    expect(GAPLESS_DEFAULT_ENABLED).toBe(true);
  });

  it("kunci persist sendiri, bukan kunci crossfade", () => {
    expect(GAPLESS_STORAGE_KEY).toBe("gapless-storage");
    expect(GAPLESS_STORAGE_KEY).not.toBe("crossfade-storage");
  });

  it("ON + crossfade 0 -> deskripsi hidup (pre-roll + trim)", () => {
    expect(gaplessDescription(true, 0)).toMatch(/tanpa jeda/);
    expect(gaplessDescription(true, 0)).toMatch(/priming MP3/);
  });

  it("ON + crossfade > 0 -> deskripsi bilang crossfade menang", () => {
    const text = gaplessDescription(true, 5);
    expect(text).toMatch(/crossfade menang/);
    expect(text).toMatch(/sampai crossfade dimatikan/);
  });

  it("OFF -> deskripsi perilaku lama (jeda + fade 0,5 dtk)", () => {
    expect(gaplessDescription(false, 0)).toMatch(/perilaku lama/);
    expect(gaplessDescription(false, 0)).toMatch(/jeda muat/);
  });
});
