// src/features/headphone/store/headphoneStore.ts
//
// Store profil koreksi headphone: simpan, aktifkan, dan ingat per perangkat.
//
// Mengapa store terpisah dari `equalizerStore`: EQ 10-band dan koreksi
// headphone punya bentuk data berbeda (band tetap vs cascade parametrik),
// siklus hidup berbeda (koreksi tidak ikut di-reset saat EQ di-flat-kan), dan
// perannya berbeda - koreksi menetralkan alat, EQ menyetel selera. Menyatukan
// keduanya berarti `resetToDefault()` EQ akan ikut menghapus profil headphone.
//
// Parsing TIDAK dilakukan di sini. Teks preset dikirim ke native, dan native
// yang memutuskan diterima atau ditolak. Modul ini tidak menyalin logika
// parser C++ ke JS: dua implementasi parser berarti dua kebenaran, dan yang
// di JS tidak pernah benar-benar dipakai untuk audio.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import NativeDSPModule from "@/specs/NativeDSPModule";
import {
  pruneDeviceProfiles,
  resolveProfileForDevice,
  shouldAutoActivate,
} from "../deviceBinding";
import type {
  HeadphoneCorrectionStore,
  HeadphoneProfile,
} from "../types";

/**
 * Baca ringkasan filter dari teks preset lewat native.
 *
 * Native mengembalikan jumlah filter aktif, atau -1 kalau ditolak. Nilai
 * selain -1 berarti preset sah - tapi jumlah saja tidak cukup untuk
 * menampilkan Fc/Gain/Q, jadi UI yang menampilkan rincian harus memakai
 * `activateProfile()` lalu membaca state.
 *
 * Untuk sekarang, ringkasan `filters` disimpan dari sisi JS hanya kalau
 * pemanggil sudah memilikinya (mis. dari parser di masa depan). Preset hasil
 * tempel disimpan tanpa rincian, dan itu jujur: kita tidak mengarang nilai
 * yang tidak kita baca.
 */
export const validatePreset = async (
  presetText: string,
): Promise<{ ok: boolean; filterCount: number }> => {
  try {
    const count = await NativeDSPModule.validateHeadphonePreset(presetText);
    if (typeof count !== "number" || count < 0) {
      return { ok: false, filterCount: 0 };
    }
    return { ok: true, filterCount: count };
  } catch (e) {
    console.warn("[Headphone] validatePreset gagal:", e);
    return { ok: false, filterCount: 0 };
  }
};

const makeId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "profil"}-${Date.now().toString(36)}`;
};

export const useHeadphoneStore = create<HeadphoneCorrectionStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      profiles: [],
      deviceProfiles: {},
      activeProfileId: null,
      enabled: false,

      // --- Actions ---

      activateProfile: async (profileId: string): Promise<boolean> => {
        const profile = get().profiles.find((p) => p.id === profileId);

        if (!profile) {
          console.warn("[Headphone] profil tidak ada:", profileId);
          return false;
        }

        try {
          // Native mem-parse ulang `presetText` di sini. Kalau ia menolak,
          // kita TIDAK menandai profil sebagai aktif - state tidak boleh
          // mengklaim sesuatu yang native tidak terapkan.
          const ok = await NativeDSPModule.loadHeadphonePreset(
            profile.presetText,
          );

          if (ok !== true) {
            console.warn(
              "[Headphone] native menolak preset:",
              profile.name,
            );
            return false;
          }

          NativeDSPModule.setHeadphoneCorrectionEnabled(true);

          set({ activeProfileId: profileId, enabled: true });
          return true;
        } catch (e) {
          console.warn("[Headphone] activateProfile gagal:", e);
          return false;
        }
      },

      deactivate: async () => {
        try {
          NativeDSPModule.setHeadphoneCorrectionEnabled(false);
          // Preset sengaja TIDAK dihapus di native: mematikannya harus bisa
          // dibalik tanpa memuat ulang profil.
          set({ enabled: false });
        } catch (e) {
          console.warn("[Headphone] deactivate gagal:", e);
        }
      },

      addProfile: (name, presetText, parsed) => {
        const id = makeId(name);

        const profile: HeadphoneProfile = {
          id,
          name,
          source: "parametric",
          preampDb: parsed.preampDb,
          filterCount: parsed.filters.length,
          filters: parsed.filters,
          presetText,
        };

        set({ profiles: [...get().profiles, profile] });
        return id;
      },

      deleteProfile: (profileId: string) => {
        const wasActive = get().activeProfileId === profileId;

        // Buang profil DAN setiap ikatan perangkat yang menunjuk ke sana,
        // supaya tidak ada deviceProfiles yang menggantung ke profil hilang.
        const deviceProfiles: Record<string, string> = {};
        for (const [deviceId, profId] of Object.entries(
          get().deviceProfiles,
        )) {
          if (profId !== profileId) deviceProfiles[deviceId] = profId;
        }

        set({
          profiles: get().profiles.filter((p) => p.id !== profileId),
          deviceProfiles,
          activeProfileId: wasActive ? null : get().activeProfileId,
        });

        if (wasActive) {
          void get().deactivate();
        }
      },

      bindDevice: (deviceId: string, profileId: string | null) => {
        const next = { ...get().deviceProfiles };

        if (profileId === null) {
          delete next[deviceId];
        } else {
          next[deviceId] = profileId;
        }

        set({ deviceProfiles: next });
      },

      syncForDevice: async (deviceId: string | null) => {
        // Keputusan "boleh dipasang otomatis?" ada di deviceBinding.ts (murni,
        // teruji). Di sini hanya efek sampingnya.
        if (
          !shouldAutoActivate(
            get().deviceProfiles,
            deviceId,
            get().profiles,
            get().activeProfileId,
          )
        ) {
          return;
        }

        const target = resolveProfileForDevice(
          get().deviceProfiles,
          deviceId,
          get().profiles,
        );

        if (!target) return;

        await get().activateProfile(target);
      },

      pruneDevices: (availableIds: string[]) => {
        const next = pruneDeviceProfiles(get().deviceProfiles, availableIds);

        // Hanya tulis kalau berubah - `set` memicu render.
        if (Object.keys(next).length !== Object.keys(get().deviceProfiles).length) {
          set({ deviceProfiles: next });
        }
      },

      resetAll: async () => {
        try {
          await NativeDSPModule.clearHeadphonePreset();
          NativeDSPModule.setHeadphoneCorrectionEnabled(false);
        } catch (e) {
          console.warn("[Headphone] resetAll gagal:", e);
        }
        set({
          profiles: [],
          deviceProfiles: {},
          activeProfileId: null,
          enabled: false,
        });
      },
    }),
    {
      name: "pristine-headphone",
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({
        profiles: state.profiles,
        deviceProfiles: state.deviceProfiles,
        activeProfileId: state.activeProfileId,
        enabled: state.enabled,
      }),
    },
  ),
);

export default useHeadphoneStore;
