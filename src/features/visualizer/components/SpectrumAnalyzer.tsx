// src/features/visualizer/components/SpectrumAnalyzer.tsx
import React, { useEffect, useCallback, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import USBDACService from "@/features/hardware/api/USBDACModule";
import {
  Canvas,
  Path,
  Skia,
  Group,
  Image as SkiaImage,
  useImage,
  BlurMask,
  Rect,
} from "@shopify/react-native-skia";
import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction, // ← TAMBAH
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";

// ============================================================================
// Types
// ============================================================================

export type VisualizerMode = "bars" | "wave" | "circle";

export interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
  mode?: VisualizerMode;
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  smoothing?: number; // ✅ TAMBAH: smoothing factor
  centerArt?: string;
  showCenterArt?: boolean;
  isPlaying: boolean; // ✅ WAJIB: untuk control lifecycle
  audioSessionId?: number; // ✅ TAMBAH: explicit session ID
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128; // Dari native
const MIN_BAR_COUNT = 16;

// Frequency bands (in bins) untuk color coding
const FREQ_BANDS = {
  subBass: { start: 0, end: 4, color: "#3B82F6" }, // Blue
  bass: { start: 4, end: 12, color: "#10B981" }, // Green
  lowMid: { start: 12, end: 24, color: "#F59E0B" }, // Yellow
  mid: { start: 24, end: 40, color: "#EF4444" }, // Red
  high: { start: 40, end: 64, color: "#8B5CF6" }, // Purple
};

// ============================================================================
// Component
// ============================================================================

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  mode = "bars",
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 1.5, // ✅ DEFAULT lebih conservative
  smoothing = 0.3, // ✅ DEFAULT smoothing
  centerArt,
  showCenterArt = false,
  isPlaying,
  audioSessionId: propSessionId,
}) => {
  // Clamp bar count
  const barCount = Math.max(
    MIN_BAR_COUNT,
    Math.min(MAX_BAR_COUNT, rawBarCount),
  );

  // Get session ID dari prop atau hook
  const effectiveSessionId = 0; // Global audio session

  // SharedValues
  const freqData = useSharedValue<number[]>(
    Array.from({ length: MAX_BAR_COUNT }, () => 0),
  );

  const prevData = useSharedValue<number[]>(
    Array.from({ length: barCount }, () => 0),
  );

  const albumArt = useImage(centerArt);

  const centerX = width / 2;
  const centerY = height / 2;

  // ✅ LIFECYCLE: Initialize dan Start/Stop berdasarkan isPlaying
  useEffect(() => {
    if (!isPlaying || effectiveSessionId === 0) {
      // Reset data saat stop
      freqData.value = Array.from({ length: MAX_BAR_COUNT }, () => 0);
      prevData.value = Array.from({ length: barCount }, () => 0);
      return;
    }

    // Initialize service
    const initialized = visualizerService.initialize((newData) => {
      freqData.value = newData;
    });

    if (!initialized) {
      console.warn("[SpectrumAnalyzer] Failed to initialize visualizer");
      return;
    }

    // Start dengan session ID
    visualizerService.start(0);

    return () => {
      visualizerService.stop();
    };
  }, [isPlaying, effectiveSessionId, barCount, smoothing]);

  // ✅ DERIVED: Process data dengan smoothing (pure function, no side effects)
  const processedData = useDerivedValue(() => {
    const raw = freqData.value;
    if (!raw || raw.length === 0) {
      return Array.from({ length: barCount }, () => 0);
    }

    const result = new Array(barCount).fill(0);
    const falloff = 0.92; // Gravity

    for (let i = 0; i < barCount; i++) {
      // Logarithmic frequency mapping
      const t = i / (barCount - 1);
      const logT = Math.pow(t, 1.5); // Log curve
      const startIdx = Math.floor(logT * (raw.length - 1));
      const endIdx = Math.floor(
        Math.pow((i + 1) / barCount, 1.5) * (raw.length - 1),
      );
      const range = Math.max(1, endIdx - startIdx);

      // Average dalam range
      let sum = 0;
      for (let j = 0; j < range && startIdx + j < raw.length; j++) {
        sum += raw[startIdx + j] || 0;
      }
      const avg = sum / range;

      // ✅ NATIVE DATA SUDAH 0.0-1.0, tidak perlu /255!
      // Treble boost untuk kompensasi sensitivitas telinga
      const trebleBoost = 1 + (i / barCount) * 0.5;
      let target = avg * sensitivity * trebleBoost;

      // Clamp
      target = Math.max(0.02, Math.min(1.0, target));

      // Gravity falloff (dibaca dari prevData, tapi tidak write di sini!)
      const prev = prevData.value[i] || 0;
      if (target < prev * falloff) {
        target = prev * falloff;
      }

      result[i] = target;
    }

    return result;
  }, [freqData, barCount, sensitivity]);

  // ✅ EFFECT: Update prevData di JS thread (bukan di worklet)
  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
    },
  );

  // ✅ DERIVED: Build path untuk drawing
  const visualizerPath = useDerivedValue(() => {
    const data = processedData.value;
    const path = Skia.Path.Make();

    if (mode === "bars") {
      const gap = 2;
      const barWidth = (width - (barCount - 1) * gap) / barCount;

      data.forEach((amp, i) => {
        if (amp < 0.01) return; // Skip very low

        const barHeight = Math.max(2, amp * height * 0.9);
        const x = i * (barWidth + gap);
        const y = height - barHeight; // Bottom-aligned

        // Rounded rect
        const rect = Skia.XYWHRect(x, y, barWidth, barHeight);
        path.addRRect(Skia.RRectXY(rect, 3, 3));
      });
    } else if (mode === "circle") {
      const baseRadius = Math.min(width, height) * 0.25;

      data.forEach((amp, i) => {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2; // Start from top
        const barLength = amp * baseRadius * 0.8;

        const innerR = baseRadius;
        const outerR = baseRadius + barLength;

        const x1 = centerX + Math.cos(angle) * innerR;
        const y1 = centerY + Math.sin(angle) * innerR;
        const x2 = centerX + Math.cos(angle) * outerR;
        const y2 = centerY + Math.sin(angle) * outerR;

        // Draw thick line
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      });
    } else if (mode === "wave") {
      // ✅ IMPLEMENTASI WAVE MODE
      if (data.length < 2) return path;

      const step = width / (data.length - 1);
      const amplitudeScale = height * 0.4;
      const baseline = height / 2;

      path.moveTo(0, baseline);

      // Smooth curve
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = baseline - data[i] * amplitudeScale;

        if (i === 0) {
          path.moveTo(x, y);
        } else {
          // Quadratic bezier untuk smooth wave
          const prevX = (i - 1) * step;
          const prevY = baseline - data[i - 1] * amplitudeScale;
          const cpX = (prevX + x) / 2;
          path.quadTo(cpX, prevY, x, y);
        }
      }

      // Mirror untuk fill effect (optional)
      for (let i = data.length - 1; i >= 0; i--) {
        const x = i * step;
        const y = baseline + data[i] * amplitudeScale * 0.3; // Lower mirror
        path.lineTo(x, y);
      }

      path.close();
    }

    return path;
  }, [processedData, mode, width, height, barCount, centerX, centerY]);

  // ✅ DERIVED: Pulse effect dari bass
  const pulseScale = useDerivedValue(() => {
    const data = processedData.value;
    if (!data.length) return 1;

    // Average 20% pertama = bass frequencies
    const bassCount = Math.max(1, Math.floor(data.length * 0.2));
    let bassSum = 0;
    for (let i = 0; i < bassCount; i++) {
      bassSum += data[i] || 0;
    }
    const bassAvg = bassSum / bassCount;

    return 1 + bassAvg * 0.2; // Scale 1.0 - 1.2
  }, [processedData]);

  // ✅ DERIVED: Dynamic color berdasarkan frequency
  const getBarColor = useCallback(
    (index: number, amplitude: number) => {
      if (amplitude < 0.1) return color;

      // Color berdasarkan frequency band
      const t = index / barCount;
      if (t < 0.15) return "#3B82F6"; // Sub-bass: Blue
      if (t < 0.3) return "#10B981"; // Bass: Green
      if (t < 0.5) return "#F59E0B"; // Low-mid: Yellow
      if (t < 0.7) return "#EF4444"; // Mid: Red
      return "#8B5CF6"; // High: Purple
    },
    [barCount, color],
  );

  // ✅ DERIVED: Paint style berdasarkan mode
  const paintStyle = useDerivedValue(() => {
    return {
      color: mode === "wave" ? color : undefined,
      strokeWidth: mode === "circle" ? 4 : mode === "wave" ? 2 : 0,
      style: mode === "bars" ? "fill" : "stroke",
      strokeCap: "round" as const,
    };
  }, [mode, color]);

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          {/* Main visualizer */}
          <Path
            path={visualizerPath}
            color={mode === "bars" ? undefined : color}
            style={paintStyle.value.style as "fill" | "stroke"}
            strokeWidth={paintStyle.value.strokeWidth}
            strokeCap={paintStyle.value.strokeCap}
          >
            <BlurMask blur={4} style="solid" />
          </Path>

          {/* Individual colored bars untuk mode "bars" */}
          {mode === "bars" && (
            <Group>{/* Render dengan color per band - simplified */}</Group>
          )}
        </Group>

        {/* Center Album Art */}
        {mode === "circle" && showCenterArt && albumArt && (
          <Group
            origin={{ x: centerX, y: centerY }}
            transform={[{ scale: pulseScale.value }]}
          >
            <Group
              clip={Skia.Path.Make().addCircle(
                centerX,
                centerY,
                Math.min(width, height) * 0.22,
              )}
            >
              <SkiaImage
                image={albumArt}
                x={centerX - Math.min(width, height) * 0.22}
                y={centerY - Math.min(width, height) * 0.22}
                width={Math.min(width, height) * 0.44}
                height={Math.min(width, height) * 0.44}
                fit="cover"
              />
            </Group>
          </Group>
        )}
      </Canvas>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});
