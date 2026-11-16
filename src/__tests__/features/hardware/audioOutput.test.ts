// src/__tests__/features/hardware/audioOutput.test.ts
//
// audioOutput.ts mengimpor spec TurboModule NativeDeviceModule (yang
// mengimpor react-native), jadi spec itu di-mock DI FILE INI SAJA
// (jest.mock lokal, mengikuti pola VisualizerService.test.ts). Yang diuji
// di sini — pathKindOf / canBeBitPerfect — murni dan tidak menyentuh
// bridge native sama sekali.

jest.mock("../../../specs/NativeDeviceModule", () => ({
  __esModule: true,
  default: {
    getDevices: jest.fn(async () => []),
    setActiveDevice: jest.fn(async () => true),
    getActiveDeviceStatus: jest.fn(async () => null),
    getCurrentOutputDevice: jest.fn(async () => null),
    getBluetoothCodec: jest.fn(async () => ({
      connected: false,
      deviceName: "",
      address: "",
    })),
  },
}));

import {
  canBeBitPerfect,
  pathKindOf,
} from "@/features/hardware/api/audioOutput";
import type { AudioDeviceDescriptor } from "@/specs/NativeDeviceModule";

const device = (type: string): AudioDeviceDescriptor => ({
  id: "1",
  name: "test",
  type,
  sampleRate: 48000,
  exclusive: false,
  isUsb: type === "usb",
});

describe("pathKindOf / canBeBitPerfect (F1, 2026-11-16)", () => {
  it("jalur internal (speaker/headset/earpiece/line_out) TIDAK mustahil bit-perfect — direct", () => {
    for (const type of ["speaker", "headset", "earpiece", "line_out"]) {
      expect(pathKindOf(device(type))).toBe("direct");
      expect(canBeBitPerfect(device(type))).toBe(true);
    }
  });

  it("USB dan HDMI tetap direct", () => {
    for (const type of ["usb", "hdmi"]) {
      expect(pathKindOf(device(type))).toBe("direct");
      expect(canBeBitPerfect(device(type))).toBe(true);
    }
  });

  it("Bluetooth selalu lewat mixer — audioflinger, tidak bisa bit-perfect", () => {
    expect(pathKindOf(device("bluetooth"))).toBe("audioflinger");
    expect(canBeBitPerfect(device("bluetooth"))).toBe(false);
  });

  it("tidak ada info perangkat → unknown / null (jangan klaim apa pun)", () => {
    expect(pathKindOf(null)).toBe("unknown");
    expect(pathKindOf(undefined)).toBe("unknown");
    expect(canBeBitPerfect(null)).toBeNull();
    expect(pathKindOf(device("unknown"))).toBe("unknown");
    expect(canBeBitPerfect(device("unknown"))).toBeNull();
  });
});
