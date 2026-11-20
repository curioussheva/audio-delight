// src/features/equalizer/components/BandScale.tsx
//
// Skala dB di kiri strip DETAIL BAND — satu kolom untuk seluruh strip,
// karena semua fader berbagi rentang ±10 dB dan geometri yang sama.
// Tanpa skala, posisi thumb hanya bisa ditebak dari angka di atas fader.
//
// Label sejajar dengan posisi thumb di gain itu (gainToY: +10 di y=12,
// 0 di y=80, −10 di y=148) — bukan dengan tepi track. Struktur kolom
// mencerminkan EqualizerBand (paddingVertical 10, label nilai, track
// 160, label frekuensi) supaya area skala mulai tepat di atas track
// tanpa angka ajaib: spacer-nya spasi nir-putus dengan gaya font yang
// sama dengan label fader, jadi tingginya sama persis.
import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY } from "@/shared/constants/themes/base";
import { gainToY } from "@/features/equalizer/api/bandThumbMath";
import { SLIDER_HEIGHT } from "@/features/equalizer/components/Band";

const SCALE_VALUES = [10, 5, 0, -5, -10];
const SCALE_LABEL_HEIGHT = 14;

function scaleLabel(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${-value}`;
  return "0";
}

interface BandScaleProps {
  /** Redupkan bersama fader saat EQ nonaktif (master OFF / mode lain). */
  dimmed?: boolean;
}

export const BandScale = ({ dimmed }: BandScaleProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View
      style={[styles.container, { opacity: dimmed ? 0.35 : 1 }]}
      // Dekoratif saja — tiap fader sudah mengumumkan nilainya sendiri.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Spacer setinggi label nilai di atas fader. */}
      <Text style={styles.valueSpacer}>{"\u00A0"}</Text>
      <View style={styles.scaleArea}>
        {SCALE_VALUES.map((v) => (
          <Text
            key={v}
            style={[
              styles.scaleLabel,
              {
                top: gainToY(v, SLIDER_HEIGHT) - SCALE_LABEL_HEIGHT / 2,
                color:
                  v === 0 ? colors.text.secondary : colors.text.tertiary,
              },
              v === 0 && styles.scaleLabelZero,
            ]}
          >
            {scaleLabel(v)}
          </Text>
        ))}
      </View>
      {/* Spacer setinggi label frekuensi di bawah fader. */}
      <Text style={styles.freqSpacer}>{"\u00A0"}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 28,
    paddingVertical: 10,
    alignItems: "center",
  },
  valueSpacer: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
    fontVariant: ["tabular-nums"],
    marginBottom: 8,
  },
  scaleArea: {
    width: "100%",
    height: SLIDER_HEIGHT,
    position: "relative",
  },
  scaleLabel: {
    position: "absolute",
    width: "100%",
    textAlign: "center",
    fontSize: 10,
    lineHeight: SCALE_LABEL_HEIGHT,
    fontFamily: FONT_FAMILY.medium,
    fontVariant: ["tabular-nums"],
  },
  scaleLabelZero: {
    fontFamily: FONT_FAMILY.bold,
  },
  freqSpacer: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
  },
});
