// src/features/visualizer/components/SpectrumAnalyzer.tsx
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions, Text } from "react-native";
import {
  Canvas,
  Path,
  Skia,
  Group,
  BlurMask,
} from "@shopify/react-native-skia";
import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  runOnUI,
  runOnJS,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";

export type VisualizerMode = "bars" | "wave" | "circle";

export interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
  mode?: VisualizerMode;
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  isPlaying: boolean;
  audioSessionId?: number;
  centerArt?: string;
  showCenterArt?: boolean;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  mode = "bars",
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 2.2,
  isPlaying,
  audioSessionId,
}) => {
  const barCount = Math.max(MIN_BAR_COUNT, Math.min(MAX_BAR_COUNT, rawBarCount));

  const freqData    = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData    = useSharedValue<number[]>(Array(barCount).fill(0.1));
  const dummyPhase  = useSharedValue(0);

  // FIX: hasRealData dan isPlayingSV sebagai SharedValue agar bisa dibaca worklet
  const hasRealData  = useSharedValue(false);
  const isPlayingSV  = useSharedValue(isPlaying);

  const isServiceInitialized = useRef(false);
  const isStarted            = useRef(false);
  const lastSessionId        = useRef<number | null>(null);
  const frameCount           = useRef(0);

  // Sync isPlaying prop → SharedValue
  useEffect(() => {
    isPlayingSV.value = isPlaying;
  }, [isPlaying]);

  // Animasi dummy saat tidak ada data real
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      dummyPhase.value = withTiming(dummyPhase.value + 0.5, {
        duration: 100,
        easing: Easing.linear,
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Inisialisasi service sekali
  useEffect(() => {
    if (isServiceInitialized.current) return;

    const success = visualizerService.initialize((newData: number[]) => {
      // Dipanggil dari JS thread — set SharedValue via runOnUI
      if (!newData || newData.length === 0) return;

      frameCount.current++;
      const maxVal = Math.max(...newData);

      const sv = freqData;
      const hrSV = hasRealData;
      runOnUI(() => {
        "worklet";
        sv.value = newData;
        if (maxVal > 0.01) {
          hrSV.value = true;
        } else if (frameCount.current > 10) {
          hrSV.value = false;
        }
      })();
    });

    if (success) {
      isServiceInitialized.current = true;
      console.log("[SpectrumAnalyzer] Service initialized");
    }

    return () => {};
  }, []);

  // Start/Stop berdasarkan isPlaying dan audioSessionId
  useEffect(() => {
    if (!isServiceInitialized.current) return;

    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[SpectrumAnalyzer] Starting session ${audioSessionId}`);
        visualizerService.start(audioSessionId);
        isStarted.current = true;
        lastSessionId.current = audioSessionId;
        frameCount.current = 0;
        runOnUI(() => { "worklet"; hasRealData.value = false; })();
      }
    } else {
      if (isStarted.current) {
        console.log("[SpectrumAnalyzer] Stopping");
        visualizerService.stop();
        isStarted.current = false;
        lastSessionId.current = null;
        runOnUI(() => {
          "worklet";
          freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
          prevData.value = Array(barCount).fill(0.1);
          hasRealData.value = false;
        })();
      }
    }
  }, [isPlaying, audioSessionId, barCount]);

  // Processed data — semua SharedValue, aman di worklet
  const processedData = useDerivedValue(() => {
    const raw      = freqData.value;
    const useDummy = !hasRealData.value && isPlayingSV.value;

    if (useDummy) {
      const dummy = new Array(barCount).fill(0);
      const phase = dummyPhase.value;
      for (let i = 0; i < barCount; i++) {
        const t   = i / (barCount - 1);
        const val = 0.3 + 0.5 * (
          Math.sin(phase * 2 + t * 10) * 0.5 +
          Math.sin(phase * 0.5 + t * 20) * 0.3 +
          Math.sin(phase * 3 + t * 5) * 0.2
        );
        dummy[i] = Math.max(0.05, Math.min(0.8, val));
      }
      return dummy;
    }

    if (!raw || raw.length === 0) return Array(barCount).fill(0.1);

    const result  = new Array(barCount).fill(0);
    const falloff = 0.85;

    for (let i = 0; i < barCount; i++) {
      const t        = i / (barCount - 1);
      const logT     = Math.pow(t, 1.2);
      const startIdx = Math.floor(logT * (raw.length - 1));
      const endIdx   = Math.min(raw.length - 1, startIdx + 8);

      let sum = 0, count = 0;
      for (let j = startIdx; j <= endIdx && j < raw.length; j++) {
        sum += raw[j] || 0;
        count++;
      }

      let target = count > 0 ? (sum / count) * sensitivity : 0;
      target *= 1 + (i / barCount) * 0.5;
      target = Math.max(0.05, Math.min(1.0, target));

      const prev = prevData.value[i] || 0.05;
      if (target < prev * falloff) target = prev * falloff;

      result[i] = target;
    }

    return result;
  });

  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
    }
  );

  const visualizerPath = useDerivedValue(() => {
    const data = processedData.value;
    const path = Skia.Path.Make();
    const gap  = 3;
    const barWidth = (width - (barCount - 1) * gap) / barCount;

    data.forEach((amp, i) => {
      const barHeight = Math.max(4, amp * height * 0.85);
      const x    = i * (barWidth + gap);
      const y    = height - barHeight;
      const rect = Skia.XYWHRect(x, y, barWidth, barHeight);
      path.addRRect(Skia.RRectXY(rect, 4, 4));
    });

    return path;
  });

  // Debug value untuk display (JS side) — derived dari SharedValue
  const debugMaxSV = useDerivedValue(() =>
    freqData.value.reduce((a, b) => Math.max(a, b), 0)
  );

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          <Path
            path={visualizerPath}
            color={color}
            style="fill"
            opacity={hasRealData.value ? 1 : 0.5}
          >
            <BlurMask blur={2} style="solid" />
          </Path>
        </Group>
      </Canvas>

      {__DEV__ && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>
            FFT Max: {debugMaxSV.value.toFixed(3)} | Real: {hasRealData.value ? "Y" : "N"}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  debugOverlay: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 2,
    borderRadius: 2,
  },
  debugText: {
    color: "#0f0",
    fontSize: 8,
    fontFamily: "monospace",
  },
});
 