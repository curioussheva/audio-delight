// src/shared/hooks/useThemedStyles.ts
//
// Hook gaya bertema (Fase 1 redesign) — setara `useThemedStyles()` di RAB:
// komponen mengambil gaya dari token tema, bukan menulis angka sendiri.
//
// Pakai factory di scope modul (atau `useCallback`) supaya identitasnya
// stabil dan `useMemo` benar-benar bekerja; factory inline dihitung ulang
// tiap render (tetap benar, hanya tanpa memo).
import { useMemo } from "react";

import { useTheme } from "@/shared/context/ThemeContext";
import {
  buildThemedStyles,
  type ThemedStyleFactory,
} from "@/shared/utils/themedStyles";

export type { ThemedStyleFactory } from "@/shared/utils/themedStyles";

export function useThemedStyles<T>(factory: ThemedStyleFactory<T>): T {
  const { theme } = useTheme();
  return useMemo(() => buildThemedStyles(theme, factory), [theme, factory]);
}
