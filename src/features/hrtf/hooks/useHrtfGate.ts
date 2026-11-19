// src/features/hrtf/hooks/useHrtfGate.ts
//
// Gate HRTF di level root playback (dipasang di ThemedStack,
// _layout.tsx): HRTF dimatikan otomatis begitu perangkat aktif bukan
// headphone (speaker/earpiece/hdmi/line_out/unknown, atau perangkat
// hilang). TIDAK auto-ON saat headphone kembali — user yang menyalakan
// lagi (aturan yang sama dengan auto-off koreksi headphone).
//
// Pelajaran P1-7: hook auto-off koreksi hanya terpasang di layar EQ,
// jadi tidak jalan saat layar itu tertutup. Hook ini dipasang di
// ThemedStack — hidup selama app ready, bukan hanya saat layar EQ
// terbuka. Pemakaian kedua di layar EQ (untuk keadaan toggle) tidak
// masalah: efeknya idempotent dan membaca store yang sama (preseden
// useHeadphoneCorrection di equalizer.tsx:375).

import { useEffect, useRef } from "react";

import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { isHrtfAllowedDevice, shouldAutoDisableHrtf } from "../hrtfGate";
import { useHrtfStore } from "../store/hrtfStore";

export interface UseHrtfGateReturn {
  /** Toggle HRTF boleh dipakai (perangkat aktif headphone / belum tahu). */
  hrtfAllowed: boolean;
  /** Tipe perangkat aktif sekarang; null = belum diketahui. */
  currentDeviceType: string | null;
}

export const useHrtfGate = (): UseHrtfGateReturn => {
  const isHrtfEnabled = useHrtfStore((s) => s.isHrtfEnabled);
  const setHrtfEnabled = useHrtfStore((s) => s.setHrtfEnabled);
  const { currentDevice } = useAudioOutput();

  const currentDeviceType = currentDevice?.type ?? null;
  const prevTypeRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevTypeRef.current;
    if (shouldAutoDisableHrtf(prev, currentDeviceType, isHrtfEnabled)) {
      console.log(
        `[HRTF] Perangkat bukan headphone (${prev} -> ${currentDeviceType ?? "null"}) — HRTF dimatikan otomatis.`,
      );
      void setHrtfEnabled(false);
    }
    prevTypeRef.current = currentDeviceType;
  }, [currentDeviceType, isHrtfEnabled, setHrtfEnabled]);

  return {
    hrtfAllowed: isHrtfAllowedDevice(currentDeviceType),
    currentDeviceType,
  };
};
