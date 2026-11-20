// src/features/convolver/store/convolverStore.ts
//
// State convolver / impulse response loader — store DEDIKASI dengan
// kunci persist sendiri ("convolver-storage"), DI LUAR preset EQ
// (keputusan yang sama dengan HRTF 2026-11-19): preset tidak pernah
// membaca/menulis flag ini; applyPreset tidak menyentuhnya.
//
// Pola mengikuti hrtfStore: NativeDSPModule diimpor langsung dari
// spec, dorongan ke native tanpa gate isEQEnabled — toggle convolver
// sendiri yang mengaturnya. Pemulihan saat app start / ganti session
// lewat applyAllEffectsToNative di equalizerStore (yang memanggil
// restoreToNative di sini).
//
// Satu IR aktif dalam satu waktu. File IR disalin ke
// documentDirectory/convolver/ (lihat api/irFile) supaya path yang
// dipersist tetap valid sesudah restart — native TIDAK menyimpan IR
// (ia hilang saat engine mati), jadi restoreToNative memuat ulang
// dari file setiap kali applyAllEffectsToNative jalan.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NativeDSPModule, {
  ConvolverIrStatus,
} from "@/specs/NativeDSPModule";
import {
  pickIrFile,
  saveIrFile,
  deleteIrFile,
  convolverIrErrorMessage,
} from "../api/irFile";
import type { ConvolverIrMeta } from "../api/irFile";

export interface ConvolverStore {
  /** Convolver menyala. Default OFF. */
  isConvolverEnabled: boolean;
  /** IR yang dimuat (null = belum ada). */
  ir: ConvolverIrMeta | null;
  /** Pesan error load terakhir (null = tidak ada / sudah sukses). */
  lastError: string | null;
  /** Simpan niat user + dorong ke native (pola N23: gagal -> log saja). */
  setConvolverEnabled: (enabled: boolean) => Promise<void>;
  /**
   * Pilih file IR (.wav) -> salin persisten -> muat ke native.
   * Return ok=false + canceled=true bila user membatalkan picker
   * (bukan error); ok=false + error bila load gagal.
   */
  loadIr: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    error?: string;
  }>;
  /** Hapus IR dari native + hapus file + bersihkan state. */
  clearIr: () => Promise<void>;
  /**
   * Pulihkan IR + toggle ke native sesudah restart / ganti session.
   * Dipakai applyAllEffectsToNative: muat ulang dari file yang
   * dipersist (native melupakan IR saat engine mati), lalu dorong
   * toggle. File hilang = IR dibersihkan dari state (bukan error
   * yang dilempar — restore tidak boleh menggagalkan apply lain).
   */
  restoreToNative: () => Promise<void>;
  /**
   * Muat ulang IR dari file yang dipersist ke native, TANPA menyentuh
   * toggle. (2026-11-20, fix logcat #9): separuh pertama
   * `restoreToNative`, dipakai jalur batch `applyDspEffects` — batch
   * itu sendiri yang mendorong toggle (convolverEnabled), jadi load
   * dan toggle tidak lagi butuh dua panggilan native terpisah.
   * Tanpa IR tersimpan = no-op. Tidak pernah melempar (file hilang =
   * IR dibersihkan dari state, sama seperti restoreToNative).
   */
  preloadConvolverIr: () => Promise<void>;
}

export const useConvolverStore = create<ConvolverStore>()(
  persist(
    (set, get) => ({
      isConvolverEnabled: false,
      ir: null,
      lastError: null,

      setConvolverEnabled: async (enabled: boolean) => {
        set({ isConvolverEnabled: enabled });
        try {
          const { sessionId } = await NativeDSPModule.createAudioSession();
          if (sessionId !== -1) {
            await NativeDSPModule.setConvolverEnabled(enabled, sessionId);
          }
        } catch (e) {
          console.error("[Convolver Store] setConvolverEnabled gagal:", e);
        }
      },

      loadIr: async () => {
        let picked: Awaited<ReturnType<typeof pickIrFile>>;
        try {
          picked = await pickIrFile();
        } catch (e) {
          const error = "Gagal membuka pemilih file.";
          set({ lastError: error });
          console.error("[Convolver Store] pickIrFile gagal:", e);
          return { ok: false, error };
        }
        if (!picked) {
          return { ok: false, canceled: true };
        }

        let destPath: string;
        try {
          destPath = await saveIrFile(picked.uri, picked.name);
        } catch (e) {
          const error = "Gagal menyimpan file IR.";
          set({ lastError: error });
          console.error("[Convolver Store] saveIrFile gagal:", e);
          return { ok: false, error };
        }

        let status: number;
        try {
          status = await NativeDSPModule.loadConvolverIr(destPath);
        } catch (e) {
          await deleteIrFile(destPath);
          const error = "Gagal memuat IR ke engine.";
          set({ lastError: error });
          console.error("[Convolver Store] loadConvolverIr gagal:", e);
          return { ok: false, error };
        }
        if (status !== ConvolverIrStatus.Ok) {
          await deleteIrFile(destPath);
          const error = convolverIrErrorMessage(status);
          set({ lastError: error });
          return { ok: false, error };
        }

        let info: Awaited<
          ReturnType<typeof NativeDSPModule.getConvolverIrInfo>
        >;
        try {
          info = await NativeDSPModule.getConvolverIrInfo();
        } catch (e) {
          await deleteIrFile(destPath);
          const error = "Gagal membaca info IR.";
          set({ lastError: error });
          console.error("[Convolver Store] getConvolverIrInfo gagal:", e);
          return { ok: false, error };
        }

        // Sukses: hapus file IR lama (bila beda path), lalu simpan meta.
        const oldPath = get().ir?.path;
        if (oldPath && oldPath !== destPath) {
          await deleteIrFile(oldPath);
        }
        set({
          ir: {
            name: picked.name,
            path: destPath,
            sampleRateHz: info.sampleRateHz,
            taps: info.taps,
            durationMs: info.durationMs,
          },
          lastError: null,
        });
        return { ok: true };
      },

      clearIr: async () => {
        const oldPath = get().ir?.path;
        try {
          await NativeDSPModule.clearConvolverIr();
        } catch (e) {
          console.error("[Convolver Store] clearConvolverIr gagal:", e);
        }
        if (oldPath) {
          await deleteIrFile(oldPath);
        }
        set({ ir: null, lastError: null });
      },

      preloadConvolverIr: async () => {
        const { ir } = get();
        if (ir?.path) {
          try {
            const status = await NativeDSPModule.loadConvolverIr(ir.path);
            if (status !== ConvolverIrStatus.Ok) {
              // File hilang / rusak sesudah restart: bersihkan state
              // supaya UI tidak mengklaim IR yang tidak ada.
              console.error(
                "[Convolver Store] restore load gagal, status=",
                status,
              );
              set({ ir: null });
            }
          } catch (e) {
            console.error("[Convolver Store] restore load gagal:", e);
            set({ ir: null });
          }
        }
      },

      restoreToNative: async () => {
        const { isConvolverEnabled } = get();
        await get().preloadConvolverIr();
        try {
          const { sessionId } = await NativeDSPModule.createAudioSession();
          if (sessionId !== -1) {
            await NativeDSPModule.setConvolverEnabled(
              isConvolverEnabled,
              sessionId,
            );
          }
        } catch (e) {
          console.error("[Convolver Store] restore toggle gagal:", e);
        }
      },
    }),
    {
      name: "convolver-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({
        isConvolverEnabled: state.isConvolverEnabled,
        ir: state.ir,
        lastError: state.lastError,
      }),
    },
  ),
);

export default useConvolverStore;
