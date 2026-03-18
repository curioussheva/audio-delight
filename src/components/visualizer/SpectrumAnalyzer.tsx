import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import {
  Canvas,
  Path,
  Skia,
  Group,
  Image as SkiaImage,
  useImage,
  BlurMask,
} from "@shopify/react-native-skia";
import { useSharedValue, useDerivedValue } from "react-native-reanimated";
import VisualizerService from "@/services/audio/VisualizerService";

export interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
  mode?: "bars" | "wave" | "circle";
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  centerArt?: string;
  showCenterArt?: boolean;
  isPlaying: boolean;
}
export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  mode = "bars",
  barCount = 48,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 2.0,
  centerArt,
  showCenterArt = false,
}) => {
const freqData = useSharedValue<number[]>(Array.from({ length: barCount }, () => 0));

  const prevProcessedData = useSharedValue<number[]>(
    Array.from({ length: barCount }, () => 0),
  );
  const albumArt = useImage(centerArt);

  const centerX = width / 2;
  const centerY = height / 2;

  useEffect(() => {
    VisualizerService.initialize(freqData);
    return () => VisualizerService.stop();
  }, [barCount]);

  // Efek denyut (pulse) berbasis Bass (Frekuensi 0-5)
  const pulseScale = useDerivedValue(() => {
    if (!freqData.value.length) return 1;
    const bassSum = freqData.value.slice(0, 5).reduce((a, b) => a + b, 0);
    const avgBass = bassSum / 5 / 255;
    return 1 + avgBass * 0.15 * sensitivity;
  });

  const visualizerPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const rawData = freqData.value;
    if (!rawData || rawData.length === 0) return path;

    const currentProcessed = Array.from({ length: barCount }, () => 0);
    const falloff = 0.92; // Kecepatan bar turun (gravitasi)

    for (let i = 0; i < barCount; i++) {
      // 1. LOGARITHMIC MAPPING
      const logIndex = Math.floor(
        Math.pow(i / barCount, 1.5) * (rawData.length - 1),
      );
      const nextLogIndex = Math.floor(
        Math.pow((i + 1) / barCount, 1.5) * (rawData.length - 1),
      );
      const range = Math.max(1, nextLogIndex - logIndex);

      let sum = 0;
      for (let j = 0; j < range; j++) {
        sum += rawData[logIndex + j] || 0;
      }

      const avg = sum / range;

      // 2. TREBLE BOOST (Kompensasi sensitivitas telinga)
      const trebleBoost = 1 + (i / barCount) * 0.8;
      let targetVal = Math.max(0.02, (avg / 255) * sensitivity * trebleBoost);

      // 3. GRAVITY FALL-OFF (Mencegah bar patah-patah)
      if (targetVal < prevProcessedData.value[i] * falloff) {
        targetVal = prevProcessedData.value[i] * falloff;
      }
      currentProcessed[i] = targetVal;
    }

    // Update data sebelumnya untuk iterasi berikutnya
    prevProcessedData.value = currentProcessed;

    // 4. DRAWING MODES
    if (mode === "bars") {
      const gap = 3;
      const bWidth = (width - (barCount - 1) * gap) / barCount;
      currentProcessed.forEach((amp, i) => {
        const bHeight = Math.max(4, amp * height * 0.8);
        const x = i * (bWidth + gap);
        const y = centerY - bHeight / 2; // Center vertical bars
        path.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, bWidth, bHeight), 4, 4));
      });
    } else if (mode === "circle") {
      const radius = Math.min(width, height) * 0.28;
      currentProcessed.forEach((amp, i) => {
        const angle = (i / barCount) * Math.PI * 2;
        const bLength = amp * radius * 0.7;
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + bLength);
        const y2 = centerY + Math.sin(angle) * (radius + bLength);
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      });
    }

    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          {/* Efek Glow pada Path */}
          <Path
            path={visualizerPath}
            color={color}
            style={mode === "wave" ? "stroke" : "fill"}
            strokeWidth={mode === "circle" ? 3 : 0}
            strokeCap="round"
          >
            <BlurMask blur={3} style="solid" />
          </Path>
        </Group>

        {/* Center Album Art (Hanya di mode circle) */}
        {mode === "circle" && showCenterArt && albumArt && (
          <Group
            origin={{ x: centerX, y: centerY }}
            transform={useDerivedValue(() => [{ scale: pulseScale.value }])}
          >
            <Group
              clip={Skia.Path.Make().addCircle(
                centerX,
                centerY,
                Math.min(width, height) * 0.25,
              )}
            >
              <SkiaImage
                image={albumArt}
                x={centerX - Math.min(width, height) * 0.25}
                y={centerY - Math.min(width, height) * 0.25}
                width={Math.min(width, height) * 0.5}
                height={Math.min(width, height) * 0.5}
                fit="cover"
              />
            </Group>
          </Group>
        )}
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});
