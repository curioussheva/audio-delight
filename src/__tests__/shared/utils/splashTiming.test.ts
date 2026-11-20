// Penjaga durasi splash: "diperpanjang sedikit" harus tetap sedikit.
// Bila ada yang menaikkan konstanta melewati batas ini, tes gagal dan
// cold start tidak diam-diam jadi 5 detik.
import {
  SPLASH_EXTRA_MS,
  SPLASH_HOLD_MS,
  SPLASH_IMAGE_MS,
  SPLASH_READY_DELAY_MS,
} from "@/shared/utils/splashTiming";

describe("splashTiming", () => {
  it("menahan splash native sebentar saja (500–1000 ms)", () => {
    expect(SPLASH_HOLD_MS).toBeGreaterThanOrEqual(500);
    expect(SPLASH_HOLD_MS).toBeLessThanOrEqual(1000);
  });

  it("interstitial splash.png tampil sebentar saja (500–1500 ms)", () => {
    expect(SPLASH_IMAGE_MS).toBeGreaterThanOrEqual(500);
    expect(SPLASH_IMAGE_MS).toBeLessThanOrEqual(1500);
  });

  it("total tambahan sebelum rute tampil tidak lebih dari 2 detik", () => {
    expect(SPLASH_EXTRA_MS).toBe(SPLASH_HOLD_MS + SPLASH_IMAGE_MS);
    expect(SPLASH_EXTRA_MS).toBeLessThanOrEqual(2000);
  });

  it("jeda lama sebelum ready tidak berubah (200 ms)", () => {
    expect(SPLASH_READY_DELAY_MS).toBe(200);
  });
});
