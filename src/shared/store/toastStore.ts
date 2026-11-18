// src/shared/store/toastStore.ts
//
// Toast global store-driven (Fase 2 redesign) — dibangun di fase ini
// sebagai komponen + store; pengaktifan penuh di Fase 4 (jangan rewire
// semua feedback sekarang). Satu toast dalam satu waktu; show() baru
// menggantikan yang lama. Durasi tampil diatur komponen (3500 ms,
// sama dengan AudioPropertyToast), bukan store — store tetap murni
// dan bisa diuji jest.
//
// Keputusan: toast untuk info/sukses (dan galat sebagai umpan balik,
// bukan konfirmasi). Aksi destruktif TIDAK lewat toast — tetap lewat
// ConfirmDialog.
import { create } from "zustand";

import type { ToastType } from "@/shared/utils/uiStyles";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toast: ToastItem | null;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>()((set) => ({
  toast: null,
  showToast: (message, type = "info") =>
    set({ toast: { id: nextId++, message, type } }),
  dismissToast: () => set({ toast: null }),
}));
