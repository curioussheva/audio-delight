import { useCallback, useMemo } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { ALL_PRESETS } from "@/features/equalizer/constants/presets";
import { isDspDisabledForMode } from "@/features/equalizer/api/modeInfo";

// Opsi 2 (log #16): persempit langganan layar EQ.
//
// Masalah yang ditemukan audit: `useEqualizer` lama mendestruktur
// `useEqualizerStore()` TANPA selector — satu langganan ke SELURUH store.
// Tiap `set()` store (tiap tick drag yang lolos throttle 100 ms)
// me-render ulang `EqualizerScreen` seutuhnya: fungsi layar ~1900 baris
// dieksekusi lagi, semua JSX dibangun ulang, dan semua anak yang
// memo-nya batal oleh closure inline ikut render ulang. Anak yang memo
// (Band, VerticalSlider, FrequencyGraph) memang menahan sebagian, tapi
// induknya sendiri + SectionToggle + PresetChip (bukan memo) + daftar
// band (renderItem inline) tidak tertahan.
//
// Perbaikan di file ini:
// 1. `useEqualizer` (kompat — dipakai settings.tsx) kini melanggan per
//    FIELD via selector, dan objek kembalian di-`useMemo` supaya
//    identitasnya stabil bila tidak ada nilai yang berubah.
// 2. Hook per SEKSI (`useEqMasterState`, `useEqGraphState`,
//    `useEqBandListState`, `useEqPresetState`, `useEqEffectsState`) —
//    tiap seksi layar melanggan HANYA potongan yang dibutuhkannya.
//    Tick widener hanya mengubah `virtualizerLevel`: seksi grafik,
//    band, dan preset tidak melanggan nilai itu, jadi tidak render ulang.
//    Bukti properti ini (referensi slice stabil di tiap setter) ada di
//    `src/__tests__/features/equalizer/eqSubscriptionNarrowing.test.ts`.
// 3. `useIsDSPDisabled` melanggan HANYA `audioMode` playerStore —
//    `usePlayerStore()` utuh di hook lama juga ikut me-render ulang
//    layar tiap perubahan playback (lagu, posisi, dsb.).
//
// Logika audio/DSP TIDAK berubah: guard bit-perfect/immersive,
// throttle, dan flush sama persis seperti sebelumnya.

/** Langganan sempit: hanya `audioMode` playerStore. */
export const useIsDSPDisabled = (): boolean => {
  const audioMode = usePlayerStore((s) => s.audioMode);
  return isDspDisabledForMode(audioMode);
};

// DUA mode mematikan mesin DSP, bukan satu.
//
// Mode Bit-Perfect melewati pemrosesan supaya output murni. Mode Immersive
// TIDAK memakai mesin DSP sama sekali - ia menjalankan rantai resonansinya
// sendiri (solfeggio, exciter, spatial, brainwave). Menyalakan EQ/bass/width
// di mode Immersive berarti kontrol di layar EQ mengaku mengubah suara,
// padahal yang memproses justru rangkaian lain. Karena itu keduanya beku.
//
// Satu-satunya mode yang menghidupkan mesin ini adalah `dsp`.

