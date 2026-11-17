// src/shared/utils/themedStyles.ts
//
// Logika murni di balik `useThemedStyles` (Fase 1 redesign) — dipisah dari
// hook React-nya supaya bisa diuji jest logika-murni tanpa react-native,
// mengikuti pola `themeMode.ts`.
import type { Theme } from "@/shared/constants/themes/types";

export type ThemedStyleFactory<T> = (theme: Theme) => T;

/** Bangun objek gaya dari token tema yang diberikan. */
export function buildThemedStyles<T>(
  theme: Theme,
  factory: ThemedStyleFactory<T>,
): T {
  return factory(theme);
}
