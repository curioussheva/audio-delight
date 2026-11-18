/**
 * ScanStatusBar — chip status scan di atas pill FloatingPlayer.
 *
 * Bentuk lama (banner full-width hijau terang di atas Library) dipindah
 * 2026-11-18 (keputusan csheva: "taruh di atas pill, jangan terlalu
 * mencolok"). Chip: background surface tema, teks kecil muted, satu baris
 * + indikator progres tipis bila total diketahui; non-interaktif.
 *
 * Sebagian test ini sengaja berbasis sumber, bukan render komponen: repo
 * ini tidak punya testing-library dan jest hanya menjalankan `.test.ts`,
 * jadi komponen .tsx tidak bisa di-render di test. Predikat visibilitas
 * (logika murni) diuji lewat impor langsung dari utils/scanStatus.ts.
 * Pasangan warna chip diuji dengan token tema asli (pola
 * playerContrast.test.ts).
 */
import * as fs from "fs";
import * as path from "path";
import { contrastRatio } from "@/shared/utils/contrast";
import { PRISTINE_NOIR, PRISTINE_PORCELAIN } from "@/shared/constants/themes/pristine";
import { PRISTINE_EMBER } from "@/shared/constants/themes/warm";
import type { Theme } from "@/shared/constants/themes/types";
import {
  isScanStatusVisible,
  type ScanStatusState,
} from "@/features/library/utils/scanStatus";

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../features/library/components/ScanStatusBar.tsx",
  ),
  "utf8",
);

// Hapus komentar (// ... dan /* ... */) sebelum diperiksa: komentar
// penjelas di file memang menyebut nama banner yang dimatikan — yang
// diuji adalah kodenya, bukan penjelasannya.
const code = source
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("ScanStatusBar — banner notif hijau dimatikan", () => {
  it("tidak lagi menampilkan banner 'songs ready for metadata enhancement'", () => {
    expect(code).not.toContain("ready for metadata enhancement");
    expect(code).not.toContain("unenrichedCount");
    expect(code).not.toContain('router.push("/(drawer)/settings")');
  });

  it("cabang progres scan tetap utuh (bukan seluruh komponen yang dimatikan)", () => {
    // Auto scan
    expect(code).toContain("Scanning library...");
    // Manual enrichment (isEnriching + enrichmentProgress) — sejak jadi
    // chip, teks dirakit template literal (dulu interpolasi JSX).
    expect(code).toContain("Enhancing ${current}/${total} songs...");
    // Background enrichment
    expect(code).toContain("in background...");
  });
});

describe("ScanStatusBar — chip di atas pill FloatingPlayer (bukan banner atas)", () => {
  it("tidak lagi memakai inset safe-area atas / posisi banner lama", () => {
    expect(code).not.toContain("useSafeAreaInsets");
    expect(code).not.toContain("safeTop");
    expect(code).not.toMatch(/paddingTop:\s*insets\.top/);
  });

  it("chip: background surface tema + sudut pill + teks kecil", () => {
    expect(code).toContain("colors.background.secondary");
    expect(code).toContain("borderRadius: 999");
    expect(code).toContain("fontSize: 12");
  });

  it("chip: tidak ada lagi background hijau terang / primary full-width", () => {
    expect(code).not.toContain("colors.status.success");
    expect(code).not.toContain("colors.primary[500]");
  });

  it("chip non-interaktif (tap tembus ke daftar di bawahnya)", () => {
    expect(code).toContain('pointerEvents="none"');
  });

  it("indikator progres tipis hanya bila total diketahui", () => {
    expect(code).toContain("progress != null");
    expect(code).toContain("Math.round(progress * 100)");
  });
});

describe("isScanStatusVisible — predikat visibilitas chip", () => {
  const base: ScanStatusState = {
    isAutoScanning: false,
    isEnriching: false,
    enrichmentProgress: null,
    isBackgroundEnriching: false,
    enrichmentQueueSize: 0,
  };

  it("sembunyi bila tidak ada yang berjalan", () => {
    expect(isScanStatusVisible(base)).toBe(false);
  });

  it("tampil saat auto scan berjalan", () => {
    expect(isScanStatusVisible({ ...base, isAutoScanning: true })).toBe(true);
  });

  it("tampil saat enriching manual dengan progress", () => {
    expect(
      isScanStatusVisible({
        ...base,
        isEnriching: true,
        enrichmentProgress: { current: 3, total: 200 },
      }),
    ).toBe(true);
  });

  it("sembunyi saat enriching tanpa progress", () => {
    expect(
      isScanStatusVisible({ ...base, isEnriching: true }),
    ).toBe(false);
  });

  it("tampil saat background enrichment antrean > 0", () => {
    expect(
      isScanStatusVisible({
        ...base,
        isBackgroundEnriching: true,
        enrichmentQueueSize: 200,
      }),
    ).toBe(true);
  });

  it("sembunyi saat background enrichment antrean 0", () => {
    expect(
      isScanStatusVisible({
        ...base,
        isBackgroundEnriching: true,
        enrichmentQueueSize: 0,
      }),
    ).toBe(false);
  });
});

const BRAND_THEMES: Theme[] = [PRISTINE_NOIR, PRISTINE_EMBER, PRISTINE_PORCELAIN];

describe("ScanStatusBar — kontras chip", () => {
  it.each(BRAND_THEMES)(
    "$name: teks chip (text.secondary) di atas background.secondary lolos 4.5:1",
    (theme) => {
      expect(
        contrastRatio(
          theme.colors.text.secondary,
          theme.colors.background.secondary,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: isi bar progres tipis (text.primary) di atas background.tertiary lolos 4.5:1",
    (theme) => {
      expect(
        contrastRatio(
          theme.colors.text.primary,
          theme.colors.background.tertiary,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