export const useEqualizer = () => {
  // Per FIELD, bukan `useEqualizerStore()` utuh: tiap selector hanya
  // membangunkan hook ini bila nilainya sendiri berubah. Aksi store
  // adalah referensi stabil (tidak pernah berganti identitas), jadi
  // memilihnya satu per satu juga tidak memicu render ulang.
  const isDSPDisabled = useIsDSPDisabled();

  const bands = useEqualizerStore((s) => s.bands);
  const activePresetId = useEqualizerStore((s) => s.activePresetId);
  const customPresets = useEqualizerStore((s) => s.customPresets);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isBassEnabled = useEqualizerStore((s) => s.isBassEnabled);
  const isVirtualizerEnabled = useEqualizerStore((s) => s.isVirtualizerEnabled);
  const isReverbEnabled = useEqualizerStore((s) => s.isReverbEnabled);
  const bassStrength = useEqualizerStore((s) => s.bassStrength);
  const virtualizerLevel = useEqualizerStore((s) => s.virtualizerLevel);
  const reverbPreset = useEqualizerStore((s) => s.reverbPreset);
  const masterGain = useEqualizerStore((s) => s.masterGain);

  const setBandGain = useEqualizerStore((s) => s.setBandGain);
  const applyPresetStore = useEqualizerStore((s) => s.applyPreset);
  const saveCustomPreset = useEqualizerStore((s) => s.saveCustomPreset);
  const deleteCustomPreset = useEqualizerStore((s) => s.deleteCustomPreset);
  const setBassBoostStore = useEqualizerStore((s) => s.setBassBoost);
  const setVirtualizerStore = useEqualizerStore((s) => s.setVirtualizer);
  const setReverbStore = useEqualizerStore((s) => s.setReverb);
  const setMasterGainStore = useEqualizerStore((s) => s.setMasterGain);
  const toggleEQStore = useEqualizerStore((s) => s.toggleEQ);
  const setBassEnabledStore = useEqualizerStore((s) => s.setBassEnabled);
  const setVirtualizerEnabledStore = useEqualizerStore(
    (s) => s.setVirtualizerEnabled,
  );
  const setReverbEnabledStore = useEqualizerStore((s) => s.setReverbEnabled);
  const resetToDefaultStore = useEqualizerStore((s) => s.resetToDefault);
  const flushBandDragStore = useEqualizerStore((s) => s.flushBandDrag);
  const flushBassBoostDragStore = useEqualizerStore(
    (s) => s.flushBassBoostDrag,
  );
  const flushVirtualizerDragStore = useEqualizerStore(
    (s) => s.flushVirtualizerDrag,
  );
  const flushMasterGainDragStore = useEqualizerStore(
    (s) => s.flushMasterGainDrag,
  );

  // --- Wrapper Actions dengan Guard Bit-Perfect ---

  const handleToggleEQ = useCallback(() => {
    if (isDSPDisabled) return;
    toggleEQStore();
  }, [isDSPDisabled, toggleEQStore]);

  const handleSetBassEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setBassEnabledStore(val);
    },
    [isDSPDisabled, setBassEnabledStore],
  );

  const handleSetVirtualizerEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setVirtualizerEnabledStore(val);
    },
    [isDSPDisabled, setVirtualizerEnabledStore],
  );

  const handleSetReverbEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setReverbEnabledStore(val);
    },
    [isDSPDisabled, setReverbEnabledStore],
  );

  const updateBandGain = useCallback(
    (index: number, gain: number) => {
      if (isDSPDisabled) return;
      setBandGain(index, gain);
    },
    [isDSPDisabled, setBandGain],
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      if (isDSPDisabled) return;
      applyPresetStore(presetId);
    },
    [isDSPDisabled, applyPresetStore],
  );

  const handleSetBass = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setBassBoostStore(val);
    },
    [isDSPDisabled, setBassBoostStore],
  );

  const handleSetVirtualizer = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setVirtualizerStore(val);
    },
    [isDSPDisabled, setVirtualizerStore],
  );

  const handleSetReverb = useCallback(
    (presetIdx: number) => {
      if (isDSPDisabled) return;
      setReverbStore(presetIdx);
    },
    [isDSPDisabled, setReverbStore],
  );

  const handleSetMasterGain = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setMasterGainStore(val);
    },
    [isDSPDisabled, setMasterGainStore],
  );

  const handleResetToDefault = useCallback(() => {
    if (isDSPDisabled) return;
    resetToDefaultStore();
  }, [isDSPDisabled, resetToDefaultStore]);

  // (Item 7) Flush nilai akhir drag saat release — guard DSP yang sama
  // seperti setter-nya: di bit-perfect / immersive tidak ada drag yang
  // bisa menaruh pending, jadi flush di sana no-op yang dilewati.
  const handleFlushBandDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBandDragStore();
  }, [isDSPDisabled, flushBandDragStore]);

  const handleFlushBassBoostDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBassBoostDragStore();
  }, [isDSPDisabled, flushBassBoostDragStore]);

  const handleFlushVirtualizerDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushVirtualizerDragStore();
  }, [isDSPDisabled, flushVirtualizerDragStore]);

  const handleFlushMasterGainDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushMasterGainDragStore();
  }, [isDSPDisabled, flushMasterGainDragStore]);

  const allPresets = useMemo(
    () => [...ALL_PRESETS, ...customPresets],
    [customPresets],
  );

  // Objek kembalian di-memo: identitas stabil bila tidak ada nilai yang
  // berubah — anak memo yang menerima `eq.*` tidak batal oleh objek baru
  // tiap render induk.
  return useMemo(
    () => ({
      // States
      isEQEnabled,
      isBassEnabled,
      isVirtualizerEnabled,
      isReverbEnabled,
      isDSPDisabled,
      currentBands: bands,
      activePresetId,
      allPresets,
      bassStrength,
      virtualizerLevel,
      reverbPreset,
      masterGain,

      // Actions
      toggleEQ: handleToggleEQ,
      setBassEnabled: handleSetBassEnabled,
      setVirtualizerEnabled: handleSetVirtualizerEnabled,
      setReverbEnabled: handleSetReverbEnabled,
      setMasterGain: handleSetMasterGain,
      updateBandGain,
      applyPreset: handleApplyPreset,
      savePreset: saveCustomPreset,
      deletePreset: deleteCustomPreset,
      setBassBoost: handleSetBass,
      setVirtualizer: handleSetVirtualizer,
      setReverb: handleSetReverb,
      resetToDefault: handleResetToDefault,
      // (Item 7) Flush saat drag dilepas.
      flushBandDrag: handleFlushBandDrag,
      flushBassBoostDrag: handleFlushBassBoostDrag,
      flushVirtualizerDrag: handleFlushVirtualizerDrag,
      flushMasterGainDrag: handleFlushMasterGainDrag,
    }),
    [
      isEQEnabled,
      isBassEnabled,
      isVirtualizerEnabled,
      isReverbEnabled,
      isDSPDisabled,
      bands,
      activePresetId,
      allPresets,
      bassStrength,
      virtualizerLevel,
      reverbPreset,
      masterGain,
      handleToggleEQ,
      handleSetBassEnabled,
      handleSetVirtualizerEnabled,
      handleSetReverbEnabled,
      handleSetMasterGain,
      updateBandGain,
      handleApplyPreset,
      saveCustomPreset,
      deleteCustomPreset,
      handleSetBass,
      handleSetVirtualizer,
      handleSetReverb,
      handleResetToDefault,
      handleFlushBandDrag,
      handleFlushBassBoostDrag,
      handleFlushVirtualizerDrag,
      handleFlushMasterGainDrag,
    ],
  );
};

