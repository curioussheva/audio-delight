// src/__tests__/features/hrtf/hrtfGate.test.ts
//
// Gate HRTF (langkah 6, 2026-11-19): HRTF hanya di headphone.
// Murni — tanpa React Native / store.
//
// Beda kunci dari auto-off koreksi headphone: koreksi mati hanya saat
// rute PINDAH dari kabel ke bukan kabel; HRTF mati kapan pun perangkat
// AKTIF bukan headphone (termasuk BT -> speaker dan speaker -> speaker).

import {
  isHrtfAllowedDevice,
  shouldAutoDisableHrtf,
} from "@/features/hrtf/hrtfGate";

describe("shouldAutoDisableHrtf", () => {
  it("headphone dicabut (headset/usb -> speaker) saat HRTF aktif -> mati", () => {
    expect(shouldAutoDisableHrtf("headset", "speaker", true)).toBe(true);
    expect(shouldAutoDisableHrtf("usb", "speaker", true)).toBe(true);
  });

  it("headphone -> earpiece/hdmi/line_out/unknown saat aktif -> mati", () => {
    expect(shouldAutoDisableHrtf("headset", "earpiece", true)).toBe(true);
    expect(shouldAutoDisableHrtf("headset", "hdmi", true)).toBe(true);
    expect(shouldAutoDisableHrtf("headset", "line_out", true)).toBe(true);
    expect(shouldAutoDisableHrtf("usb", "unknown", true)).toBe(true);
  });

  it("perangkat belum diketahui (next null) -> tidak memicu (EQ-25: null = tak diketahui, bukan dicabut)", () => {
    expect(shouldAutoDisableHrtf("headset", null, true)).toBe(false);
    expect(shouldAutoDisableHrtf("bluetooth", null, true)).toBe(false);
    expect(shouldAutoDisableHrtf(null, null, true)).toBe(false);
  });

  it("Bluetooth -> speaker JUGA mati (beda dari koreksi: HRTF tidak punya lingkup kabel)", () => {
    expect(shouldAutoDisableHrtf("bluetooth", "speaker", true)).toBe(true);
    expect(shouldAutoDisableHrtf("bluetooth", "line_out", true)).toBe(true);
  });

  it("speaker -> speaker tetap mati kalau HRTF somehow menyala", () => {
    expect(shouldAutoDisableHrtf("speaker", "speaker", true)).toBe(true);
    expect(shouldAutoDisableHrtf("unknown", "speaker", true)).toBe(true);
  });

  it("antar headphone tidak mati (ganti jack/DAC/TWS)", () => {
    expect(shouldAutoDisableHrtf("headset", "usb", true)).toBe(false);
    expect(shouldAutoDisableHrtf("usb", "headset", true)).toBe(false);
    expect(shouldAutoDisableHrtf("headset", "bluetooth", true)).toBe(false);
    expect(shouldAutoDisableHrtf("bluetooth", "headset", true)).toBe(false);
    expect(shouldAutoDisableHrtf("bluetooth", "bluetooth", true)).toBe(false);
  });

  it("bukan headphone -> headphone tidak auto-ON (tetap mati, user yang menyalakan)", () => {
    expect(shouldAutoDisableHrtf("speaker", "headset", true)).toBe(false);
    expect(shouldAutoDisableHrtf("speaker", "bluetooth", true)).toBe(false);
  });

  it("HRTF sudah mati -> tidak memicu", () => {
    expect(shouldAutoDisableHrtf("headset", "speaker", false)).toBe(false);
    expect(shouldAutoDisableHrtf("usb", null, false)).toBe(false);
  });

  it("observasi pertama yang sudah berisi tipe non-headphone TETAP diperiksa (EQ-24)", () => {
    // Dulu `prev === null` membuat observasi pertama apa pun lolos —
    // HRTF ON bertahan di speaker bila poll pertama langsung speaker.
    expect(shouldAutoDisableHrtf(null, "speaker", true)).toBe(true);
    expect(shouldAutoDisableHrtf(null, "earpiece", true)).toBe(true);
    expect(shouldAutoDisableHrtf(null, "headset", true)).toBe(false);
  });
});

describe("isHrtfAllowedDevice", () => {
  it("headset/usb/bluetooth diizinkan", () => {
    expect(isHrtfAllowedDevice("headset")).toBe(true);
    expect(isHrtfAllowedDevice("usb")).toBe(true);
    expect(isHrtfAllowedDevice("bluetooth")).toBe(true);
  });

  it("speaker/earpiece/hdmi/line_out/unknown tidak diizinkan", () => {
    expect(isHrtfAllowedDevice("speaker")).toBe(false);
    expect(isHrtfAllowedDevice("earpiece")).toBe(false);
    expect(isHrtfAllowedDevice("hdmi")).toBe(false);
    expect(isHrtfAllowedDevice("line_out")).toBe(false);
    expect(isHrtfAllowedDevice("unknown")).toBe(false);
  });

  it("belum diketahui (null/undefined) -> diizinkan sementara (jangan kunci toggle sebelum poll pertama)", () => {
    expect(isHrtfAllowedDevice(null)).toBe(true);
    expect(isHrtfAllowedDevice(undefined)).toBe(true);
  });
});
