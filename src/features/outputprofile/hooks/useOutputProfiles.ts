// src/features/outputprofile/hooks/useOutputProfiles.ts
//
// Hook Profil per Output: terapkan preset EQ otomatis saat jalur output
// berubah (jack dicabut/dicolok, DAC USB, Bluetooth terhubung, pindah ke
// speaker) — selama fitur diaktifkan user di Settings.
//
// Dipasang di root (ThemedStack, _layout.tsx) di samping useHrtfGate /
// useHeadphoneCorrection, supaya jalan di layar mana pun — bukan hanya
// saat layar Settings/EQ terbuka (pelajaran P1-7).
//
// Sinyal: `useAudioOutput()` yang sudah ada (poll `currentDevice` 3
// detik — latensi auto-switch sampai ~3 detik, sama seperti auto-OFF
// koreksi). Tidak ada mekanisme deteksi baru.
//
// Perilaku — semuanya mengikuti putusan di `outputProfile.ts`:
// - Default OFF; sebelum user opt-in, hook ini tidak melakukan apa-apa.
// - Hanya TRANSISI live antar kategori yang memicu. Perangkat pertama
//   yang terbaca saat app start hanya dicatat, tidak diterapkan
//   (membuka app tidak boleh menimpa preset user).
// - EQ mati (mode Bit-Perfect/Immersive, atau sakelar EQ OFF) -> tidak
//   diterapkan, dan EQ TIDAK dinyalakan diam-diam.
// - Toast selalu menamai perubahan ("Output Bluetooth — preset Bass
//   Boost diterapkan"), jadi tidak pernah senyap.
// - Manual override dihormati: setelah auto-switch, tidak ada pemicu
//   lagi sampai kategori BERPINDAH. User mengubah EQ manual lalu poll
//   berikutnya membaca kategori yang sama -> tidak ada re-apply.
// - Transisi ke "other" (perangkat null/unknown — mis. stream sempat
//   tertutup saat poll) diabaikan TANPA menimpa kategori terakhir yang
//   diketahui, supaya flapping poll tidak menerapkan ulang preset.
// - Auto-OFF koreksi headphone (`useHeadphoneCorrection`) TIDAK
//   disentuh: fitur ini berlapis DI ATASNYA, bukan menggantinya. Cabut
//   jack tetap mematikan koreksi (di sana) dan menerapkan preset
//   speaker (di sini) — dua mekanisme independen atas transisi yang
//   sama, tidak saling menimpa state.
//
// BATAS JUJUR — TWS vs mobil: keduanya bertipe "bluetooth" (lihat
// `outputProfile.ts` §3). Satu preset Bluetooth berlaku untuk keduanya
// sampai ada plumbing native `BluetoothDevice.getBluetoothClass()`
// (API publik; butuh Kotlin + spec + izin BLUETOOTH_CONNECT + rebuild).
// Itu follow-up native, BUKAN bagian ronde ini.

import { useEffect, useRef } from "react";

import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { ALL_PRESETS } from "@/features/equalizer/constants/presets";
import { useToastStore } from "@/shared/store/toastStore";
import { useOutputProfileStore } from "../store/outputProfileStore";
import {
  OUTPUT_CATEGORY_LABELS,
  categoryOfDeviceType,
  presetNameById,
  resolveOutputPreset,
  shouldAutoApplyOutputProfile,
  type OutputCategory,
} from "../outputProfile";

export const useOutputProfiles = (): void => {
  const { currentDevice } = useAudioOutput();

  const enabled = useOutputProfileStore((s) => s.enabled);
  const mapping = useOutputProfileStore((s) => s.mapping);

  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const activePresetId = useEqualizerStore((s) => s.activePresetId);
  const customPresets = useEqualizerStore((s) => s.customPresets);

  // Kategori terakhir yang DIKETAHUI (bukan "other"). null = belum ada
  // perangkat yang terbaca sejak hook mount (app start).
  const prevCategoryRef = useRef<OutputCategory | null>(null);

  // Kategori dari tipe perangkat — string, bukan objek: currentDevice
  // adalah objek BARU tiap tick poll 3 detik, jadi effect harus
  // bergantung pada kategori (string) supaya hanya jalan saat kategori
  // benar-benar berubah, bukan tiap poll.
  const category = categoryOfDeviceType(currentDevice?.type);

  useEffect(() => {
    // "other" = tidak ada info (null/unknown/hdmi/earpiece): abaikan
    // sepenuhnya — JANGAN menimpa kategori terakhir yang diketahui.
    if (category === "other") return;

    const prevCategory = prevCategoryRef.current;
    prevCategoryRef.current = category;

    const availablePresets = [...ALL_PRESETS, ...customPresets];
    const targetPresetId = resolveOutputPreset(
      mapping,
      category,
      availablePresets.map((p) => p.id),
    );

    if (
      !shouldAutoApplyOutputProfile({
        enabled,
        eqEnabled: isEQEnabled,
        prevCategory,
        nextCategory: category,
        targetPresetId,
        activePresetId,
      })
    ) {
      return;
    }

    // targetPresetId dijamin non-null oleh shouldAutoApplyOutputProfile.
    const presetName =
      presetNameById(availablePresets, targetPresetId) ?? targetPresetId;
    // Jalur yang sama seperti user mengetuk chip preset (aman — lihat
    // outputProfile.ts §4). Fire-and-forget: applyPreset sinkron
    // mengubah state; dorongan ke native di dalamnya sudah try/catch
    // sendiri (pola N23).
    useEqualizerStore.getState().applyPreset(targetPresetId as string);
    console.log(
      `[OutputProfile] Output berubah ke ${OUTPUT_CATEGORY_LABELS[category]} — preset ${presetName} diterapkan otomatis`,
    );
    useToastStore
      .getState()
      .showToast(
        `Output ${OUTPUT_CATEGORY_LABELS[category]} — preset ${presetName} diterapkan.`,
        "info",
      );
  }, [
    category,
    enabled,
    mapping,
    isEQEnabled,
    activePresetId,
    customPresets,
  ]);
};

export default useOutputProfiles;
