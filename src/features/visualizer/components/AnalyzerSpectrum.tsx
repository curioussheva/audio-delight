// src/features/visualizer/components/AnalyzerSpectrum.tsx
//
// Spektrum analyzer live ala Neutron untuk tab Analyzer — menggantikan
// SpectrumAnalyzer (bar polos) di tab itu saja. Tab Visualizer sudah
// dihapus (keputusan csheva 2026-11-13); SpectrumAnalyzer di sana ikut
// tidak terpakai.
//
// Beda dengan SpectrumAnalyzer:
// - Sumbu frekuensi berlabel (Hz, skala log 20 Hz–Nyquist stream).
// - Skala dB FULL SCALE (-80..0 dB) + garis grid + garis 0 dB merah.
// - Peak hold per bar (putih; MERAH bila peak >= -1 dB).
// - Warna bar per zona dB: hijau < -12 dB, kuning -12..-3 dB, merah >= -3 dB.
// - Pill CLIP yang LATCH (tetap menyala) saat ada bin >= -1 dB; ketuk
//   untuk clear. Frekuensi dominan (diperbarui ~2 Hz, bukan tiap frame).
// - Scroll horizontal: konten ~2x lebar tampak supaya bar lebih lebar dan
//   detail treble bisa digeser; label dB tetap diam di luar scroll.
//
// Data: VisualizerService -> getFFTData() Kotlin (128 bin 0..1, log-scaled;
// dB = -80 + v*80 sejak full-scale 2026-11-14; DULU -80 + v*70 dengan
// ceiling -10 sehingga bar terpotong). Matematika sumbu ada di
// @/features/visualizer/api/analyzerSpectrum.
//
// Arsitektur render sama seperti SpectrumAnalyzer/SpectogramView:
// data + peak hidup di SharedValue (UI thread), TIDAK ADA setState di
// jalur panas — kecuali readout frekuensi dominan + latch CLIP yang
// di-throttle.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";

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
  ANALYZER_COLOR_CLIP,
  ANALYZER_COLOR_LOW,
  ANALYZER_COLOR_WARN,
  ANALYZER_DB_GRID,
  CLIP_DB,
  binCenterFreq,
  dbToValue,
  dbZone,
  dominantBin,
  formatFreq,
  freqLabelsFor,
  freqToFraction,
  valueToDb,
} from "@/features/visualizer/api/analyzerSpectrum";

