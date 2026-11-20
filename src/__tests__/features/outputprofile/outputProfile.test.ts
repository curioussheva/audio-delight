// src/__tests__/features/outputprofile/outputProfile.test.ts
//
// Logika murni Profil per Output: kategori dari tipe native, pemetaan
// default, resolve preset, dan keputusan auto-apply.

import {
  CONFIGURABLE_OUTPUT_CATEGORIES,
  DEFAULT_OUTPUT_PROFILE_MAP,
  OUTPUT_CATEGORY_LABELS,
  categoryOfDeviceType,
  presetNameById,
  resolveOutputPreset,
  shouldAutoApplyOutputProfile,
  type OutputProfileMap,
} from "@/features/outputprofile/outputProfile";

const ALL_IDS = [
  "flat",
  "clarity",
  "bass-boost",
  "rock",
  "custom_123",
];

describe("categoryOfDeviceType", () => {
  it("memetakan tiap tipe native ke kategori", () => {
    expect(categoryOfDeviceType("headset")).toBe("wired");
    expect(categoryOfDeviceType("usb")).toBe("usb");
    expect(categoryOfDeviceType("bluetooth")).toBe("bluetooth");
    expect(categoryOfDeviceType("speaker")).toBe("speaker");
    expect(categoryOfDeviceType("line_out")).toBe("line_out");
  });

  it("hdmi / earpiece / unknown / null -> other (tidak pernah auto-switch)", () => {
    expect(categoryOfDeviceType("hdmi")).toBe("other");
    expect(categoryOfDeviceType("earpiece")).toBe("other");
    expect(categoryOfDeviceType("unknown")).toBe("other");
    expect(categoryOfDeviceType(null)).toBe("other");
    expect(categoryOfDeviceType(undefined)).toBe("other");
    expect(categoryOfDeviceType("")).toBe("other");
  });

  it("lima kategori bisa dikonfigurasi; other tidak", () => {
    expect([...CONFIGURABLE_OUTPUT_CATEGORIES]).toEqual([
      "wired",
      "usb",
      "bluetooth",
      "speaker",
      "line_out",
    ]);
    expect(OUTPUT_CATEGORY_LABELS.bluetooth).toMatch(/Bluetooth/);
  });
});

describe("DEFAULT_OUTPUT_PROFILE_MAP", () => {
  it("default: hanya speaker -> Flat, sisanya tanpa perubahan", () => {
    expect(DEFAULT_OUTPUT_PROFILE_MAP).toEqual({
      wired: null,
      usb: null,
      bluetooth: null,
      speaker: "flat",
      line_out: null,
    });
  });
});

describe("resolveOutputPreset", () => {
  const mapping: OutputProfileMap = {
    wired: "clarity",
    usb: "bass-boost",
    bluetooth: null,
    speaker: "flat",
    line_out: "custom_123",
  };

  it("mengembalikan preset yang dipetakan bila ada di daftar", () => {
    expect(resolveOutputPreset(mapping, "wired", ALL_IDS)).toBe("clarity");
    expect(resolveOutputPreset(mapping, "speaker", ALL_IDS)).toBe("flat");
    expect(resolveOutputPreset(mapping, "line_out", ALL_IDS)).toBe(
      "custom_123",
    );
  });

  it("mapping null -> null (tetap seperti sekarang)", () => {
    expect(resolveOutputPreset(mapping, "bluetooth", ALL_IDS)).toBeNull();
  });

  it("kategori other -> null walau mapping punya nilai", () => {
    expect(resolveOutputPreset(mapping, "other", ALL_IDS)).toBeNull();
  });

  it("preset custom yang sudah dihapus -> null (bukan id mati)", () => {
    const stale: OutputProfileMap = { ...mapping, wired: "custom_hapus" };
    expect(resolveOutputPreset(stale, "wired", ALL_IDS)).toBeNull();
  });
});

describe("presetNameById", () => {
  const presets = [
    { id: "flat", name: "Flat" },
    { id: "custom_123", name: "IEM Saya" },
  ];

  it("nama ditemukan, id tak dikenal / null -> null", () => {
    expect(presetNameById(presets, "custom_123")).toBe("IEM Saya");
    expect(presetNameById(presets, "tidak-ada")).toBeNull();
    expect(presetNameById(presets, null)).toBeNull();
  });
});

describe("shouldAutoApplyOutputProfile", () => {
  const base = {
    enabled: true,
    eqEnabled: true,
    prevCategory: "speaker" as const,
    nextCategory: "wired" as const,
    targetPresetId: "clarity",
    activePresetId: "flat",
  };

  it("transisi kategori yang valid -> true", () => {
    expect(shouldAutoApplyOutputProfile(base)).toBe(true);
  });

  it("fitur OFF -> false", () => {
    expect(shouldAutoApplyOutputProfile({ ...base, enabled: false })).toBe(
      false,
    );
  });

  it("EQ mati -> false (dan EQ tidak boleh dinyalakan diam-diam)", () => {
    expect(shouldAutoApplyOutputProfile({ ...base, eqEnabled: false })).toBe(
      false,
    );
  });

  it("belum ada kategori sebelumnya (app baru start) -> false", () => {
    expect(
      shouldAutoApplyOutputProfile({ ...base, prevCategory: null }),
    ).toBe(false);
  });

  it("kategori sama -> false (manual override dihormati: poll ulang tidak re-apply)", () => {
    expect(
      shouldAutoApplyOutputProfile({
        ...base,
        prevCategory: "wired",
        nextCategory: "wired",
      }),
    ).toBe(false);
  });

  it("target null (tanpa perubahan / kategori other) -> false", () => {
    expect(
      shouldAutoApplyOutputProfile({ ...base, targetPresetId: null }),
    ).toBe(false);
  });

  it("target sudah aktif -> false (no-op)", () => {
    expect(
      shouldAutoApplyOutputProfile({ ...base, activePresetId: "clarity" }),
    ).toBe(false);
  });
});
