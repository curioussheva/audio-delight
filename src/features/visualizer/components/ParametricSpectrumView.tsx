// src/features/visualizer/components/ParametricSpectrumView.tsx
//
// Bar spektrum parametrik untuk MAIN PLAYER — menggantikan SpectogramView
// (waterfall) di sana sejak 2026-11-17. Beda dengan tab Analyzer:
// - Tanpa sumbu/grid/label dB, tanpa peak hold, tanpa pill CLIP, tanpa
//   scroll — tampilan minimal yang muat di ruang 120px main player.
// - Warna bar gradasi BIRU→MERAH mengikuti dB (bukan hijau/kuning/merah
//   Analyzer): biru < -60, cyan -60..-40, hijau -40..-20, kuning -20..-12,
//   oranye -12..-3, merah >= -3 dB (lihat parametricDbZone di
//   @/features/visualizer/api/analyzerSpectrum).
// - SINGLE-CHANNEL (mono): satu array FFT campuran dari
//   VisualizerService.getFFTData(). BUKAN dobel channel L/R —
//   dual-channel butuh FFT native per channel (follow-up, bukan di sini).
//
// Hemat resource (keputusan csheva 2026-11-17 — pertimbangkan pemakaian
// resources dulu):
// - Data + processed hidup di SharedValue (UI thread), SATU Path per zona
//   warna, TANPA setState per frame, TANPA BlurMask, TANPA ribuan elemen
//   React per frame (kesalahan waterfall lama yang sudah diperbaiki).
// - Bar count 48 (sama seperti Analyzer), bukan 128.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Dimensions, Text } from "react-native";

import { Canvas, Path, Skia, Group } from "@shopify/react-native-skia";

import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  runOnUI,
  runOnJS,
} from "react-native-reanimated";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import {
  PARAMETRIC_COLOR_BLUE,
  PARAMETRIC_COLOR_CYAN,
  PARAMETRIC_COLOR_GREEN,
  PARAMETRIC_COLOR_ORANGE,
  PARAMETRIC_COLOR_RED,
  PARAMETRIC_COLOR_YELLOW,
  parametricDbZone,
  valueToDb,
} from "@/features/visualizer/api/analyzerSpectrum";

export interface ParametricSpectrumViewProps {
  width?: number;
  height?: number;
  barCount?: number;
  backgroundColor?: string;
  sensitivity?: number;
  isPlaying: boolean;
  audioSessionId?: number;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

// Bar digambar setinggi maks 85% area (sama seperti AnalyzerSpectrum) —
const BAR_HEIGHT_FACTOR = 0.85;

export const ParametricSpectrumView: React.FC<
  ParametricSpectrumViewProps
> = ({
  width = Dimensions.get("window").width - 40,
  height = 120,
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  backgroundColor = "transparent",
  sensitivity = 2.0,
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
  // + opacity (baca .value SharedValue langsung di JSX itu basi).
  const [hasRealDataState, setHasRealDataState] = useState(false);

  // U-P2-27: kegagalan polling FFT native (VisualizerService.setOnError)
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
  // (tab Analyzer, SpectogramView).
  useEffect(() => {
    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[ParametricSpectrumView] Starting session ${audioSessionId}`);
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
        console.log("[ParametricSpectrumView] Stopping");
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

  // Processed data — semua SharedValue, aman di worklet.
  // (Pemetaan sama seperti AnalyzerSpectrum: resample log dari 128 bin
  // mentah ke barCount, falloff 0.85, sensitivity + treble tilt supaya
  // bar tetap hidup untuk konten tenang.)
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

  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      prevData.value = [...current];
    },
  );

  // Geometri bar (dipakai semua path zona) — worklet karena dipanggil
  // dari useDerivedValue. Tanpa direktif ini, Reanimated throw di runtime.
  const barGeometry = useCallback(
    (data: number[]) => {
      "worklet";
      const gap = 3;
      const barWidth = (width - (barCount - 1) * gap) / barCount;
      return data.map((amp, i) => {
        const barHeight = Math.max(4, amp * height * BAR_HEIGHT_FACTOR);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        return { rect: Skia.XYWHRect(x, y, barWidth, barHeight), amp };
      });
    },
    [width, barCount, height],
  );

  // Bar per zona warna parametrik (biru→merah) — satu Path per zona,
  // zona dari dB bar itu (valueToDb). TANPA BlurMask (mahal) — bar
  // dibiarkan tajam supaya hemat resource di main player.
  const barsBluePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "blue") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsCyanPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "cyan") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsGreenPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "green") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsYellowPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "yellow") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsOrangePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "orange") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsRedPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (parametricDbZone(valueToDb(amp)) === "red") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      {/* R10: Canvas Skia tidak punya ukuran intrinsik — `flex: 1` di
          container `alignItems: "center"` memberi tinggi 120px tapi lebar
          0 (sumbu silang ikut alignItems), sehingga tidak menggambar
          apa-apa. Ukuran eksplisit seperti SpectogramView. */}
      <Canvas style={{ width, height }}>
        <Group>
          <Path
            path={barsBluePath}
            color={PARAMETRIC_COLOR_BLUE}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
          <Path
            path={barsCyanPath}
            color={PARAMETRIC_COLOR_CYAN}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
          <Path
            path={barsGreenPath}
            color={PARAMETRIC_COLOR_GREEN}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
          <Path
            path={barsYellowPath}
            color={PARAMETRIC_COLOR_YELLOW}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
          <Path
            path={barsOrangePath}
            color={PARAMETRIC_COLOR_ORANGE}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
          <Path
            path={barsRedPath}
            color={PARAMETRIC_COLOR_RED}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          />
        </Group>
      </Canvas>

      {/* U-P1-29: lagu diputar tapi FFT belum/tidak mengembalikan data —
          katakan jujur, jangan animasikan bar palsu. */}
      {isPlaying && !hasRealDataState && (
        <View style={styles.waitingOverlay} pointerEvents="none">
          <Text style={styles.waitingText}>
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
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
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
    color: "#94A3B8",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
});