// ─── Hook per seksi layar EQ (opsi 2) ─────────────────────────────────────
// Tiap hook melanggan HANYA potongan store yang dibutuhkan seksinya.
// Dipakai komponen seksi di equalizer.tsx (yang di-memo), supaya tick
// drag satu nilai tidak me-render ulang seksi lain. Guard DSP yang sama
// seperti `useEqualizer` (bit-perfect / immersive = beku).

/** Kartu sakelar utama: hanya `isEQEnabled` + gate + toggle. */
export const useEqMasterState = () => {
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const toggleEQStore = useEqualizerStore((s) => s.toggleEQ);
  const toggleEQ = useCallback(() => {
    if (isDSPDisabled) return;
    toggleEQStore();
  }, [isDSPDisabled, toggleEQStore]);
  return useMemo(
    () => ({ isEQEnabled, isDSPDisabled, toggleEQ }),
    [isEQEnabled, isDSPDisabled, toggleEQ],
  );
};

/**
 * Kartu grafik: kurva (`bands`), pill clip (`bassStrength` saat bass
 * menyala + `masterGain`), dan gate. TIDAK melanggan widener/reverb/
 * preset — tick ketiganya tidak menyentuh seksi ini.
 */
export const useEqGraphState = () => {
  const bands = useEqualizerStore((s) => s.bands);
  const isBassEnabled = useEqualizerStore((s) => s.isBassEnabled);
  const bassStrength = useEqualizerStore((s) => s.bassStrength);
  const masterGain = useEqualizerStore((s) => s.masterGain);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const setBandGain = useEqualizerStore((s) => s.setBandGain);
  const flushBandDragStore = useEqualizerStore((s) => s.flushBandDrag);
  const updateBandGain = useCallback(
    (index: number, gain: number) => {
      if (isDSPDisabled) return;
      setBandGain(index, gain);
    },
    [isDSPDisabled, setBandGain],
  );
  const flushBandDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBandDragStore();
  }, [isDSPDisabled, flushBandDragStore]);
  return useMemo(
    () => ({
      bands,
      isBassEnabled,
      bassStrength,
      masterGain,
      isEQEnabled,
      isDSPDisabled,
      updateBandGain,
      flushBandDrag,
    }),
    [
      bands,
      isBassEnabled,
      bassStrength,
      masterGain,
      isEQEnabled,
      isDSPDisabled,
      updateBandGain,
      flushBandDrag,
    ],
  );
};

