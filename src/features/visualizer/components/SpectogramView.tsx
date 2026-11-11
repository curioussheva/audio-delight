// src/features/visualizer/components/SpectogramView.tsx
//
// REWRITE SharedValue (2026-11-11) — menggantikan arsitektur setState.
//
// Masalah lama: tiap frame FFT (~20 Hz) memanggil 3 setState
// (debugMax, debugSamples, grid) + membangun ulang ≤2560 elemen <Rect>
// Skia lewat React — rekonsiliasi React tiap 100 ms + tanpa smoothing
// temporal membuat spektrogram tampak patah/acak.
//
// Arsitektur baru:
// - Grid hidup di SharedValue (UI thread). Callback FFT (JS thread) hanya
//   menulis gridSV.value — TIDAK ADA setState di jalur panas.
// - useDerivedValue (UI thread) mengubah grid menjadi SATU SkImage piksel
//   (64×40 RGBA) lewat Skia.Image.MakeImage; <Image> menampilkannya.
//   React tidak pernah me-render ulang saat audio jalan.
// - Smoothing temporal: serang instan, luruh lambat (EMA 0.35 saat turun)
//   supaya nilai antar-frame tidak melompat acak.
// - Debug overlay + placeholder tetap React state, tapi di-batch jadi
//   SATU setState tiap 10 frame (~2 Hz).
import React from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
} from "react-native";
import { useSharedValue, useDerivedValue } from "react-native-reanimated";

import {
  Canvas,
  Image as SkiaImage,
  Skia,
  ColorType,
  AlphaType,
} from "@shopify/react-native-skia";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import {
  DEFAULT_SPECTROGRAM_SAMPLE_RATE,
  frequencyAxisLabels,
} from "@/features/visualizer/api/frequencyAxis";

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
  /**
   * Laju sampel sesi FFT (Hz) — menentukan Nyquist sumbu-x. Default
   * 48 kHz; native tidak mengekspos laju sesi ke JS, jadi pemanggil yang
   * tahu laju output sebenarnya boleh mengopernya.
   */
  sampleRate?: number;
}

const DEFAULT_BINS = 64;
const DEFAULT_MAX_ROWS = 40;

// Warna latar sel hening (sama dengan background canvas lama #0A0A0F).
const BG_R = 10;
const BG_G = 10;
const BG_B = 15;

// Ambang tampil: di bawah ini sel dianggap hening (bukan biru palet).
const CELL_THRESHOLD = 0.005;

// Smoothing temporal: faktor luruh saat nilai TURUN (0.35/frame @20 Hz).
// Naik selalu instan supaya transient tidak tertunda.
const DECAY = 0.35;

// Palet warna sebagai tabel RGBA (256 × 4 byte) — matematika warna sama
// dengan generateColorCache lama, hanya output-nya byte, bukan string.
const generatePalette = (
  scheme: "classic" | "thermal" | "grayscale" = "classic",
): Uint8Array => {
  const table = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0;
    let g = 0;
    let b = 0;
    if (scheme === "grayscale") {
      const v = Math.floor(t * 255);
      r = v;
      g = v;
      b = v;
    } else if (scheme === "thermal") {
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
    } else {
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
    }
    table[i * 4] = r;
    table[i * 4 + 1] = g;
    table[i * 4 + 2] = b;
    table[i * 4 + 3] = 255;
  }
  return table;
};

