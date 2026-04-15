// src/features/visualizer/components/SpectrumAnalyzer.tsx
import React, { useEffect, useRef, useState } from "react";
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

// ✅ KONSTANTA - pastikan didefinisikan di sini
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
  // ✅ Gunakan konstanta yang sudah didefinisikan
  const barCount = Math.max(MIN_BAR_COUNT, Math.min(MAX_BAR_COUNT, rawBarCount));

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));
  const dummyPhase = useSharedValue(0);

  const isServiceInitialized = useRef(false);
  const isStarted = useRef(false);
  const lastSessionId = useRef<number | null>(null);
  const frameCount = useRef(0);

  const [debugMax, setDebugMax] = useState(0);
  const [hasRealData, setHasRealData] = useState(false);

  // Animasi dummy ketika tidak ada data real
  useEffect(() => {
    if (!hasRealData && isPlaying) {
      const interval = setInterval(() => {
        dummyPhase.value = withTiming(dummyPhase.value + 0.5, {
          duration: 100,
          easing: Easing.linear,
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [hasRealData, isPlaying, dummyPhase]);

  // Inisialisasi service sekali
  useEffect(() => {
    if (!isServiceInitialized.current) {
      const success = visualizerService.initialize((newData: number[]) => {
        frameCount.current++;
        if (newData && newData.length > 0) {
          const maxVal = Math.max(...newData);
          runOnJS(setDebugMax)(maxVal);
          
          if (maxVal > 0.01) {
            runOnJS(setHasRealData)(true);
          } else if (frameCount.current > 10 && maxVal <= 0.01) {
            runOnJS(setHasRealData)(false);
          }
          
          freqData.value = [...newData];
        }
      });
      
      if (success) {
        isServiceInitialized.current = true;
        console.log("[SpectrumAnalyzer] Service initialized");
      }
    }

    return () => {
      // Jangan stop global service di sini
    };
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
        runOnJS(setHasRealData)(false);
      }
    } else {
      if (isStarted.current) {
        console.log("[SpectrumAnalyzer] Stopping");
        visualizerService.stop();
        isStarted.current = false;
        lastSessionId.current = null;
        freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
        prevData.value = Array(barCount).fill(0.1);
        runOnJS(setDebugMax)(0);
        runOnJS(setHasRealData)(false);
      }
    }
  }, [isPlaying, audioSessionId, barCount]);

  // Processed data
  const processedData = useDerivedValue(() => {
    const raw = freqData.value;
    const useDummy = !hasRealData && isPlaying;
    
    if (useDummy) {
      const dummy = new Array(barCount).fill(0);
      const phase = dummyPhase.value;
      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
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

    const result = new Array(barCount).fill(0);
    const falloff = 0.85;

    for (let i = 0; i < barCount; i++) {
      const t = i / (barCount - 1);
      const logT = Math.pow(t, 1.2);
      const startIdx = Math.floor(logT * (raw.length - 1));
      const endIdx = Math.min(raw.length - 1, startIdx + 8);

      let sum = 0;
      let count = 0;
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
  }, [freqData, barCount, sensitivity, hasRealData, isPlaying, dummyPhase]);

  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
    }
  );

  const visualizerPath = useDerivedValue(() => {
    const data = processedData.value;
    const path = Skia.Path.Make();

    const gap = 3;
    const barWidth = (width - (barCount - 1) * gap) / barCount;

    data.forEach((amp, i) => {
      const barHeight = Math.max(4, amp * height * 0.85);
      const x = i * (barWidth + gap);
      const y = height - barHeight;
      const rect = Skia.XYWHRect(x, y, barWidth, barHeight);
      path.addRRect(Skia.RRectXY(rect, 4, 4));
    });

    return path;
  }, [processedData, width, height, barCount]);

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          <Path
            path={visualizerPath}
            color={hasRealData ? color : `${color}80`}
            style="fill"
          >
            <BlurMask blur={2} style="solid" />
          </Path>
        </Group>
      </Canvas>
      
      {__DEV__ && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>
            FFT Max: {debugMax.toFixed(3)} | Real: {hasRealData ? 'Y' : 'N'}
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
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 2,
    borderRadius: 2,
  },
  debugText: {
    color: '#0f0',
    fontSize: 8,
    fontFamily: 'monospace',
  },
});