// src/features/equalizer/store/equalizerStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
const Platform = require("react-native").Platform;
import { EqualizerStore, Preset } from "@/features/equalizer/types";
import { ALL_PRESETS, makeBands } from "../constants/presets";
import { audioEngine } from "@/features/player/api/engine";
import { NativeDSPModule } from "@/features/equalizer/api/nativeInterface";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// (B14-M-H2, 2026-11-14): rentang gain band UI adalah ±10 dB sejak
// d413d438. Preset bawaan aman (maks ±6), tapi custom preset yang
// disimpan sebelumnya bisa membawa ±12 — dan native mengizinkan sampai
// ±24. Clamp di semua titik baca (applyPreset, rehydrate, pengiriman ke
// native) supaya preset lama tidak berbunyi ±12 sementara fader berskala
// ±10 (thumb bisa render di luar trek).
const BAND_GAIN_MIN = -10;
const BAND_GAIN_MAX = 10;
const clampBandGain = (g: number): number =>
  Math.min(
    BAND_GAIN_MAX,
    Math.max(BAND_GAIN_MIN, Number.isFinite(g) ? g : 0),
  );
const clampPresetBands = (bands: any[]): any[] =>
  bands.map((b) => ({ ...b, gain: clampBandGain(b?.gain ?? 0) }));

const getCurrentSessionId = async (): Promise<number> => {
  try {
    if (!NativeDSPModule?.createAudioSession) {
      console.warn("[EQ Store] createAudioSession not available");
      return -1;
    }
    const result = await NativeDSPModule.createAudioSession();
    const sessionId = result?.sessionId ?? -1;
    if (sessionId > 0) {
      console.log(`[EQ Store] Got Session ID from native: ${sessionId}`);
      return sessionId;
    }
    return -1;
  } catch (error) {
    console.warn("[EQ Store] getCurrentSessionId failed:", error);
    return -1;
  }
};

// Helper untuk apply semua efek ke native dengan individual try-catch
const applyAllEffectsToNative = async (state: any) => {
  const { bands, isEQEnabled, audioSessionId } = state;

  if (!NativeDSPModule || !isEQEnabled) return false;

  // Gunakan ID yang sudah ada di state (yang dikirim dari playback.ts)
  // Jangan panggil TrackPlayer.getAudioSessionId() karena tidak tersedia
  let finalSessionId = audioSessionId;

  if (finalSessionId <= 0) {
    // Fallback terakhir: minta ke NativeModule kita untuk cari ID yang aktif
    const sessionResult = await NativeDSPModule.createAudioSession();
finalSessionId = sessionResult?.sessionId ?? 0;
  }

  if (finalSessionId <= 0) return false;

  try {
    // Ingat: Di Java, gains ini harus dikali 100
    // (B14-M-H2): clamp di corong ke native — state seharusnya sudah
    // ter-clamp (applyPreset/migrate), ini pertahanan terakhir supaya
    // tidak ada jalur yang mengirim gain di luar ±10.
    const gains = bands.map((b: any) => clampBandGain(b.gain));
    await NativeDSPModule.setFullEqualizer(gains, finalSessionId);
    console.log(`[DSP] Applied to Session: ${finalSessionId}`);
  } catch (e) {
    console.error("[EQ Store] Failed to apply:", e);
  }
  return true;
};

// ─────────────────────────────────────────────
// Store Implementation
// ─────────────────────────────────────────────

// J1-2 (Batch JS-1): throttle apply EQ ke native (leading + trailing, 100 ms).
// setBandGain dipanggil tiap tick drag — tanpa ini tiap tick = satu panggilan
// native yang mengantre di JS → bridge. State store tetap di-update langsung
// tiap tick (UI/graph responsif); hanya panggilan native yang dibatasi.
// Leading memberi feedback suara langsung di tick pertama; trailing memastikan
// nilai akhir selalu terkirim. Apply membaca bands TERKINI dari store, jadi
// tidak ada band yang hilang walau beberapa band berubah dalam satu jendela.
const EQ_APPLY_THROTTLE_MS = 100;
let _eqApplyLastAt = 0;
let _eqApplyTimer: ReturnType<typeof setTimeout> | null = null;

