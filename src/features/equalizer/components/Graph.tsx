import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import {
  Skia,
  Canvas,
  Path,
  LinearGradient,
  vec,
  BlurMask,
} from "@shopify/react-native-skia";
import { useDerivedValue, SharedValue } from "react-native-reanimated";
import { EqualizerBand } from "@/features/equalizer/types";
import { useTheme } from "@/context/ThemeContext";

interface Props {
  bands: SharedValue<EqualizerBand[]> | EqualizerBand[]; // Terima dua-duanya agar fleksibel
  width?: number;
  height?: number;
}

export const FrequencyGraph: React.FC<Props> = ({
  bands,
  width = 340,
  height = 120,
}) => {
  const { theme } = useTheme();

  // Dimensi & Skala Konstan
  const midY = height / 2;
  const maxGainVisible = 12;
  const verticalScale = (height * 0.45) / maxGainVisible;

  // 1. Generate Path di UI Thread (Smooth Transition)
  const paths = useDerivedValue(() => {
    // PROTEKSI: Cek apakah bands ada
    if (!bands) return { curve: Skia.Path.Make(), fill: Skia.Path.Make() };

    // Ambil data: cek apakah dia SharedValue (punya property .value) atau array biasa
    const currentBands = "value" in bands ? bands.value : bands;

    const skPath = Skia.Path.Make();
    if (!currentBands || currentBands.length === 0) {
      return { curve: skPath, fill: skPath };
    }

    const stepX = width / (currentBands.length - 1);
    const getY = (gain: number) => midY - gain * verticalScale;

    skPath.moveTo(0, getY(currentBands[0].gain));

    for (let i = 1; i < currentBands.length; i++) {
      const x = i * stepX;
      const y = getY(currentBands[i].gain);
      const prevX = (i - 1) * stepX;
      const prevY = getY(currentBands[i - 1].gain);

      const cp1x = prevX + (x - prevX) * 0.5;
      const cp2x = prevX + (x - prevX) * 0.5;
      skPath.cubicTo(cp1x, prevY, cp2x, y, x, y);
    }

    const fillPath = skPath.copy();
    fillPath.lineTo(width, height);
    fillPath.lineTo(0, height);
    fillPath.close();

    return { curve: skPath, fill: fillPath };
  });

  // 2. Config warna (useMemo agar tidak re-render kecuali tema berubah)
  const colors = useMemo(
    () => ({
      primary: theme.colors.primary[500],
      accent: theme.colors.accent?.blue ?? "#00D4AA",
      fillGradient: [
        `${theme.colors.primary[500]}44`,
        "transparent",
      ] as string[],
      lineGradient: [
        theme.colors.primary[500],
        theme.colors.accent?.blue ?? "#00D4AA",
      ] as string[],
      border: theme.colors.border.light,
    }),
    [theme],
  );

  return (
    <View style={[styles.container, { width, height }]}>
      {/* 0dB Reference Line */}
      <View
        style={[
          styles.zeroLine,
          { top: midY, width, borderColor: colors.border },
        ]}
      />

      <Canvas style={{ width, height }}>
        {/* Shaded Area */}
        <Path path={useDerivedValue(() => paths.value.fill)}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={colors.fillGradient}
          />
        </Path>

        {/* Glowing Curve */}
        <Path
          path={useDerivedValue(() => paths.value.curve)}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          strokeCap="round"
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, 0)}
            colors={colors.lineGradient}
          />
          <BlurMask blur={3} style="solid" />
        </Path>
      </Canvas>

      <View style={styles.debugInfo}>
        <Text style={styles.debugText}>+12dB</Text>
        <Text style={styles.debugText}>-12dB</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
  },
  zeroLine: {
    position: "absolute",
    height: 1,
    borderStyle: "dashed",
    borderWidth: 0.5,
    opacity: 0.2,
  },
  debugInfo: {
    position: "absolute",
    left: 8,
    height: "100%",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  debugText: {
    fontSize: 9,
    color: "#888",
    fontFamily: "monospace",
  },
});
