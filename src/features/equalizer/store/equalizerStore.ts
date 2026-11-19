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

// Master gain (2026-11-19): rentang slider 0..1.5 linear (1.0 = netral,
// 0 = senyap, 1.5 = +3.52 dB). Dipilih DI DALAM clamp native AudioState
// (0..4, fallback 1.0) — bukan di batasnya: boost 1.5x masih bisa
// ditahan limiter yang duduk sesudah GainNode di rantai, sementara 4x
// (+12 dB) akan memaksa limiter bekerja terus-menerus. Slider tampil
// ×1.00; nilai yang dikirim ke native = nilai linear yang sama (tanpa
// konversi dB — GainNode mengalikan langsung). BUKAN bagian profil
// preset: preset menyimpan kurva + bass/widener/reverb (D1), tapi gain
// adalah level output global — preset tidak boleh menarik volume.
const MASTER_GAIN_MIN = 0;
const MASTER_GAIN_MAX = 1.5;
const MASTER_GAIN_DEFAULT = 1.0;
const clampMasterGain = (g: number): number =>
  Math.min(
    MASTER_GAIN_MAX,
    Math.max(MASTER_GAIN_MIN, Number.isFinite(g) ? g : MASTER_GAIN_DEFAULT),
  );

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
// N4: fungsi ini bernama "AllEffects" tapi dulu HANYA mengirim gain 10
// band — matikan EQ lalu nyalakan lagi (atau ganti session): store masih
// menyimpan bassStrength/virtualizerLevel/reverbPreset > 0 dan UI
// menampilkannya aktif, tapi native tidak pernah menerima ketiganya.
// Sekarang keempat efek dikirim (EQ + bass + virtualizer + reverb),
// masing-masing try/catch sendiri supaya satu efek yang gagal tidak
// membatalkan yang lain. Nilai 0 dikirim bila sakelar efeknya OFF.
// (service.ts lama yang berisi applyAllSettings SUDAH DIHAPUS atas
// putusan csheva — logika restore-nya ditulis ulang di sini, file itu
// tidak dikembalikan. Jeda 300 ms dari applyAllSettings lama TIDAK
// ikut dibawa: jalur live ini tidak pernah memilikinya.)
// `trigger` dicetak di log "[DSP] Applied" supaya tes N4 bisa dibuktikan
// dari logcat (follow-up logcat 06:25/06:52/08:06: "[DSP] Applied" muncul
// 2×/5×/4× tanpa pemicu yang diketahui). Murni log — tanpa trigger pun
// perilakunya sama.
const applyAllEffectsToNative = async (state: any, trigger = "unknown") => {
  const {
    bands,
    isEQEnabled,
    isBassEnabled,
    isVirtualizerEnabled,
    isReverbEnabled,
    bassStrength,
    virtualizerLevel,
    reverbPreset,
    masterGain,
    audioSessionId,
    activePresetId,
  } = state;

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

  // Ingat: Di Java, gains ini harus dikali 100
  // (B14-M-H2): clamp di corong ke native — state seharusnya sudah
  // ter-clamp (applyPreset/migrate), ini pertahanan terakhir supaya
  // tidak ada jalur yang mengirim gain di luar ±10.
  const gains = bands.map((b: any) => clampBandGain(b.gain));
  // Clamp efek juga di corong (state lama bisa membawa nilai di luar
  // rentang setter): bass/virtualizer 0..1000, reverb 0..6.
  const bass = isBassEnabled
    ? Math.min(1000, Math.max(0, bassStrength ?? 0))
    : 0;
  const virtualizer = isVirtualizerEnabled
    ? Math.min(1000, Math.max(0, virtualizerLevel ?? 0))
    : 0;
  const reverb = isReverbEnabled
    ? Math.min(6, Math.max(0, reverbPreset ?? 0))
    : 0;
  // Master gain: nilai linear 0..1.5 (1.0 netral). TIDAK digate sakelar
  // efek — gain bukan efek yang bisa OFF; 0 = senyap. Yang di-gate
  // hanya pengiriman ke native (isEQEnabled di atas): rantai DSP yang
  // membawa GainNode hanya hidup di mode DSP saat EQ menyala.
  const gain = clampMasterGain(masterGain ?? MASTER_GAIN_DEFAULT);

  const effects: Array<[string, () => Promise<unknown>]> = [
    ["setFullEqualizer", () => NativeDSPModule.setFullEqualizer(gains, finalSessionId)],
    ["setBassBoost", () => NativeDSPModule.setBassBoost(bass, finalSessionId)],
    ["setVirtualizer", () => NativeDSPModule.setVirtualizer(virtualizer, finalSessionId)],
    // Reverb (2026-11-19): engine beneran ada di C++ (ReverbNode
    // Freeverb) — restore ini benar-benar mengubah suara. Preset 0 =
    // tanpa reverb.
    ["setReverbPreset", () => NativeDSPModule.setReverbPreset(reverb, finalSessionId)],
    // Master gain: panggilan native sinkron (void, tanpa sessionId —
    // engine global, F7) jadi dibungkus supaya masuk Promise.all yang
    // sama. `?.()` supaya JS lama tetap jalan lawan modul native yang
    // belum punya metode ini (mirip guard `?.setFullEqualizer` di
    // applyEqThrottled); tanpa itu TypeError membuat apply gagal total.
    ["setMasterGain", async () => NativeDSPModule?.setMasterGain?.(gain)],
  ];
  // Diagnostik (verifikasi 2nd opinion, 2026-11-19): ukur durasi apply —
  // timing log membuktikan/membantah dugaan "apply DSP lambat/berat" dari
  // logcat berikutnya. Murni log; urutan/perilaku tidak berubah, tanpa
  // debounce (debounce TIDAK diputuskan).
  // Nilai efek dicetak juga (follow-up logcat 14:47, 2026-11-19): 5× apply
  // membuktikan jalur restore jalan, tapi NOL log nilai efek sehingga N4
  // (bass/widener > 0 saat toggle?) tetap tidak bisa dibuktikan dari logcat.
  // Nilai yang dicetak adalah nilai TERKIRIM ke native (sudah di-clamp;
  // 0 bila sakelar efeknya OFF) + activePresetId — jadi logcat berikutnya
  // menjawab N4 langsung.
  const applyStartedAt = performance.now();
  const results = await Promise.all(
    effects.map(async ([name, apply]) => {
      const startedAt = performance.now();
      try {
        await apply();
        return { ok: true, name, ms: performance.now() - startedAt };
      } catch (e) {
        console.error(`[EQ Store] Failed to apply ${name}:`, e);
        return { ok: false, name, ms: performance.now() - startedAt };
      }
    }),
  );
  const totalMs = performance.now() - applyStartedAt;
  const perEffect = results
    .map((r) => `${r.name}:${Math.round(r.ms)}ms`)
    .join(" ");
  console.log(
    `[DSP] Applied to Session: ${finalSessionId} (trigger: ${trigger}) in ${Math.round(totalMs)}ms (${perEffect}) preset=${activePresetId ?? "?"} bass=${bass} widener=${virtualizer} reverb=${reverb} gain=${gain.toFixed(2)} gains=[${gains.join(",")}]`,
  );
  return results.every((r) => r.ok);
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
    // N24: apply membaca snapshot PENDING store bila ada, bukan hanya
    // get().bands. Dua throttle (store + apply, masing-masing ~100 ms)
    // dihitung dari lastAt yang berbeda dan bisa meleset beberapa ms —
    // bila timer apply menang dari timer flush store, get().bands masih
    // berisi bands pra-drag dan tidak ada apply susulan (apply hanya
    // dipicu tick drag). Pending adalah snapshot bands TERBARU dari
    // setBandGain, jadi nilai akhir selalu terkirim walau flush store
    // belum jalan. (Flush store yang datang sesudahnya menulis bands
    // yang sama persis, jadi tidak ada apply yang hilang.)
    const { bands: storedBands, isEQEnabled, audioSessionId } = get();
    const bands = _eqStorePendingBands ?? storedBands;
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

// N29: counter penambah keunikan id preset custom (lihat saveCustomPreset).
let _customPresetSeq = 0;

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
      masterGain: MASTER_GAIN_DEFAULT,
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
            await applyAllEffectsToNative(get(), "initialize");
          }
        } catch (error) {
          set({ isInitialized: true });
        }
      },

      setAudioSessionId: (id: number) => {
        set({ audioSessionId: id });
        if (get().isEQEnabled && id !== -1) {
          applyAllEffectsToNative(get(), "setAudioSessionId");
        }
      },

      toggleEQ: async () => {
        const newState = !get().isEQEnabled;
        await get().setEQEnabled(newState);
      },

      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        if (enabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get(), "setEQEnabled");
        } else if (!enabled && NativeDSPModule?.releaseAllFX) {
          await NativeDSPModule.releaseAllFX();
        }
      },

      // --- Individual Switch Actions ---

      // N23: panggilan native dibungkus try/catch — setter ini dipanggil
      // fire-and-forget dari useEqualizer/slider, jadi rejection bridge
      // (session belum siap, modul belum load) dulu jadi unhandled
      // rejection. State tetap disimpan (niat user); yang gagal hanya
      // dorongan ke native, dicatat di log.
      setBassEnabled: async (enabled: boolean) => {
        set({ isBassEnabled: enabled });
        const { isEQEnabled, audioSessionId, bassStrength } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setBassBoost(
              enabled ? bassStrength : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setBassBoost gagal:", e);
          }
        }
      },

      setVirtualizerEnabled: async (enabled: boolean) => {
        set({ isVirtualizerEnabled: enabled });
        const { isEQEnabled, audioSessionId, virtualizerLevel } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setVirtualizer(
              enabled ? virtualizerLevel : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setVirtualizer gagal:", e);
          }
        }
      },

      setReverbEnabled: async (enabled: boolean) => {
        set({ isReverbEnabled: enabled });
        const { isEQEnabled, audioSessionId, reverbPreset } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setReverbPreset(
              enabled ? reverbPreset : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setReverbPreset gagal:", e);
          }
        }
      },

      // --- Value Adjustment Actions ---

      setBassBoost: async (strength: number) => {
        const clamped = Math.min(1000, Math.max(0, strength));
        set({ bassStrength: clamped });
        const { isEQEnabled, isBassEnabled, audioSessionId } = get();
        if (isEQEnabled && isBassEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setBassBoost(clamped, audioSessionId);
          } catch (e) {
            console.error("[EQ Store] setBassBoost gagal:", e);
          }
        }
      },

      setVirtualizer: async (level: number) => {
        const clamped = Math.min(1000, Math.max(0, level));
        set({ virtualizerLevel: clamped });
        const { isEQEnabled, isVirtualizerEnabled, audioSessionId } = get();
        if (isEQEnabled && isVirtualizerEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setVirtualizer(clamped, audioSessionId);
          } catch (e) {
            console.error("[EQ Store] setVirtualizer gagal:", e);
          }
        }
      },

      // Master gain (2026-11-19): mesin native-nya SUDAH lengkap sejak
      // lama (spec setMasterGain -> Kotlin -> JNI -> AudioEngine ->
      // AudioState clamp 0..4 -> GainNode di DSPChain), tapi NOL
      // pemanggil di src/ — slider ini yang pertama. Tanpa sessionId:
      // gain itu global engine (F7), bukan per-sesi, jadi yang di-gate
      // hanya isEQEnabled (mirip bass/widener, minus cek session).
      // State selalu disimpan (niat user); dorongan ke native yang gagal
      // hanya dicatat (pola N23). Tidak masuk profil preset (lihat
      // komentar MASTER_GAIN_* di atas).
      setMasterGain: async (gain: number) => {
        const clamped = clampMasterGain(gain);
        set({ masterGain: clamped });
        if (get().isEQEnabled) {
          try {
            NativeDSPModule?.setMasterGain?.(clamped);
          } catch (e) {
            console.error("[EQ Store] setMasterGain gagal:", e);
          }
        }
      },

      setReverb: async (preset: number) => {
        const clamped = Math.min(6, Math.max(0, preset));
        set({ reverbPreset: clamped });
        const { isEQEnabled, isReverbEnabled, audioSessionId } = get();
        if (isEQEnabled && isReverbEnabled && audioSessionId !== -1) {
          try {
            await NativeDSPModule.setReverbPreset(clamped, audioSessionId);
          } catch (e) {
            console.error("[EQ Store] setReverbPreset gagal:", e);
          }
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
  // membaca snapshot PENDING store bila ada (N24), jadi nilai akhir
  // selalu terkirim walau flush store belum jalan saat timer apply fire.
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
            applyAllEffectsToNative(get(), "applyPreset");
          }
        }
      },

      saveCustomPreset: (name: string) => {
        // N29: id dulu `custom_${Date.now()}` — dua save dalam 1 ms
        // menghasilkan ID identik; deleteCustomPreset (filter by id)
        // menghapus keduanya sekaligus dan applyPreset menemukan yang
        // pertama saja. Tambah counter proses + cek tabrakan dengan id
        // yang sudah ada (pengaman bila jam mundur / id lama tersimpan).
        let id = `custom_${Date.now()}_${++_customPresetSeq}`;
        while (get().customPresets.some((p) => p.id === id)) {
          id = `custom_${Date.now()}_${++_customPresetSeq}`;
        }
        const newPreset: Preset = {
          id,
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
          masterGain: MASTER_GAIN_DEFAULT,
        });
        if (get().isEQEnabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get(), "resetToDefault");
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
        masterGain: state.masterGain,
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