// Palet string (untuk color bar di footer) — dipertahankan dari versi lama.
const generateColorCache = (
  steps: number = 256,
  scheme: "classic" | "thermal" | "grayscale" = "classic",
): string[] => {
  const palette = generatePalette(scheme);
  const cache: string[] = new Array(steps);
  for (let i = 0; i < steps; i++) {
    cache[i] = `rgb(${palette[i * 4]}, ${palette[i * 4 + 1]}, ${palette[i * 4 + 2]})`;
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
    sampleRate = DEFAULT_SPECTROGRAM_SAMPLE_RATE,
  }: SpectogramViewProps) => {
    const makeEmptyGrid = useCallback(
      (): number[][] =>
        Array.from({ length: maxRows }, () => new Array(bins).fill(0)),
      [bins, maxRows],
    );

    // Grid hidup di UI thread — ditulis dari callback FFT, dibaca oleh
    // useDerivedValue di bawah. Tidak ada setState di jalur ini.
    const gridSV = useSharedValue<number[][]>(makeEmptyGrid());

    // Baris sebelumnya (untuk smoothing) + penghitung frame (debug 2 Hz).
    const prevRowRef = useRef<number[]>(new Array(bins).fill(0));
    const frameCountRef = useRef(0);

    const isServiceStarted = useRef(false);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Debug overlay — SATU state, di-update ~2 Hz (tiap 10 frame).
    const [debug, setDebug] = useState({
      max: 0,
      samples: "",
      hasData: false,
    });

    const palette = useMemo(
      () => generatePalette(colorScheme),
      [colorScheme],
    );
    const colorCache = useMemo(
      () => generateColorCache(256, colorScheme),
      [colorScheme],
    );

    // U-P1-34: label sumbu-x LINEAR 0–Nyquist (bin di-resample linear,
    // bukan log). 5 titik berjarak sama = 0 / 6 / 12 / 18 / 24 kHz pada
    // 48 kHz; ikut sampleRate bila pemanggil mengopernya.
    const freqLabels = useMemo(
      () => frequencyAxisLabels(sampleRate),
      [sampleRate],
    );

    // Grid (SharedValue) -> SkImage piksel, semuanya di UI thread.
    // Canvas me-render ulang gambar ini tanpa menyentuh React.
    const skImage = useDerivedValue(() => {
      "worklet";
      const grid = gridSV.value;
      const bytes = new Uint8Array(bins * maxRows * 4);
      for (let r = 0; r < maxRows; r++) {
        const row = grid[r];
        for (let c = 0; c < bins; c++) {
          const amp = row ? (row[c] ?? 0) : 0;
          const o = (r * bins + c) * 4;
          if (amp < CELL_THRESHOLD) {
            bytes[o] = BG_R;
            bytes[o + 1] = BG_G;
            bytes[o + 2] = BG_B;
            bytes[o + 3] = 255;
          } else {
            const p = Math.min(255, Math.floor(amp * 256)) * 4;
            bytes[o] = palette[p];
            bytes[o + 1] = palette[p + 1];
            bytes[o + 2] = palette[p + 2];
            bytes[o + 3] = 255;
          }
        }
      }
      return Skia.Image.MakeImage(
        {
          width: bins,
          height: maxRows,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Opaque,
        },
        Skia.Data.fromBytes(bytes),
        bins * 4,
      );
    }, [palette, bins, maxRows]);

    const handleFFTData = useCallback(
      (fftData: number[]) => {
        if (!fftData || fftData.length === 0) return;

        // Resample ke jumlah bin.
        const step = fftData.length / bins;
        const fresh = new Array(bins).fill(0);
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
          fresh[i] = value;
        }

        // Smoothing temporal: naik instan, turun meluruh (EMA 0.35).
        const prev = prevRowRef.current;
        const smoothed = fresh.map((v, i) =>
          v >= prev[i] ? v : prev[i] + (v - prev[i]) * DECAY,
        );
        prevRowRef.current = smoothed;

        // Geser grid ke atas, baris baru di bawah — tulis ke SharedValue.
        gridSV.value = [...gridSV.value.slice(1), smoothed];

        // Debug: satu setState tiap 10 frame (~2 Hz).
        frameCountRef.current += 1;
        if (frameCountRef.current % 10 === 0) {
          const maxVal = Math.max(...fresh);
          setDebug({
            max: maxVal,
            samples: fresh
              .slice(0, 5)
              .map((v) => v.toFixed(3))
              .join(", "),
            hasData: maxVal > 0.01,
          });
        }
      },
      [bins, sensitivity],
    );

    useEffect(() => {
      if (!isPlaying || !audioSessionId || audioSessionId <= 0) {
        gridSV.value = makeEmptyGrid();
        prevRowRef.current = new Array(bins).fill(0);
        frameCountRef.current = 0;
        setDebug({ max: 0, samples: "", hasData: false });
        // MULTI-SUBSCRIBER (2026-11-10): lepas subscription sendiri saja —
        // jangan stop() service, itu kill-switch global yang mematikan
        // polling untuk tab Analyzer/Visualizer juga.
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isServiceStarted.current = false;
        return;
      }

      unsubscribeRef.current?.();
      unsubscribeRef.current =
        visualizerService.setDataCallback(handleFFTData);

      visualizerService.start(audioSessionId);
      isServiceStarted.current = true;

      return () => {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isServiceStarted.current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, audioSessionId, bins, maxRows, sensitivity, handleFFTData]);

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
            <SkiaImage
              image={skImage}
              x={0}
              y={0}
              width={width}
              height={height}
              fit="fill"
            />
          </Canvas>

          {/* Debug overlay di development */}
          {__DEV__ && (
            <View style={styles.debugOverlay}>
              <Text style={styles.debugText}>
                Max: {debug.max.toFixed(4)} | HasData:{" "}
                {debug.hasData ? "Y" : "N"}
              </Text>
              <Text style={styles.debugText} numberOfLines={1}>
                {debug.samples}
              </Text>
            </View>
          )}

          {!debug.hasData && isPlaying && (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.placeholderText}>Waiting for audio...</Text>
            </View>
          )}
        </View>

        {showLabels && (
          <View style={styles.footer}>
            <View style={styles.frequencyLabels}>
              {freqLabels.map((label) => (
                <Text key={label} style={styles.label}>
                  {label}
                </Text>
              ))}
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
