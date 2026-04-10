// src/features/visualizer/components/SpectogramView.tsx
import React, { useEffect, useRef, memo, useCallback, useState } from "react";
import { View, StyleSheet, Dimensions, Text } from "react-native";
import {
  Canvas,
  Rect,
  Skia,
  Group,
  useCanvasRef,
} from "@shopify/react-native-skia";
import { useSharedValue } from "react-native-reanimated";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";

interface SpectogramViewProps {
  width?: number;
  height?: number;
  isPlaying: boolean;
  audioSessionId: number;
}

const MAX_ROWS = 35;
const BINS = 48;
const LISTENER_ID = 42; // unique id for this component's listener

const createEmptyGrid = (): number[][] =>
  Array.from({ length: MAX_ROWS }, () => new Array(BINS).fill(0));

export const SpectogramView = memo(
  ({
    width = Dimensions.get("window").width - 40,
    height = 180,
    isPlaying,
    audioSessionId,
  }: SpectogramViewProps) => {
    const canvasRef = useCanvasRef();
    const gridData = useSharedValue<number[][]>(createEmptyGrid());
    // Use state to drive re-renders for declarative Skia
    const [drawData, setDrawData] = useState<number[][]>(createEmptyGrid());

    const cellWidth = width / BINS;
    const cellHeight = height / MAX_ROWS;
    const colorCache = useRef<ColorCache>(buildColorCache());

    useEffect(() => {
      if (!isPlaying) {
        const empty = createEmptyGrid();
        gridData.value = empty;
        setDrawData(empty);
        return;
      }

      const initialized = visualizerService.initialize((newData) => {
        gridData.value = newData as unknown as number[][];
        setDrawData(newData as unknown as number[][]);
      });

      if (!initialized) {
        console.warn(
          "[SpectogramView] Failed to initialize visualizer service",
        );
        return;
      }

      visualizerService.start(0);
      return () => {
        visualizerService.stop();
      };
    }, [isPlaying, audioSessionId]);

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>LIVE SPECTROGRAM</Text>
          <View style={[styles.liveIndicator, !isPlaying && styles.inactive]} />
        </View>

        <Canvas ref={canvasRef} style={{ width, height }}>
          <Rect x={0} y={0} width={width} height={height} color="#020617" />
          <Group>
            {drawData.flatMap((row, t) =>
              row.map((amp, f) => {
                if (amp < 0.05) return null;
                const color = colorCache.current.getColorString(amp);
                return (
                  <Rect
                    key={`${t}-${f}`}
                    x={f * cellWidth}
                    y={t * cellHeight}
                    width={cellWidth + 0.4}
                    height={cellHeight + 0.4}
                    color={color}
                  />
                );
              }),
            )}
          </Group>
        </Canvas>

        <View style={styles.footer}>
          <View style={styles.labels}>
            <Text style={styles.label}>20Hz</Text>
            <Text style={styles.label}>
              {((BINS / 2) * (22050 / BINS)) >> 0}Hz
            </Text>
            <Text style={styles.label}>22kHz</Text>
          </View>
          <View style={styles.gradientBar}>
            <View
              style={[styles.gradientSegment, { backgroundColor: "#0000FF" }]}
            />
            <View
              style={[styles.gradientSegment, { backgroundColor: "#00FF00" }]}
            />
            <View
              style={[styles.gradientSegment, { backgroundColor: "#FFFF00" }]}
            />
            <View
              style={[styles.gradientSegment, { backgroundColor: "#FF0000" }]}
            />
          </View>
        </View>
      </View>
    );
  },
);

// ============================================================================
// Color Cache
// ============================================================================

class ColorCache {
  private cache: string[]; // CSS strings for declarative Skia

  constructor(steps: number = 256) {
    this.cache = new Array(steps);
    for (let i = 0; i < steps; i++) {
      this.cache[i] = this.calculateColor(i / (steps - 1));
    }
  }

  private calculateColor(t: number): string {
    if (t < 0.25) {
      const g = Math.floor((t / 0.25) * 255);
      return `rgb(0, ${g}, 255)`;
    } else if (t < 0.5) {
      const b = 255 - Math.floor(((t - 0.25) / 0.25) * 255);
      return `rgb(0, 255, ${b})`;
    } else if (t < 0.75) {
      const r = Math.floor(((t - 0.5) / 0.25) * 255);
      return `rgb(${r}, 255, 0)`;
    } else {
      const g = 255 - Math.floor(((t - 0.75) / 0.25) * 255);
      return `rgb(255, ${g}, 0)`;
    }
  }

  getColorString(amplitude: number): string {
    const index = Math.min(
      this.cache.length - 1,
      Math.max(0, Math.floor(amplitude * this.cache.length)),
    );
    return this.cache[index];
  }
}

const buildColorCache = () => new ColorCache(256);

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    color: "#38BDF8",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  inactive: {
    backgroundColor: "#475569",
  },
  footer: {
    marginTop: 8,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "700",
  },
  gradientBar: {
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  gradientSegment: {
    flex: 1,
  },
});