const applyEqThrottled = (
  get: () => {
    bands: { gain: number }[];
    isEQEnabled: boolean;
    audioSessionId: number;
  },
) => {
  const fire = () => {
    _eqApplyLastAt = Date.now();
    _eqApplyTimer = null;
    const { bands, isEQEnabled, audioSessionId } = get();
    if (
      !isEQEnabled ||
      audioSessionId === -1 ||
      !NativeDSPModule?.setFullEqualizer
    )
      return;
    const gains = bands.map((b) => Math.min(10, Math.max(-10, b.gain)));
    void NativeDSPModule.setFullEqualizer(gains, audioSessionId);
  };
  const now = Date.now();
  if (now - _eqApplyLastAt >= EQ_APPLY_THROTTLE_MS) {
    if (_eqApplyTimer) {
      clearTimeout(_eqApplyTimer);
      _eqApplyTimer = null;
    }
    fire();
  } else if (!_eqApplyTimer) {
    _eqApplyTimer = setTimeout(
      fire,
      EQ_APPLY_THROTTLE_MS - (now - _eqApplyLastAt),
    );
  }
};

// Fix G: throttle update STORE di setBandGain (leading + trailing, 100 ms),
// pola sama seperti J1-2 di atas. Tiap tick drag sebelumnya = satu set() =
// satu re-render semua subscriber store + satu redraw grafik Skia.
// Leading: tick pertama langsung masuk store (UI responsif). Tick dalam
// jendela digabung: hanya snapshot bands TERBARU yang disimpan sebagai
// pending, lalu trailing flush paling lambat 100 ms kemudian. Pending
// dihitung dari snapshot pending (bukan get().bands) supaya perubahan band
// lain dalam jendela yang sama tidak hilang. Throttle ini HANYA menutup
// set() — applyEqThrottled (J1-2) tetap dipanggil tiap tick seperti semula,
// jadi perilaku native apply tidak berubah.
const EQ_STORE_THROTTLE_MS = 100;
let _eqStoreLastAt = 0;
let _eqStoreTimer: ReturnType<typeof setTimeout> | null = null;
let _eqStorePendingBands: any[] | null = null;