/**
 * Seksi DETAIL BAND: hanya `bands` + gate + setter band. Tick slider
 * efek (bass/widener/gain/reverb) tidak mengubah `bands` — seksi ini
 * diam selama drag efek.
 */
export const useEqBandListState = () => {
  const bands = useEqualizerStore((s) => s.bands);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const setBandGain = useEqualizerStore((s) => s.setBandGain);
  const flushBandDragStore = useEqualizerStore((s) => s.flushBandDrag);
  const updateBandGain = useCallback(
    (index: number, gain: number) => {
      if (isDSPDisabled) return;
      setBandGain(index, gain);
    },
    [isDSPDisabled, setBandGain],
  );
  const flushBandDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBandDragStore();
  }, [isDSPDisabled, flushBandDragStore]);
  return useMemo(
    () => ({
      bands,
      isEQEnabled,
      isDSPDisabled,
      updateBandGain,
      flushBandDrag,
    }),
    [bands, isEQEnabled, isDSPDisabled, updateBandGain, flushBandDrag],
  );
};

/**
 * Seksi PROFIL SUARA: hanya daftar preset + preset aktif + gate.
 * Tick drag apa pun tidak mengubah ketiganya — seksi ini diam selama drag.
 */
export const useEqPresetState = () => {
  const customPresets = useEqualizerStore((s) => s.customPresets);
  const activePresetId = useEqualizerStore((s) => s.activePresetId);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const applyPresetStore = useEqualizerStore((s) => s.applyPreset);
  const applyPreset = useCallback(
    (presetId: string) => {
      if (isDSPDisabled) return;
      applyPresetStore(presetId);
    },
    [isDSPDisabled, applyPresetStore],
  );
  const allPresets = useMemo(
    () => [...ALL_PRESETS, ...customPresets],
    [customPresets],
  );
  return useMemo(
    () => ({
      allPresets,
      activePresetId,
      isEQEnabled,
      isDSPDisabled,
      applyPreset,
    }),
    [allPresets, activePresetId, isEQEnabled, isDSPDisabled, applyPreset],
  );
};

/**
 * Seksi EFEK (bass + widener + master gain + reverb + HRTF/convolver
 * di komponennya): keempat nilai efek + ketiga sakelar enable + gate.
 * Tick band TIDAK mengubah nilai-nilai ini — seksi efek diam selama
 * drag band/kurva. Sebaliknya tick widener hanya membangunkan seksi ini
 * (+ grafik bila pill clip ikut berubah — tidak, pill hanya pakai bass
 * + gain — jadi grafik pun diam saat widener digeser).
 */
