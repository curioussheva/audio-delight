// src/features/visualizer/components/AnalyzerSpectrum.tsx
//
// Spektrum analyzer live ala Neutron untuk tab Analyzer — menggantikan
// SpectrumAnalyzer (bar polos) di tab itu saja. Tab Visualizer sudah
// dihapus (keputusan csheva 2026-11-13); SpectrumAnalyzer di sana ikut
// tidak terpakai.
//
// Beda dengan SpectrumAnalyzer:
// - Sumbu frekuensi berlabel (Hz, skala log 20 Hz–20 kHz) di bawah.
// - Skala dB + garis grid (-10/-20/-40/-60/-80 dB) di kiri.
// - Peak hold per bar (tanda putih yang meluruh pelan).
// - Pembacaan frekuensi dominan (diperbarui ~2 Hz, bukan tiap frame).
//
// Data sama: VisualizerService -> getFFTData() Kotlin (128 bin 0..1,
// log-scaled; dB = -80 + v*70). Matematika sumbu ada di
// @/features/visualizer/api/analyzerSpectrum.
//
// Arsitektur render sama seperti SpectrumAnalyzer/SpectogramView:
// data + peak hidup di SharedValue (UI thread), TIDAK ADA setState di
// jalur panas — kecuali readout frekuensi dominan yang di-throttle.

import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native-reanimated";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import {
  ANALYZER_DB_GRID,
  ANALYZER_FREQ_LABELS,
  binCenterFreq,
  dbToValue,
  dominantBin,
  formatFreq,
  freqToFraction,
} from "@/features/visualizer/api/analyzerSpectrum";

