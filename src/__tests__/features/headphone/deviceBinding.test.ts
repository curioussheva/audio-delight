/**
 * Logika pengikatan profil headphone ke perangkat output (Fase E).
 *
 * Diuji sebagai logika murni - tanpa React, tanpa zustand, tanpa native.
 * Inilah bagian yang menentukan "profil diingat per perangkat": kalau salah
 * di sini, koreksi yang salah dipasang ke headphone yang salah.
 */

import {
  deviceKey,
  pruneDeviceProfiles,
  resolveProfileForDevice,
  shouldAutoActivate,
} from "@/features/headphone/deviceBinding";
import type { HeadphoneProfile } from "@/features/headphone/types";

const profile = (id: string): HeadphoneProfile => ({
  id,
  name: id,
  source: "parametric",
  preampDb: -6.8,
  filterCount: 4,
  filters: [],
  presetText: "Preamp: -6.8 dB\n",
});

const profiles = [profile("chu"), profile("aria")];

describe("deviceKey", () => {
  it("mengubah id numerik Android jadi string", () => {
    // Native memakai AudioDeviceInfo.getId() (int). Kunci disimpan sebagai
    // string supaya JSON AsyncStorage tetap stabil.
    expect(deviceKey(7)).toBe("7");
    expect(deviceKey("7")).toBe("7");
  });

  it("null/undefined -> string kosong, bukan 'null'", () => {
    expect(deviceKey(null)).toBe("");
    expect(deviceKey(undefined)).toBe("");
  });

  it("id 0 tetap valid (0 = sistem memilih, tapi itu id nyata)", () => {
    expect(deviceKey(0)).toBe("0");
  });
});

describe("pruneDeviceProfiles", () => {
  it("membuang ikatan ke perangkat yang sudah tidak ada", () => {
    const result = pruneDeviceProfiles(
      { "7": "chu", "9": "aria" },
      [7, 12],
    );
    expect(result).toEqual({ "7": "chu" });
  });

  it("mempertahankan semua ikatan kalau perangkat masih ada", () => {
    const result = pruneDeviceProfiles({ "7": "chu", "9": "aria" }, [7, 9]);
    expect(result).toEqual({ "7": "chu", "9": "aria" });
  });

  it("menerima campuran id numerik dan string", () => {
    const result = pruneDeviceProfiles({ "7": "chu" }, ["7"]);
    expect(result).toEqual({ "7": "chu" });
  });

  it("tidak mengubah objek aslinya", () => {
    const original = { "7": "chu", "9": "aria" };
    pruneDeviceProfiles(original, [7]);
    expect(original).toEqual({ "7": "chu", "9": "aria" });
  });

  it("id perangkat tidak stabil antar colok-cabut -> entri basi normal", () => {
    // Cabut lalu colok ulang bisa memberi id berbeda. Peta lama harus bersih,
    // bukan menumpuk id mati.
    const result = pruneDeviceProfiles({ "7": "chu" }, [44]);
    expect(result).toEqual({});
  });
});

describe("resolveProfileForDevice", () => {
  it("mengembalikan profil yang terikat", () => {
    expect(resolveProfileForDevice({ "7": "chu" }, 7, profiles)).toBe("chu");
  });

  it("perangkat tanpa ikatan -> null", () => {
    expect(resolveProfileForDevice({ "7": "chu" }, 9, profiles)).toBeNull();
  });

  it("id kosong -> null", () => {
    expect(resolveProfileForDevice({ "7": "chu" }, null, profiles)).toBeNull();
    expect(resolveProfileForDevice({ "7": "chu" }, "", profiles)).toBeNull();
  });

  it("ikatan ke profil yang sudah dihapus -> null, bukan id mati", () => {
    // Ini yang mencegah activateProfile() dipanggil dengan id yang tidak ada
    // lalu gagal tanpa penjelasan.
    expect(resolveProfileForDevice({ "7": "hilang" }, 7, profiles)).toBeNull();
  });
});

describe("shouldAutoActivate", () => {
  it("true saat perangkat terikat ke profil yang belum aktif", () => {
    expect(shouldAutoActivate({ "7": "chu" }, 7, profiles, null)).toBe(true);
    expect(shouldAutoActivate({ "7": "chu" }, 7, profiles, "aria")).toBe(true);
  });

  it("false kalau profil itu sudah aktif", () => {
    // Tanpa ini, setiap polling 3 detik akan memuat ulang preset yang sama -
    // memicu perhitungan koefisien biquad berulang tanpa manfaat.
    expect(shouldAutoActivate({ "7": "chu" }, 7, profiles, "chu")).toBe(false);
  });

  it("false kalau perangkat tidak punya ikatan", () => {
    // Penting: perangkat tanpa ikatan TIDAK melepas koreksi yang sedang aktif.
    // Mematikannya otomatis akan membatalkan pilihan manual user.
    expect(shouldAutoActivate({}, 7, profiles, "chu")).toBe(false);
  });

  it("false kalau tidak ada perangkat", () => {
    expect(shouldAutoActivate({ "7": "chu" }, null, profiles, null)).toBe(
      false,
    );
  });

  it("false kalau profil terikat sudah dihapus", () => {
    expect(shouldAutoActivate({ "7": "hilang" }, 7, profiles, null)).toBe(
      false,
    );
  });

  it("dua perangkat berbeda -> masing-masing memicu profilnya sendiri", () => {
    const map = { "7": "chu", "9": "aria" };
    expect(shouldAutoActivate(map, 7, profiles, "aria")).toBe(true);
    expect(shouldAutoActivate(map, 9, profiles, "chu")).toBe(true);
    expect(shouldAutoActivate(map, 7, profiles, "chu")).toBe(false);
    expect(shouldAutoActivate(map, 9, profiles, "aria")).toBe(false);
  });
});
