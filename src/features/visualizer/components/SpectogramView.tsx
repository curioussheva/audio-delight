// src/features/visualizer/components/SpectogramView.tsx
import React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
} from "react-native";

import { Canvas, Rect, Group } from "@shopify/react-native-skia";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";

interface SpectogramViewProps {
  width?: number;
  height?: number;
  isPlaying: boolean;
  audioSessionId?: number;
  bins?: number;
  maxRows?: number;
  colorScheme?: "classic" | "thermal" | "grayscale";
  sensitivity?: number;
  showLabels?: boolean;
}

const DEFAULT_BINS = 64;
const DEFAULT_MAX_ROWS = 40;

// Palet warna (sama seperti sebelumnya)
const generateColorCache = (
  steps: number = 256,
  scheme: "classic" | "thermal" | "grayscale" = "classic",
): string[] => {
  const cache: string[] = new Array(steps);
  if (scheme === "grayscale") {
    for (let i = 0; i < steps; i++) {
      const v = Math.floor((i / (steps - 1)) * 255);
      cache[i] = `rgb(${v}, ${v}, ${v})`;
    }
  } else if (scheme === "thermal") {
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      let r, g, b;
      if (t < 0.33) {
        r = 0;
        g = Math.floor(t * 3 * 255);
        b = 255;
      } else if (t < 0.66) {
        r = Math.floor((t - 0.33) * 3 * 255);
        g = 255;
        b = 255 - Math.floor((t - 0.33) * 3 * 255);
      } else {
        r = 255;
        g = 255 - Math.floor((t - 0.66) * 3 * 128);
        b = 0;
      }
      cache[i] = `rgb(${r}, ${g}, ${b})`;
    }
  } else {
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      let r, g, b;
      if (t < 0.25) {
        r = 0;
        g = Math.floor((t / 0.25) * 255);
        b = 255;
      } else if (t < 0.5) {
        r = 0;
        g = 255;
        b = 255 - Math.floor(((t - 0.25) / 0.25) * 255);
      } else if (t < 0.75) {
        r = Math.floor(((t - 0.5) / 0.25) * 255);
        g = 255;
        b = 0;
      } else {
        r = 255;
        g = 255 - Math.floor(((t - 0.75) / 0.25) * 128);
        b = 0;
      }
      cache[i] = `rgb(${r}, ${g}, ${b})`;
    }
  }
  return cache;
};