export interface AnalyzerSpectrumProps {
  width?: number;
  height?: number;
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  isPlaying: boolean;
  audioSessionId?: number;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

// Ruang untuk label sumbu: kiri untuk dB, bawah untuk Hz.
const DB_GUTTER = 30;
const FREQ_STRIP = 18;

// Peluruhan peak hold per frame (~0.2/detik pada polling 10 Hz).
const PEAK_DECAY = 0.02;

// Bar digambar setinggi maks 85% area (sama seperti SpectrumAnalyzer) —
// jadi puncak 0 dB (-10 dB di skala kita) berada di 15% dari atas.
const BAR_HEIGHT_FACTOR = 0.85;

export const AnalyzerSpectrum: React.FC<AnalyzerSpectrumProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 2.2,
  isPlaying,
  audioSessionId,
}) => {
  const barCount = Math.max(
    MIN_BAR_COUNT,
    Math.min(MAX_BAR_COUNT, rawBarCount),
  );

  const barsWidth = Math.max(1, width - DB_GUTTER);
  const barsHeight = Math.max(1, height - FREQ_STRIP);

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));
  const peakData = useSharedValue<number[]>(Array(barCount).fill(0.05));

  // FIX: hasRealData dan isPlayingSV sebagai SharedValue agar bisa dibaca worklet
  const hasRealData = useSharedValue(false);
  const isPlayingSV = useSharedValue(isPlaying);

  // Cermin hasRealData di JS thread — dipakai render label "menunggu data"
  // + opacity (baca .value SharedValue langsung di JSX itu basi).
  const [hasRealDataState, setHasRealDataState] = useState(false);

  // U-P2-27: kegagalan polling FFT native (VisualizerService.setOnError)
  const [fftError, setFftError] = useState(false);

  // Frekuensi dominan — di-throttle (bukan tiap frame) supaya tidak
  // setState 10x/detik; teks kecil ini satu-satunya state JS yang berubah
  // saat audio jalan.
  const [dominantFreq, setDominantFreq] = useState<string | null>(null);

  useEffect(() => {
    return visualizerService.setOnError(() => setFftError(true));
  }, []);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isStarted = useRef(false);
  const lastSessionId = useRef<number | null>(null);
  const frameCount = useRef(0);

  // Sync isPlaying prop → SharedValue
  useEffect(() => {
    isPlayingSV.value = isPlaying;
  }, [isPlaying]);

  // U-P1-29: JANGAN tampilkan animasi sinus palsu seolah spektrum live
  // saat FFT native tidak mengembalikan data. Bar diam di lantai (0.05)
  // + label "Menunggu data audio…" di bawah.
  useAnimatedReaction(
    () => hasRealData.value,
    (real, prevReal) => {
      if (real !== prevReal) {
        runOnJS(setHasRealDataState)(real);
      }
    },
  );

  // Callback data — stabil (hanya memakai ref/SharedValue), jadi bisa
  // dipakai ulang tiap kali effect start/stop subscribe ulang.
  const handleData = useCallback((newData: number[]) => {
    if (!newData || newData.length === 0) return;

    frameCount.current++;
    const maxVal = Math.max(...newData);
    const isReal = maxVal > 0.01;
    const shouldClear = !isReal && frameCount.current > 10;

    // Frekuensi dominan: hitung di JS thread, paling sering 2 Hz saja
    // (tiap 5 frame pada polling 10 Hz) dan hanya bila berubah — supaya
    // tidak setState tiap frame.
    if (isReal && frameCount.current % 5 === 0) {
      const bin = dominantBin(newData);
      if (bin >= 0) {
        const label = formatFreq(binCenterFreq(bin, newData.length));
        setDominantFreq((prev) => (prev === label ? prev : label));
      }
    } else if (!isReal && frameCount.current % 5 === 0) {
      setDominantFreq((prev) => (prev === null ? prev : null));
    }

    runOnUI((data: number[], real: boolean, clear: boolean) => {
      "worklet";
      freqData.value = data;
      if (real) {
        hasRealData.value = true;
      } else if (clear) {
        hasRealData.value = false;
      }
    })(newData, isReal, shouldClear);
  }, []);

  // Start/Stop berdasarkan isPlaying dan audioSessionId.
  //
  // MULTI-SUBSCRIBER (2026-11-10): layar ini subscribe saat butuh data dan
  // unsubscribe saat tidak — JANGAN panggil visualizerService.stop(), itu
  // kill-switch global yang mematikan polling untuk layar lain juga.
  useEffect(() => {
    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[AnalyzerSpectrum] Starting session ${audioSessionId}`);
        unsubscribeRef.current?.();
        unsubscribeRef.current =
          visualizerService.setDataCallback(handleData);
        visualizerService.start(audioSessionId);
        isStarted.current = true;
        lastSessionId.current = audioSessionId;
        frameCount.current = 0;
        runOnUI(() => {
          "worklet";
          hasRealData.value = false;
        })();
        setHasRealDataState(false);
        setDominantFreq(null);
        setFftError(false);
      }
    } else {
      if (isStarted.current) {
        console.log("[AnalyzerSpectrum] Stopping");
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isStarted.current = false;
        lastSessionId.current = null;
        runOnUI(() => {
          "worklet";
          freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
          prevData.value = Array(barCount).fill(0.1);
          peakData.value = Array(barCount).fill(0.05);
          hasRealData.value = false;
        })();
        setHasRealDataState(false);
        setDominantFreq(null);
      }
    }
  }, [isPlaying, audioSessionId, barCount, handleData]);

  // Cleanup saat unmount: lepas subscription (bukan stop() global).
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  // Processed data — semua SharedValue, aman di worklet.
  // (Pemetaan sama seperti SpectrumAnalyzer: resample log dari 128 bin
  // mentah ke barCount, sensitivity, boost ujung atas, falloff 0.85.)
  const processedData = useDerivedValue(() => {
    const raw = freqData.value;
    const useDummy = !hasRealData.value && isPlayingSV.value;

    if (useDummy) {
      return Array(barCount).fill(0.05);
    }

    if (!raw || raw.length === 0) return Array(barCount).fill(0.1);

    const result = new Array(barCount).fill(0);
    const falloff = 0.85;

    for (let i = 0; i < barCount; i++) {
      const t = i / (barCount - 1);
      const logT = Math.pow(t, 1.2);
      const startIdx = Math.floor(logT * (raw.length - 1));
      const endIdx = Math.min(raw.length - 1, startIdx + 8);

      let sum = 0,
        count = 0;
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

  // Peak hold + prevData: tiap frame, peak = maks(nilai, peak - decay).
  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
      const next = [...peakData.value];
      for (let i = 0; i < current.length; i++) {
        const cur = current[i] ?? 0.05;
        const prev = next[i] ?? 0.05;
        next[i] = Math.max(cur, prev - PEAK_DECAY);
      }
      peakData.value = next;
    },
  );

  const barsPath = useDerivedValue(() => {
    const data = processedData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (barsWidth - (barCount - 1) * gap) / barCount;

    data.forEach((amp, i) => {
      const barHeight = Math.max(4, amp * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = barsHeight - barHeight;
      const rect = Skia.XYWHRect(x, y, barWidth, barHeight);
      path.addRRect(Skia.RRectXY(rect, 4, 4));
    });

    return path;
  });

  // Tanda peak hold: garis pendek di atas tiap bar.
  const peakPath = useDerivedValue(() => {
    const peaks = peakData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (barsWidth - (barCount - 1) * gap) / barCount;

    peaks.forEach((peak, i) => {
      const peakHeight = Math.max(0, peak * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = Math.max(0, barsHeight - peakHeight - 2);
      path.addRect(Skia.XYWHRect(x, y, barWidth, 3));
    });

    return path;
  });

  // Grid: garis horizontal dB + garis vertikal di frekuensi berlabel.
  // Statis (hanya bergantung pada ukuran), tapi dibangun di worklet supaya
  // konsisten dengan path lain.
  const gridPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const db of ANALYZER_DB_GRID) {
      const v = dbToValue(db);
      const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * v);
      path.moveTo(0, Math.min(barsHeight - 0.5, y));
      path.lineTo(barsWidth, Math.min(barsHeight - 0.5, y));
    }
    for (const freq of ANALYZER_FREQ_LABELS) {
      const x = freqToFraction(freq) * barsWidth;
      path.moveTo(x, 0);
      path.lineTo(x, barsHeight);
    }
    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      {/* Label dB (kiri) — statis, React biasa. */}
      <Text style={[styles.dbCaption, { color }]}>dB</Text>
      {ANALYZER_DB_GRID.map((db) => {
        const v = dbToValue(db);
        const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * v);
        return (
          <Text
            key={`db-${db}`}
            style={[
              styles.dbLabel,
              { top: Math.min(barsHeight - 7, Math.max(0, y - 6)) },
            ]}
          >
            {db}
          </Text>
        );
      })}

      {/* Area bar + grid. */}
      <View
        style={{
          position: "absolute",
          left: DB_GUTTER,
          top: 0,
          width: barsWidth,
          height: barsHeight,
        }}
      >
        <Canvas style={{ flex: 1 }}>
          <Group>
            <Path
              path={gridPath}
              color="#FFFFFF"
              style="stroke"
              strokeWidth={0.5}
              opacity={0.18}
            />
            <Path
              path={barsPath}
              color={color}
              style="fill"
              opacity={hasRealDataState ? 1 : 0.5}
            >
              <BlurMask blur={2} style="solid" />
            </Path>
            <Path path={peakPath} color="#FFFFFF" style="fill" opacity={0.9} />
          </Group>
        </Canvas>
      </View>

      {/* Label Hz (bawah) — statis, React biasa. */}
      {ANALYZER_FREQ_LABELS.map((freq) => {
        const x = DB_GUTTER + freqToFraction(freq) * barsWidth;
        const left = Math.max(0, Math.min(width - 36, x - 18));
        return (
          <Text key={`hz-${freq}`} style={[styles.hzLabel, { left }]}>
            {formatFreq(freq)}
          </Text>
        );
      })}

      {/* Frekuensi dominan — di-throttle ~2 Hz di handleData. */}
      {hasRealDataState && dominantFreq && (
        <View style={styles.dominantPill} pointerEvents="none">
          <Text style={[styles.dominantText, { color }]}>
            Dominan {dominantFreq}
          </Text>
        </View>
      )}

      {/* U-P1-29: lagu diputar tapi FFT belum/tidak mengembalikan data —\n          katakan jujur, jangan animasikan bar palsu. */}
      {isPlaying && !hasRealDataState && (
        <View style={styles.waitingOverlay} pointerEvents="none">
          <Text style={[styles.waitingText, { color }]}>
            {fftError
              ? "Gagal membaca data visualizer — coba restart lagu."
              : "Menunggu data audio…"}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  dbCaption: {
    position: "absolute",
    left: 0,
    top: 0,
    fontSize: 9,
    fontWeight: "600",
  },
  dbLabel: {
    position: "absolute",
    left: 0,
    width: 26,
    textAlign: "right",
    fontSize: 9,
    color: "#888888",
  },
  hzLabel: {
    position: "absolute",
    bottom: 0,
    width: 36,
    textAlign: "center",
    fontSize: 9,
    color: "#888888",
  },
  dominantPill: {
    position: "absolute",
    top: 4,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dominantText: {
    fontSize: 10,
    fontWeight: "600",
  },
  waitingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  waitingText: {
    fontSize: 13,
    fontWeight: "500",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
});