export interface AnalyzerSpectrumProps {
  width?: number;
  height?: number;
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  /** Bila true: tanpa sensitivity dan tanpa treble tilt — bar mencerminkan
   *  nilai dB apa adanya (untuk analyzer; default false = perilaku lama). */
  flatResponse?: boolean;
  /** Laju stream aktual (Hz) dari useBitPerfectStatus; menentukan Nyquist
   *  sumbu frekuensi. Default 48 kHz. */
  sampleRate?: number;
  isPlaying: boolean;
  audioSessionId?: number;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

// Ruang untuk label sumbu: kiri untuk dB, bawah untuk Hz.
const DB_GUTTER = 30;
const FREQ_STRIP = 18;

// Lebar minimum tiap bar (px) — menentukan lebar konten scroll.
const MIN_BAR_WIDTH = 14;

// Peluruhan peak hold per frame (~0.2/detik pada polling 10 Hz).
const PEAK_DECAY = 0.02;

// Bar digambar setinggi maks 85% area (sama seperti SpectrumAnalyzer) —
// jadi puncak 0 dB berada di 15% dari atas, tepat di garis grid 0 dB.
const BAR_HEIGHT_FACTOR = 0.85;

export const AnalyzerSpectrum: React.FC<AnalyzerSpectrumProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 2.2,
  flatResponse = false,
  sampleRate = 48000,
  isPlaying,
  audioSessionId,
}) => {
  const barCount = Math.max(
    MIN_BAR_COUNT,
    Math.min(MAX_BAR_COUNT, rawBarCount),
  );

  const barsWidth = Math.max(1, width - DB_GUTTER);
  const barsHeight = Math.max(1, height - FREQ_STRIP);
  // Konten scroll: minimal selebar viewport, atau barCount x lebar minimum.
  const contentWidth = Math.max(barsWidth, barCount * MIN_BAR_WIDTH);

  // Nyquist stream aktual — label Hz mengikuti laju (44,1/48/96 kHz).
  const freqMax = (sampleRate > 0 ? sampleRate : 48000) / 2;
  const freqLabels = useMemo(() => freqLabelsFor(freqMax), [freqMax]);

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));
  const peakData = useSharedValue<number[]>(Array(barCount).fill(0.05));
  // Laju untuk worklet (prop bisa berubah saat reopen ganti laju file).
  const sampleRateSV = useSharedValue(sampleRate);
  // Laju terbaru untuk handleData (callback stabil, baca lewat ref).
  const sampleRateRef = useRef(sampleRate);
  sampleRateRef.current = sampleRate;

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

  // CLIP latch: menyala saat ada bin >= -1 dB, tetap menyala sampai
  // diketuk (bukan hilang saat level turun) — supaya user sempat melihat
  // bahwa audionya pernah menyentuh clip.
  const [clipLatched, setClipLatched] = useState(false);

  useEffect(() => {
    return visualizerService.setOnError(() => setFftError(true));
  }, []);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isStarted = useRef(false);
  const lastSessionId = useRef<number | null>(null);
  const frameCount = useRef(0);

  // Sync isPlaying + sampleRate prop → SharedValue
  useEffect(() => {
    isPlayingSV.value = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    sampleRateSV.value = sampleRate;
  }, [sampleRate]);

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

    // Frekuensi dominan + latch CLIP: hitung di JS thread, paling sering
    // 2 Hz saja (tiap 5 frame pada polling 10 Hz) dan hanya bila berubah —
    // supaya tidak setState tiap frame.
    if (isReal && frameCount.current % 5 === 0) {
      const bin = dominantBin(newData);
      if (bin >= 0) {
        const label = formatFreq(
          binCenterFreq(bin, newData.length, sampleRateRef.current / 2),
        );
        setDominantFreq((prev) => (prev === label ? prev : label));
      }
      if (valueToDb(maxVal) >= CLIP_DB) {
        setClipLatched((prev) => (prev ? prev : true));
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
        setClipLatched(false);
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
        setClipLatched(false);
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
  // mentah ke barCount, falloff 0.85. flatResponse mematikan sensitivity
  // + treble tilt supaya bar mencerminkan dB apa adanya.)
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

      let target = count > 0 ? sum / count : 0;
      if (!flatResponse) {
        target *= sensitivity;
        target *= 1 + (i / barCount) * 0.5;
      }
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

  // Bar per zona warna — tiga path terpisah supaya tiap zona punya warna
  // sendiri. Zona dari dB bar itu (valueToDb): hijau < -12, kuning -12..-3,
  // merah >= -3 dB. (Satu useDerivedValue per path: prop `path` Skia
  // menerima SkPath atau SharedValue<SkPath>, bukan objek berisi path.)
  // Geometri bar (dipakai tiga path zona) — worklet karena dipanggil dari
  // useDerivedValue. Tanpa direktif ini, Reanimated throw di runtime
  // (pelajaran ff5f12cd).
  const barGeometry = useCallback(
    (data: number[]) => {
      "worklet";
      const gap = 3;
      const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
      return data.map((amp, i) => {
        const barHeight = Math.max(4, amp * barsHeight * BAR_HEIGHT_FACTOR);
        const x = i * (barWidth + gap);
        const y = barsHeight - barHeight;
        return { rect: Skia.XYWHRect(x, y, barWidth, barHeight), amp };
      });
    },
    [contentWidth, barCount, barsHeight],
  );

  const barsLowPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "low") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsWarnPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "warn") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsClipPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "clip") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  // Tanda peak hold: garis pendek di atas tiap bar — putih biasa, MERAH
  // bila peak >= -1 dB (pernah menyentuh clip).
  const peakPath = useDerivedValue(() => {
    const peaks = peakData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
    const clipThreshold = dbToValue(CLIP_DB);

    peaks.forEach((peak, i) => {
      if (peak >= clipThreshold) return;
      const peakHeight = Math.max(0, peak * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = Math.max(0, barsHeight - peakHeight - 2);
      path.addRect(Skia.XYWHRect(x, y, barWidth, 3));
    });

    return path;
  });

  const peakClipPath = useDerivedValue(() => {
    const peaks = peakData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
    const clipThreshold = dbToValue(CLIP_DB);

    peaks.forEach((peak, i) => {
      if (peak < clipThreshold) return;
      const peakHeight = Math.max(0, peak * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = Math.max(0, barsHeight - peakHeight - 2);
      path.addRect(Skia.XYWHRect(x, y, barWidth, 3));
    });

    return path;
  });

  // Grid: garis horizontal dB + garis vertikal di frekuensi berlabel.
  // Garis 0 dB dipisah (merah) supaya ambang clip langsung terlihat.
  // Statis (hanya bergantung pada ukuran), tapi dibangun di worklet supaya
  // konsisten dengan path lain.
  const gridPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const freqMax = sampleRateSV.value / 2;
    for (const db of ANALYZER_DB_GRID) {
      if (db === 0) continue;
      const v = dbToValue(db);
      const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * v);
      path.moveTo(0, Math.min(barsHeight - 0.5, y));
      path.lineTo(contentWidth, Math.min(barsHeight - 0.5, y));
    }
    for (const freq of freqLabels) {
      const x = freqToFraction(freq, freqMax) * contentWidth;
      path.moveTo(x, 0);
      path.lineTo(x, barsHeight);
    }
    return path;
  });

  const clipLinePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * dbToValue(0));
    path.moveTo(0, Math.min(barsHeight - 0.5, y));
    path.lineTo(contentWidth, Math.min(barsHeight - 0.5, y));
    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      {/* Label dB (kiri) — statis, React biasa, DIAM di luar ScrollView. */}
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
              db === 0 ? styles.dbLabelClip : undefined,
            ]}
          >
            {db}
          </Text>
        );
      })}

      {/* Area bar + grid — bisa di-scroll horizontal; label Hz ikut scroll. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          position: "absolute",
          left: DB_GUTTER,
          top: 0,
          width: barsWidth,
          height,
        }}
      >
        <View style={{ width: contentWidth, height }}>
          <View style={{ width: contentWidth, height: barsHeight }}>
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
                  path={clipLinePath}
                  color={ANALYZER_COLOR_CLIP}
                  style="stroke"
                  strokeWidth={1}
                  opacity={0.7}
                />
                <Path
                  path={barsLowPath}
                  color={ANALYZER_COLOR_LOW}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                >
                  <BlurMask blur={2} style="solid" />
                </Path>
                <Path
                  path={barsWarnPath}
                  color={ANALYZER_COLOR_WARN}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                >
                  <BlurMask blur={2} style="solid" />
                </Path>
                <Path
                  path={barsClipPath}
                  color={ANALYZER_COLOR_CLIP}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                >
                  <BlurMask blur={2} style="solid" />
                </Path>
                <Path
                  path={peakPath}
                  color="#FFFFFF"
                  style="fill"
                  opacity={0.9}
                />
                <Path
                  path={peakClipPath}
                  color={ANALYZER_COLOR_CLIP}
                  style="fill"
                  opacity={0.9}
                />
              </Group>
            </Canvas>
          </View>

          {/* Label Hz (bawah) — ikut scroll bersama bar. */}
          {freqLabels.map((freq) => {
            const x = freqToFraction(freq, freqMax) * contentWidth;
            const left = Math.max(0, Math.min(contentWidth - 36, x - 18));
            return (
              <Text key={`hz-${freq}`} style={[styles.hzLabel, { left }]}>
                {formatFreq(freq)}
              </Text>
            );
          })}
        </View>
      </ScrollView>

      {/* Petunjuk scroll — hanya bila konten lebih lebar dari viewport. */}
      {contentWidth > barsWidth && (
        <View style={styles.scrollHint} pointerEvents="none">
          <Text style={styles.scrollHintText}>↔ geser</Text>
        </View>
      )}

      {/* Pill CLIP (latch) — ketuk untuk clear. */}
      {clipLatched && (
        <TouchableOpacity
          style={styles.clipPill}
          onPress={() => setClipLatched(false)}
          accessibilityRole="button"
          accessibilityLabel="Audio pernah clip, ketuk untuk menghapus peringatan"
        >
          <Text style={styles.clipText}>● CLIP</Text>
        </TouchableOpacity>
      )}

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
  dbLabelClip: {
    color: "#EF4444",
    fontWeight: "700",
  },
  hzLabel: {
    position: "absolute",
    bottom: 0,
    width: 36,
    textAlign: "center",
    fontSize: 9,
    color: "#888888",
  },
  scrollHint: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scrollHintText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#888888",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  clipPill: {
    position: "absolute",
    top: 4,
    left: DB_GUTTER,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  clipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
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
