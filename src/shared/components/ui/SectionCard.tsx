// src/shared/components/ui/SectionCard.tsx
//
// SATU kartu/section untuk semua layar (Fase 2 redesign) — menggantikan
// variasi kartu per layar (Fase 0 T1: radius kartu 8/10/12/16/20 tanpa
// peran). Permukaan elevated + radius kartu (md) + bayangan md + garis
// hairline border.light, semua dari token Fase 1.
import React, { useCallback, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import {
  buildCardStyles,
  type CardPadding,
} from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

export interface SectionCardProps {
  children: ReactNode;
  /** Padding dalam kartu: sm 8 / md 16 / lg 24 (token spacing). */
  padding?: CardPadding;
  style?: StyleProp<ViewStyle>;
}

export function SectionCard({
  children,
  padding = "md",
  style,
}: SectionCardProps) {
  const styles = useThemedStyles(
    useCallback(
      (theme: Theme) => buildCardStyles(theme, { padding }),
      [padding],
    ),
  );

  return <View style={[styles.container, style]}>{children}</View>;
}
