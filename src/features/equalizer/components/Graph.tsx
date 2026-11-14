import React, { useMemo, useState } from "react";
import { View, StyleSheet, Text } from "react-native";

import {
  Skia,
  Canvas,
  Path,
  LinearGradient,
  vec,
  BlurMask,
} from "@shopify/react-native-skia";

import {
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";

import { EqualizerBand } from "@/features/equalizer/types";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";
import {
  BOOST_WARN_DB,
  GRAPH_CLIP_RED,
  GRAPH_CLIP_YELLOW,
  formatBoostDb,
  sampleSmoothCurve,
  splitAboveZero,
} from "@/features/equalizer/api/graphClip";

interface Props {
  bands: SharedValue<EqualizerBand[]> | EqualizerBand[]; // Terima dua-duanya agar fleksibel
  width?: number;
  height?: number;
}

export const FrequencyGraph: React.FC<Props> = ({
  bands,
  width = 340,
  height = 120,
}) => {
  const { theme } = useTheme();

  // Dimensi & Skala Konstan
  const midY = height / 2;
  const maxGainVisible = 12;
  const verticalScale = (height * 0.45) / maxGainVisible;

  // 1. Generate Path di UI Thread (Smooth Transition)
  //
  // Selain kurva + fill, dihitung juga:
  // - aboveWarn / aboveClip: potongan kurva di atas garis 0 dB (kuning
  //   0..+6 dB, merah > +6 dB) — supaya boost yang bisa clip langsung
  //   terlihat. Disampel dari kurva Bezier yang sama (bukan garis lurus
  //   antar band), jadi overlay menempel persis di kurva.
  // - maxGain: gain band terbesar, untuk teks peringatan (dicerminkan ke
  //   React state lewat useAnimatedReaction di bawah).
  const paths = useDerivedValue(() => {
    const empty = {
      curve: Skia.Path.Make(),
      fill: Skia.Path.Make(),
      aboveWarn: Skia.Path.Make(),
      aboveClip: Skia.Path.Make(),
      maxGain: 0,
    };
    // PROTEKSI: Cek apakah bands ada
    if (!bands) return empty;

    // Ambil data: cek apakah dia SharedValue (punya property .value) atau array biasa
    const currentBands = "value" in bands ? bands.value : bands;

    const skPath = Skia.Path.Make();
    if (!currentBands || currentBands.length === 0) {
      return empty;
    }

    const stepX = width / (currentBands.length - 1);
    const getY = (gain: number) => midY - gain * verticalScale;

    skPath.moveTo(0, getY(currentBands[0].gain));

    for (let i = 1; i < currentBands.length; i++) {
      const x = i * stepX;
      const y = getY(currentBands[i].gain);
      const prevX = (i - 1) * stepX;
      const prevY = getY(currentBands[i - 1].gain);

      const cp1x = prevX + (x - prevX) * 0.5;
      const cp2x = prevX + (x - prevX) * 0.5;
      skPath.cubicTo(cp1x, prevY, cp2x, y, x, y);
    }

    const fillPath = skPath.copy();
    fillPath.lineTo(width, height);
    fillPath.lineTo(0, height);
    fillPath.close();

    // Potongan kurva di atas 0 dB — sampel kurva yang sama, lalu pisah
    // per zona warna. Satu run = satu subpath (moveTo di titik pertama).
    const gains = currentBands.map((b) => b.gain);
    const maxGain = Math.max(...gains);
    const runs = splitAboveZero(
      sampleSmoothCurve(gains, width, midY, verticalScale),
    );
    const toPath = (polylines: { x: number; y: number }[][]) => {
      const p = Skia.Path.Make();
      for (const line of polylines) {
        line.forEach((pt, j) => {
          if (j === 0) p.moveTo(pt.x, pt.y);
          else p.lineTo(pt.x, pt.y);
        });
      }
      return p;
    };

    return {
      curve: skPath,
      fill: fillPath,
      aboveWarn: toPath(runs.warn),
      aboveClip: toPath(runs.clip),
      maxGain,
    };
  });

  // U-P2-43: derived value per path dibuat di ATAS komponen, bukan di
  // dalam JSX sebagai prop — memanggil useDerivedValue di JSX membuat
  // derived value baru tiap render (tidak idiomatik, berpotensi bocor).
  const fillPath = useDerivedValue(() => paths.value.fill);
  const curvePath = useDerivedValue(() => paths.value.curve);
  const aboveWarnPath = useDerivedValue(() => paths.value.aboveWarn);
  const aboveClipPath = useDerivedValue(() => paths.value.aboveClip);

  // Gain maksimum dicerminkan ke React state (hanya saat berubah) untuk
  // teks peringatan — pola yang sama dengan frekuensi dominan di
  // AnalyzerSpectrum. Perubahan band terjadi saat user menggeser slider,
  // bukan tiap frame, jadi setState di sini murah.
  const [maxGain, setMaxGain] = useState(0);
  useAnimatedReaction(
    () => paths.value.maxGain,
    (v, prev) => {
      if (v !== prev) runOnJS(setMaxGain)(v);
    },
  );

  // 2. Config warna (useMemo agar tidak re-render kecuali tema berubah)
  const colors = useMemo(
    () => ({
      primary: theme.colors.primary[500],
      accent: accentOn([theme.colors.accent.blue], theme.colors.background.secondary, [theme.colors.text.primary]),
      fillGradient: [
        `${theme.colors.primary[500]}44`,
        "transparent",
      ] as string[],
      lineGradient: [
        theme.colors.primary[500],
        accentOn([theme.colors.accent.blue], theme.colors.background.secondary, [theme.colors.text.primary]),
      ] as string[],
      border: theme.colors.border.light,
    }),
    [theme],
  );

  return (
    <View style={[styles.container, { width, height }]}>
      {/* 0dB Reference Line */}
      <View
        style={[
          styles.zeroLine,
          { top: midY, width, borderColor: colors.border },
        ]}
      />

      <Canvas style={{ width, height }}>
        {/* Shaded Area */}
        <Path path={fillPath}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={colors.fillGradient}
          />
        </Path>

        {/* Glowing Curve */}
        <Path
          path={curvePath}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          strokeCap="round"
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, 0)}
            colors={colors.lineGradient}
          />
          <BlurMask blur={3} style="solid" />
        </Path>

        {/* Potongan kurva di atas 0 dB — overlay tanpa blur supaya warna
            peringatan terbaca jelas: kuning 0..+6 dB, merah > +6 dB. */}
        <Path
          path={aboveWarnPath}
          color={GRAPH_CLIP_YELLOW}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          strokeCap="round"
        />
        <Path
          path={aboveClipPath}
          color={GRAPH_CLIP_RED}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          strokeCap="round"
        />
      </Canvas>

      {/* Peringatan boost: gain di atas 0 dB BELUM tentu clip (tergantung
          level sinyal lagu) — makanya teksnya "bisa clip", bukan "clip". */}
      {maxGain > 0 && (
        <View style={styles.warnPill} pointerEvents="none">
          <Text
            style={[
              styles.warnText,
              {
                color:
                  maxGain > BOOST_WARN_DB
                    ? GRAPH_CLIP_RED
                    : GRAPH_CLIP_YELLOW,
              },
            ]}
          >
            Boost {formatBoostDb(maxGain)} — bisa clip di lagu keras
          </Text>
        </View>
      )}

      <View style={styles.debugInfo}>
        {/* U-P2-30: dulu label debug "#888" hardcoded — 2,96:1 di
            Porcelain (gagal 4,5). Pakai token text.tertiary. */}
        <Text style={[styles.debugText, { color: theme.colors.text.tertiary }]}>+12dB</Text>
        <Text style={[styles.debugText, { color: theme.colors.text.tertiary }]}>-12dB</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
  },
  zeroLine: {
    position: "absolute",
    height: 1,
    borderStyle: "dashed",
    borderWidth: 0.5,
    opacity: 0.2,
  },
  debugInfo: {
    position: "absolute",
    left: 8,
    height: "100%",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  debugText: {
    fontSize: 9,
    fontFamily: "monospace",
  },
  warnPill: {
    position: "absolute",
    right: 8,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  warnText: {
    fontSize: 9,
    fontWeight: "700",
  },
});
