// src/features/visualizer/components/SpectrumAnalyzer.tsx
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

export interface SpectrumAnalyzerProps {
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

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
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

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));

  // FIX: hasRealData dan isPlayingSV sebagai SharedValue agar bisa dibaca worklet
  const hasRealData = useSharedValue(false);
  const isPlayingSV = useSharedValue(isPlaying);

  // Cermin hasRealData di JS thread — dipakai render label "menunggu data"
  // + opacity (baca .value SharedValue langsung di JSX itu basi, lihat
  // U-P2-02: komponen tidak re-render saat SharedValue berubah).
  const [hasRealDataState, setHasRealDataState] = useState(false);

  // U-P2-27: kegagalan polling FFT native (VisualizerService.setOnError)
  // — ditampilkan sebagai pesan di overlay, bukan sunyi. Di-reset tiap
  // sesi baru dimulai supaya kegagalan lama tidak menempel.
  const [fftError, setFftError] = useState(false);

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
  // + label "Menunggu data audio…" di bawah. hasRealData dicerminkan ke
  // state JS lewat reaction ini (hanya saat nilainya berubah) supaya label
  // + opacity mengikuti data yang sebenarnya, bukan keadaan mount.
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
    // Keputusan dihitung di JS thread dan dikirim sebagai argumen primitif.
    // JANGAN baca frameCount (ref biasa) di dalam worklet: ref yang sudah
    // diserahkan ke worklet tidak boleh diubah lagi dari JS thread —
    // Reanimated melempar warning "Tried to modify key `current`..." tiap
    // frame (20x/detik, 1089x di logcat 2026-11-10) dan worklet membaca
    // nilai basi, jadi hasRealData tidak kunjung bersih setelah hening.
    const shouldClear = !isReal && frameCount.current > 10;

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
  // kill-switch global yang mematikan polling untuk layar lain juga
  // (tab Analyzer, SpectogramView di player).
  useEffect(() => {
    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[SpectrumAnalyzer] Starting session ${audioSessionId}`);
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
        setFftError(false);
      }
    } else {
      if (isStarted.current) {
        console.log("[SpectrumAnalyzer] Stopping");
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isStarted.current = false;
        lastSessionId.current = null;
        runOnUI(() => {
          "worklet";
          freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
          prevData.value = Array(barCount).fill(0.1);
          hasRealData.value = false;
        })();
        setHasRealDataState(false);
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

  // Processed data — semua SharedValue, aman di worklet
  const processedData = useDerivedValue(() => {
    const raw = freqData.value;
    const useDummy = !hasRealData.value && isPlayingSV.value;

    if (useDummy) {
      // U-P1-29: tidak ada data real → bar DIAM di lantai, bukan sinus
      // sintetis. Label "Menunggu data audio…" dirender di JSX (state
      // hasRealDataState) supaya user tidak mengira ini spektrum live.
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

  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
    },
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
  });

  // Debug value untuk display (JS side) — derived dari SharedValue
  const debugMaxSV = useDerivedValue(() =>
    freqData.value.reduce((a, b) => Math.max(a, b), 0),
  );

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          <Path
            path={visualizerPath}
            color={color}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          >
            <BlurMask blur={2} style="solid" />
          </Path>
        </Group>
      </Canvas>

      {/* U-P1-29: lagu diputar tapi FFT belum/tidak mengembalikan data —
          katakan jujur, jangan animasikan bar palsu. */}
      {isPlaying && !hasRealDataState && (
        <View style={styles.waitingOverlay} pointerEvents="none">
          <Text style={[styles.waitingText, { color }]}>
            {fftError
              ? "Gagal membaca data visualizer — coba restart lagu."
              : "Menunggu data audio…"}
          </Text>
        </View>
      )}

      {__DEV__ && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>
            FFT Max: {debugMaxSV.value.toFixed(3)} | Real:{" "}
            {hasRealData.value ? "Y" : "N"}
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
