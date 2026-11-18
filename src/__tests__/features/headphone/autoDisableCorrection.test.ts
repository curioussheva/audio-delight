// src/__tests__/features/headphone/autoDisableCorrection.test.ts
//
// Aturan auto-OFF koreksi saat perangkat kabel dicabut (keputusan
// 2026-11-18): rute berpindah dari kabel ke bukan kabel -> koreksi mati.
// Murni — tanpa React Native / store.

import { shouldAutoDisableCorrection } from "@/features/headphone/autoDisableCorrection";

describe("shouldAutoDisableCorrection", () => {
  it("jack/DAC dicabut (kabel -> speaker) saat koreksi aktif -> mati", () => {
    expect(shouldAutoDisableCorrection("headset", "speaker", true)).toBe(true);
    expect(shouldAutoDisableCorrection("usb", "speaker", true)).toBe(true);
    expect(shouldAutoDisableCorrection("line_out", "speaker", true)).toBe(true);
  });

  it("kabel -> hilang (null) saat koreksi aktif -> mati", () => {
    expect(shouldAutoDisableCorrection("headset", null, true)).toBe(true);
    expect(shouldAutoDisableCorrection("usb", null, true)).toBe(true);
  });

  it("kabel -> Bluetooth juga mati (koreksi headphone tidak berlaku di BT)", () => {
    expect(shouldAutoDisableCorrection("headset", "bluetooth", true)).toBe(true);
  });

  it("kabel -> kabel lain tidak mati (ganti DAC/headphone)", () => {
    expect(shouldAutoDisableCorrection("headset", "usb", true)).toBe(false);
    expect(shouldAutoDisableCorrection("usb", "headset", true)).toBe(false);
    expect(shouldAutoDisableCorrection("usb", "line_out", true)).toBe(false);
  });

  it("Bluetooth dicabut (BT -> speaker) TIDAK memicu (di luar lingkup)", () => {
    expect(shouldAutoDisableCorrection("bluetooth", "speaker", true)).toBe(false);
    expect(shouldAutoDisableCorrection("bluetooth", null, true)).toBe(false);
  });

  it("bukan kabel -> bukan kabel tidak memicu", () => {
    expect(shouldAutoDisableCorrection("speaker", "bluetooth", true)).toBe(false);
    expect(shouldAutoDisableCorrection("speaker", "speaker", true)).toBe(false);
    expect(shouldAutoDisableCorrection("hdmi", "speaker", true)).toBe(false);
    expect(shouldAutoDisableCorrection("unknown", "speaker", true)).toBe(false);
  });

  it("koreksi sudah mati -> tidak memicu", () => {
    expect(shouldAutoDisableCorrection("headset", "speaker", false)).toBe(false);
    expect(shouldAutoDisableCorrection("usb", null, false)).toBe(false);
  });

  it("tipe sebelumnya null (mount pertama) -> tidak memicu", () => {
    expect(shouldAutoDisableCorrection(null, "speaker", true)).toBe(false);
    expect(shouldAutoDisableCorrection(null, null, true)).toBe(false);
  });
});