// Batalkan update store yang masih tertunda (pending trailing flush).
// Dipanggil aksi yang mengganti bands secara wholesale (preset, reset,
// setBandsGain) supaya flush basi tidak menimpa bands baru mereka.
const cancelPendingStoreUpdate = () => {
  if (_eqStoreTimer) {
    clearTimeout(_eqStoreTimer);
    _eqStoreTimer = null;
  }
  _eqStorePendingBands = null;
};

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      activePresetId: "flat",
      isEQEnabled: false,
      isBassEnabled: true,
      isVirtualizerEnabled: true,
      isReverbEnabled: true,
      customPresets: [],
      bassStrength: 0,
      reverbPreset: 0,
      virtualizerLevel: 0,
      audioSessionId: -1,
      isInitialized: false,

      // --- Actions ---

      initialize: async () => {
        if (get().isInitialized) return;
        console.log("[EQ Store] Initializing...");

        if (Platform.OS !== "android") {
          set({ isInitialized: true });
          return;
        }

        try {
          const sessionId = await getCurrentSessionId();
          set({ audioSessionId: sessionId, isInitialized: true });

          if (get().isEQEnabled && sessionId !== -1) {
            await applyAllEffectsToNative(get());
          }
        } catch (error) {
          set({ isInitialized: true });
        }
      },

      setAudioSessionId: (id: number) => {
        set({ audioSessionId: id });
        if (get().isEQEnabled && id !== -1) {
          applyAllEffectsToNative(get());
        }
      },

      toggleEQ: async () => {
        const newState = !get().isEQEnabled;
        await get().setEQEnabled(newState);
      },

      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        if (enabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get());
        } else if (!enabled && NativeDSPModule?.releaseAllFX) {
          await NativeDSPModule.releaseAllFX();
        }
      },

      // --- Individual Switch Actions ---

      setBassEnabled: async (enabled: boolean) => {
        set({ isBassEnabled: enabled });
        const { isEQEnabled, audioSessionId, bassStrength } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setBassBoost(
            enabled ? bassStrength : 0,
            audioSessionId,
          );
        }
      },

      setVirtualizerEnabled: async (enabled: boolean) => {
        set({ isVirtualizerEnabled: enabled });
        const { isEQEnabled, audioSessionId, virtualizerLevel } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setVirtualizer(
            enabled ? virtualizerLevel : 0,
            audioSessionId,
          );
        }
      },

      setReverbEnabled: async (enabled: boolean) => {
        set({ isReverbEnabled: enabled });
        const { isEQEnabled, audioSessionId, reverbPreset } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setReverbPreset(
            enabled ? reverbPreset : 0,
            audioSessionId,
          );
        }
      },

      // --- Value Adjustment Actions ---

      setBassBoost: async (strength: number) => {
        const clamped = Math.min(1000, Math.max(0, strength));
        set({ bassStrength: clamped });
        const { isEQEnabled, isBassEnabled, audioSessionId } = get();
        if (isEQEnabled && isBassEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setBassBoost(clamped, audioSessionId);
        }
      },

      setVirtualizer: async (level: number) => {
        const clamped = Math.min(1000, Math.max(0, level));
        set({ virtualizerLevel: clamped });
        const { isEQEnabled, isVirtualizerEnabled, audioSessionId } = get();
        if (isEQEnabled && isVirtualizerEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setVirtualizer(clamped, audioSessionId);
        }
      },

      setReverb: async (preset: number) => {
        const clamped = Math.min(6, Math.max(0, preset));
        set({ reverbPreset: clamped });
        const { isEQEnabled, isReverbEnabled, audioSessionId } = get();
        if (isEQEnabled && isReverbEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setReverbPreset(clamped, audioSessionId);
        }
      },

      setBandGain: (index: number, gain: number) => {
  const clampedGain = Math.min(10, Math.max(-10, gain));
  // Fix G: jangan set() tiap tick drag — throttle store (leading +
  // trailing, 100 ms). Snapshot dihitung dari pending bila ada, supaya
  // perubahan band lain dalam jendela yang sama tidak tertimpa.
  const baseBands = _eqStorePendingBands ?? get().bands;
  const newBands = baseBands.map((b, i) =>
    i === index ? { ...b, gain: clampedGain } : b,
  );
  const now = Date.now();
  if (now - _eqStoreLastAt >= EQ_STORE_THROTTLE_MS) {
    if (_eqStoreTimer) {
      clearTimeout(_eqStoreTimer);
      _eqStoreTimer = null;
    }
    _eqStorePendingBands = null;
    _eqStoreLastAt = now;
    set({ bands: newBands, activePresetId: "custom" });
  } else {
    _eqStorePendingBands = newBands;
    if (!_eqStoreTimer) {
      _eqStoreTimer = setTimeout(() => {
        _eqStoreLastAt = Date.now();
        _eqStoreTimer = null;
        const pending = _eqStorePendingBands;
        _eqStorePendingBands = null;
        if (pending) set({ bands: pending, activePresetId: "custom" });
      }, EQ_STORE_THROTTLE_MS - (now - _eqStoreLastAt));
    }
  }

  // J1-2: jangan kirim tiap tick drag ke native — throttle (leading +
  // trailing) via apply penuh. Dipanggil tiap tick seperti semula; apply
  // membaca bands TERKINI dari store saat fire, jadi nilai akhir selalu
  // terkirim walau store update-nya digabung.
  applyEqThrottled(get);
},

      setBandsGain: async (gains: number[]) => {
        // Fix G: batalkan trailing flush setBandGain yang masih tertunda —
        // bands baru dari aksi ini yang berlaku, bukan snapshot drag basi.
        cancelPendingStoreUpdate();
        // Clamp dipakai untuk state DAN yang dikirim ke native (dulu
        // native menerima gains mentah tanpa clamp).
        const clampedGains = gains.map((g) => Math.min(10, Math.max(-10, g)));
        const newBands = get().bands.map((b, i) => ({
          ...b,
          gain: clampedGains[i] ?? b.gain,
        }));
        set({ bands: newBands, activePresetId: "custom" });

        if (
          get().isEQEnabled &&
          get().audioSessionId !== -1 &&
          NativeDSPModule?.setFullEqualizer
        ) {
          await NativeDSPModule.setFullEqualizer(clampedGains, get().audioSessionId);
        }
      },

      applyPreset: (presetId: string) => {
        const preset =
          ALL_PRESETS.find((p) => p.id === presetId) ||
          get().customPresets.find((p) => p.id === presetId);
        if (preset) {
          // Fix G: batalkan trailing flush setBandGain yang masih tertunda.
          cancelPendingStoreUpdate();
          // (B14-M-H2): jangan salin verbatim — preset lama (custom,
          // tersimpan sebelum ±10 dB) bisa membawa gain ±12.
          const newBands = clampPresetBands(preset.bands);
          set({ activePresetId: presetId, bands: newBands });
          // D1: preset adalah PROFIL penuh, bukan kurva saja — terapkan
          // efek bila preset mendefinisikannya. undefined = biarkan nilai
          // saat ini (preset bawaan yang EQ-only tidak me-reset efek).
          if (preset.bassBoost !== undefined)
            void get().setBassBoost(preset.bassBoost);
          if (preset.virtualizer !== undefined)
            void get().setVirtualizer(preset.virtualizer);
          if (preset.reverb !== undefined)
            void get().setReverb(preset.reverb);
          if (get().isEQEnabled && get().audioSessionId !== -1) {
            applyAllEffectsToNative(get());
          }
        }
      },

      saveCustomPreset: (name: string) => {
        const newPreset: Preset = {
          id: `custom_${Date.now()}`,
          name,
          isCustom: true,
          bands: JSON.parse(JSON.stringify(get().bands)),
          // D1: simpan racikan lengkap, bukan kurva saja.
          bassBoost: get().bassStrength,
          virtualizer: get().virtualizerLevel,
          reverb: get().reverbPreset,
        };
        set({
          customPresets: [...get().customPresets, newPreset],
          activePresetId: newPreset.id,
        });
      },

      deleteCustomPreset: (id: string) => {
        const filtered = get().customPresets.filter((p) => p.id !== id);
        set({ customPresets: filtered });
        if (get().activePresetId === id) get().applyPreset("flat");
      },

      resetToDefault: async () => {
        // Fix G: batalkan trailing flush setBandGain yang masih tertunda.
        cancelPendingStoreUpdate();
        set({
          bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          activePresetId: "flat",
          bassStrength: 0,
          virtualizerLevel: 0,
          reverbPreset: 0,
        });
        if (get().isEQEnabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get());
        }
      },
    }),
    {
      name: "equalizer-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // (B14-M-H2): version 1 = clamp gain band ke ±10 saat rehydrate.
      // State tersimpan lama (version 0 / tanpa version) bisa membawa
      // bands + customPresets ±12; migrate jalan sekali untuk state itu.
      // Preset bawaan maks ±6 — tidak berubah.
      version: 1,
      migrate: (persistedState: any, _version: number) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }
        const s = { ...persistedState };
        if (Array.isArray(s.bands)) {
          s.bands = clampPresetBands(s.bands);
        }
        if (Array.isArray(s.customPresets)) {
          s.customPresets = s.customPresets.map((p: any) => ({
            ...p,
            bands: Array.isArray(p?.bands)
              ? clampPresetBands(p.bands)
              : p?.bands,
          }));
        }
        return s;
      },
      partialize: (state) => ({
        bands: state.bands,
        activePresetId: state.activePresetId,
        customPresets: state.customPresets,
        bassStrength: state.bassStrength,
        virtualizerLevel: state.virtualizerLevel,
        reverbPreset: state.reverbPreset,
        isEQEnabled: state.isEQEnabled,
        isBassEnabled: state.isBassEnabled,
        isVirtualizerEnabled: state.isVirtualizerEnabled,
        isReverbEnabled: state.isReverbEnabled,
      }),
    },
  ),
);

if (require("react-native").Platform.OS === "android") {
  setTimeout(() => {
    useEqualizerStore.getState().initialize();
  }, 1000);
}