export const useEqEffectsState = () => {
  const bassStrength = useEqualizerStore((s) => s.bassStrength);
  const virtualizerLevel = useEqualizerStore((s) => s.virtualizerLevel);
  const reverbPreset = useEqualizerStore((s) => s.reverbPreset);
  const masterGain = useEqualizerStore((s) => s.masterGain);
  const isBassEnabled = useEqualizerStore((s) => s.isBassEnabled);
  const isVirtualizerEnabled = useEqualizerStore((s) => s.isVirtualizerEnabled);
  const isReverbEnabled = useEqualizerStore((s) => s.isReverbEnabled);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const setBassEnabledStore = useEqualizerStore((s) => s.setBassEnabled);
  const setVirtualizerEnabledStore = useEqualizerStore(
    (s) => s.setVirtualizerEnabled,
  );
  const setReverbEnabledStore = useEqualizerStore((s) => s.setReverbEnabled);
  const setBassBoostStore = useEqualizerStore((s) => s.setBassBoost);
  const setVirtualizerStore = useEqualizerStore((s) => s.setVirtualizer);
  const setReverbStore = useEqualizerStore((s) => s.setReverb);
  const setMasterGainStore = useEqualizerStore((s) => s.setMasterGain);
  const flushBassBoostDragStore = useEqualizerStore(
    (s) => s.flushBassBoostDrag,
  );
  const flushVirtualizerDragStore = useEqualizerStore(
    (s) => s.flushVirtualizerDrag,
  );
  const flushMasterGainDragStore = useEqualizerStore(
    (s) => s.flushMasterGainDrag,
  );

  const setBassEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setBassEnabledStore(val);
    },
    [isDSPDisabled, setBassEnabledStore],
  );
  const setVirtualizerEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setVirtualizerEnabledStore(val);
    },
    [isDSPDisabled, setVirtualizerEnabledStore],
  );
  const setReverbEnabled = useCallback(
    (val: boolean) => {
      if (isDSPDisabled) return;
      setReverbEnabledStore(val);
    },
    [isDSPDisabled, setReverbEnabledStore],
  );
  const setBassBoost = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setBassBoostStore(val);
    },
    [isDSPDisabled, setBassBoostStore],
  );
  const setVirtualizer = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setVirtualizerStore(val);
    },
    [isDSPDisabled, setVirtualizerStore],
  );
  const setReverb = useCallback(
    (presetIdx: number) => {
      if (isDSPDisabled) return;
      setReverbStore(presetIdx);
    },
    [isDSPDisabled, setReverbStore],
  );
  const setMasterGain = useCallback(
    (val: number) => {
      if (isDSPDisabled) return;
      setMasterGainStore(val);
    },
    [isDSPDisabled, setMasterGainStore],
  );
  const flushBassBoostDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushBassBoostDragStore();
  }, [isDSPDisabled, flushBassBoostDragStore]);
  const flushVirtualizerDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushVirtualizerDragStore();
  }, [isDSPDisabled, flushVirtualizerDragStore]);
  const flushMasterGainDrag = useCallback(() => {
    if (isDSPDisabled) return;
    flushMasterGainDragStore();
  }, [isDSPDisabled, flushMasterGainDragStore]);

  return useMemo(
    () => ({
      bassStrength,
      virtualizerLevel,
      reverbPreset,
      masterGain,
      isBassEnabled,
      isVirtualizerEnabled,
      isReverbEnabled,
      isEQEnabled,
      isDSPDisabled,
      setBassEnabled,
      setVirtualizerEnabled,
      setReverbEnabled,
      setBassBoost,
      setVirtualizer,
      setReverb,
      setMasterGain,
      flushBassBoostDrag,
      flushVirtualizerDrag,
      flushMasterGainDrag,
    }),
    [
      bassStrength,
      virtualizerLevel,
      reverbPreset,
      masterGain,
      isBassEnabled,
      isVirtualizerEnabled,
      isReverbEnabled,
      isEQEnabled,
      isDSPDisabled,
      setBassEnabled,
      setVirtualizerEnabled,
      setReverbEnabled,
      setBassBoost,
      setVirtualizer,
      setReverb,
      setMasterGain,
      flushBassBoostDrag,
      flushVirtualizerDrag,
      flushMasterGainDrag,
    ],
  );
};