export const SpectogramView = React.memo(
  ({
    width = Dimensions.get("window").width - 40,
    height = 200,
    isPlaying,
    audioSessionId,
    bins = DEFAULT_BINS,
    maxRows = DEFAULT_MAX_ROWS,
    colorScheme = "classic",
    sensitivity = 2.0,
    showLabels = true,
  }: SpectogramViewProps) => {
    const [grid, setGrid] = useState<number[][]>(() =>
      Array.from({ length: maxRows }, () => new Array(bins).fill(0)),
    );

    const gridRef = useRef<number[][]>(grid);
    const isServiceStarted = useRef(false);

    // Debug state untuk menampilkan max FFT
    const [debugMax, setDebugMax] = useState(0);
    const [debugSamples, setDebugSamples] = useState("");

    const colorCache = useMemo(
      () => generateColorCache(256, colorScheme),
      [colorScheme],
    );

    const cellWidth = width / bins;
    const cellHeight = height / maxRows;

    const handleFFTData = (fftData: number[]) => {
      if (!fftData || fftData.length === 0) return;

      const maxVal = Math.max(...fftData);
      const samples = fftData
        .slice(0, 5)
        .map((v) => v.toFixed(3))
        .join(", ");
      setDebugMax(maxVal);
      setDebugSamples(samples);

      // Log setiap 20 frame agar tidak spam
      if (Math.random() < 0.05) {
        console.log(
          `[SpectogramView] FFT max: ${maxVal.toFixed(4)}, samples: ${samples}`,
        );
      }

      // Resample ke jumlah bin
      const resampled = new Array(bins).fill(0);
      const step = fftData.length / bins;

      for (let i = 0; i < bins; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        let sum = 0;
        let count = 0;
        for (let j = start; j < end && j < fftData.length; j++) {
          sum += fftData[j];
          count++;
        }
        let value = count > 0 ? sum / count : 0;
        value = Math.min(1.0, value * sensitivity);
        resampled[i] = value;
      }

      // Update grid: shift rows up, add new row at bottom
      setGrid((prevGrid) => {
        const newGrid = [...prevGrid.slice(1), resampled];
        gridRef.current = newGrid;
        return newGrid;
      });
    };

    useEffect(() => {
      if (!isPlaying || !audioSessionId || audioSessionId <= 0) {
        const emptyGrid = Array.from({ length: maxRows }, () =>
          new Array(bins).fill(0),
        );
        setGrid(emptyGrid);
        gridRef.current = emptyGrid;
        setDebugMax(0);
        if (isServiceStarted.current) {
          visualizerService.stop();
          isServiceStarted.current = false;
        }
        return;
      }

      visualizerService.setDataCallback(handleFFTData);

      visualizerService.start(audioSessionId);
      isServiceStarted.current = true;

      return () => {
        visualizerService.stop();
        isServiceStarted.current = false;
      };
    }, [isPlaying, audioSessionId, bins, maxRows, sensitivity]);

    // Render rects dengan threshold rendah (0.005) agar data kecil terlihat
    const rects = useMemo(() => {
      const threshold = 0.005;
      const elements: React.ReactElement[] = [];

      for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < bins; col++) {
          const amp = grid[row][col];
          if (amp < threshold) continue;

          const colorIndex = Math.min(255, Math.floor(amp * 256));
          const color = colorCache[colorIndex];

          elements.push(
            <Rect
              key={`${row}-${col}`}
              x={col * cellWidth}
              y={row * cellHeight}
              width={cellWidth + 0.5}
              height={cellHeight + 0.5}
              color={color}
            />,
          );
        }
      }
      return elements;
    }, [grid, cellWidth, cellHeight, maxRows, bins, colorCache]);

    const hasData = grid.some((row) => row.some((amp) => amp > 0.01));

    return (
      <View style={[styles.container, { width }]}>
        {showLabels && (
          <View style={styles.header}>
            <Text style={styles.title}>SPECTROGRAM</Text>
            <View style={[styles.liveIndicator, isPlaying && styles.active]} />
          </View>
        )}

        <View style={[styles.canvasContainer, { width, height }]}>
          <Canvas style={{ width, height }}>
            <Rect x={0} y={0} width={width} height={height} color="#0A0A0F" />
            <Group>{rects}</Group>
          </Canvas>

          {/* Debug overlay di development */}
          {__DEV__ && (
            <View style={styles.debugOverlay}>
              <Text style={styles.debugText}>
                Max: {debugMax.toFixed(4)} | HasData: {hasData ? "Y" : "N"}
              </Text>
              <Text style={styles.debugText} numberOfLines={1}>
                {debugSamples}
              </Text>
            </View>
          )}

          {!hasData && isPlaying && (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.placeholderText}>Waiting for audio...</Text>
            </View>
          )}
        </View>

        {showLabels && (
          <View style={styles.footer}>
            <View style={styles.frequencyLabels}>
              <Text style={styles.label}>20 Hz</Text>
              <Text style={styles.label}>2 kHz</Text>
              <Text style={styles.label}>20 kHz</Text>
            </View>
            <View style={styles.colorBar}>
              {[0, 64, 128, 192, 255].map((idx) => (
                <View
                  key={idx}
                  style={[
                    styles.colorSegment,
                    { backgroundColor: colorCache[idx] },
                  ]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    backgroundColor: "#0A0A0F",
    padding: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#475569",
  },
  active: {
    backgroundColor: "#EF4444",
  },
  canvasContainer: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  debugOverlay: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 4,
    borderRadius: 4,
  },
  debugText: {
    color: "#0f0",
    fontSize: 8,
    fontFamily: "monospace",
  },
  placeholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(10,10,15,0.7)",
  },
  placeholderText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 8,
  },
  footer: {
    marginTop: 8,
  },
  frequencyLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "500",
  },
  colorBar: {
    height: 4,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  colorSegment: {
    flex: 1,
    height: "100%",
  },
});
