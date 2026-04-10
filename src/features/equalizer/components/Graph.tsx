import React, { useMemo, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import {
  Skia,
  Canvas,
  Path,
  LinearGradient,
  vec,
  BlurMask,
} from "@shopify/react-native-skia";
import { EqualizerBand } from "@/features/equalizer/types";
import { useTheme } from "@/context/ThemeContext";

interface Props {
  bands: EqualizerBand[];
  width?: number;
  height?: number;
}

export const FrequencyGraph: React.FC<Props> = ({
  bands,
  width = 340,
  height = 120, // Sedikit lebih tinggi untuk visibilitas
}) => {
  const { theme } = useTheme();

  const { curvePath, fillPath, stats } = useMemo(() => {
    const startTime = performance.now(); // LOGGING: Start Timer

    if (!bands || bands.length === 0) {
      return { curvePath: null, fillPath: null, stats: null };
    }

    const skPath = Skia.Path.Make();
    const midY = height / 2;
    const stepX = width / (bands.length - 1);

    // Skala: 12dB Gain akan memakan 45% tinggi kanvas ke atas/bawah
    const maxGainVisible = 12;
    const verticalScale = (height * 0.45) / maxGainVisible;

    const getX = (i: number) => i * stepX;
    const getY = (gain: number) => midY - gain * verticalScale;

    // Titik awal kurva
    skPath.moveTo(0, getY(bands[0].gain));

    // Membuat Smooth Cubic Bezier Curve
    for (let i = 1; i < bands.length; i++) {
      const x = getX(i);
      const y = getY(bands[i].gain);
      const prevX = getX(i - 1);
      const prevY = getY(bands[i - 1].gain);

      // Control points di tengah sumbu X untuk efek S-Curve yang halus (Spline)
      const cp1x = prevX + (x - prevX) * 0.5;
      const cp2x = prevX + (x - prevX) * 0.5;

      skPath.cubicTo(cp1x, prevY, cp2x, y, x, y);
    }

    // Jalur untuk Gradasi Isi (Area under curve)
    const fill = skPath.copy();
    fill.lineTo(width, height);
    fill.lineTo(0, height);
    fill.close();

    const endTime = performance.now(); // LOGGING: End Timer

    return {
      curvePath: skPath,
      fillPath: fill,
      stats: {
        calcTime: (endTime - startTime).toFixed(3),
        minGain: Math.min(...bands.map((b) => b.gain)),
        maxGain: Math.max(...bands.map((b) => b.gain)),
      },
    };
  }, [bands, width, height]);

  // LOGGING: Memantau perubahan data di console
  useEffect(() => {
    if (stats) {
      console.log(
        `📊 [EQ Graph] Render: ${stats.calcTime}ms | Range: ${stats.minGain}dB to ${stats.maxGain}dB`,
      );
    }
  }, [stats]);

  if (!curvePath || !fillPath) return null;

  return (
    <View style={[styles.container, { width, height }]}>
      {/* 0dB Reference Line (Dashed) */}
      <View
        style={[
          styles.zeroLine,
          { top: height / 2, width, borderColor: theme.colors.border.light },
        ]}
      />

      <Canvas style={{ width, height }}>
        {/* Shaded Area Under Curve */}
        <Path path={fillPath}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[
              `${theme.colors.primary[500]}44`, // 44 = ~25% opacity
              "transparent",
            ]}
          />
        </Path>

        {/* The Glowing Curve Line */}
        <Path
          path={curvePath}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          strokeCap="round"
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, 0)}
            colors={[
              theme.colors.primary[500],
              theme.colors.accent?.blue ??
                theme.colors.secondary?.[500] ??
                "#00D4AA",
            ]}
          />
          {/* Efek Neon/Glow */}
          <BlurMask blur={4} style="solid" />
        </Path>
      </Canvas>

      {/* Gain Labels (Optional Debug Info di UI) */}
      <View style={styles.debugInfo}>
        <Text style={styles.debugText}>+12dB</Text>
        <View style={{ flex: 1 }} />
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
    marginVertical: 5,
  },
  zeroLine: {
    position: "absolute",
    height: 1,
    borderStyle: "dashed",
    borderWidth: 0.5,
    opacity: 0.3,
  },
  debugInfo: {
    position: "absolute",
    left: -20,
    height: "100%",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  debugText: {
    fontSize: 8,
    color: "#666",
    fontWeight: "bold",
  },
});
