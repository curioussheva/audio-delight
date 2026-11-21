import React, { memo, useMemo, useState } from "react";
import { View, StyleSheet, Text } from "react-native";

import {
  Skia,
  Canvas,
  Path,
  Circle,
  DashPathEffect,
  LinearGradient,
  vec,
  BlurMask,
} from "@shopify/react-native-skia";

import {
  useDerivedValue,
  useAnimatedReaction,
  useSharedValue,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";

import { GestureDetector, Gesture } from "react-native-gesture-handler";

import { EqualizerBand } from "@/features/equalizer/types";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { accentOn } from "@/shared/utils/contrast";
import { bandPoint, pointToBand } from "@/features/equalizer/api/graphDragMath";
import { setDragActive } from "@/features/equalizer/api/dragState";
import { areFrequencyGraphPropsEqual } from "@/features/equalizer/api/graphProps";
import {
  BOOST_WARN_DB,
  GRAPH_CLIP_RED,
  GRAPH_CLIP_YELLOW,
  formatBoostDb,
  formatHzLabel,
  graphHzLabelIndices,
  sampleSmoothCurve,
  splitAboveZero,
} from "@/features/equalizer/api/graphClip";

interface Props {
  bands: SharedValue<EqualizerBand[]> | EqualizerBand[]; // Terima dua-duanya agar fleksibel
  /**
   * Gain gabungan (koreksi headphone + EQ manual) per titik band, dalam dB
   * — dihitung pemanggil dari `combinedCurveGains`. null = tidak ada
   * koreksi yang bisa digambar. Kurva gabungan read-only (garis
   * putus-putus) dan juga dipakai untuk peringatan clip — itulah yang
   * jujur (yang didengar), bukan kurva EQ saja.
   */
  combinedGains?: readonly number[] | null;
  width?: number;
  height?: number;
  /** Bekukan tampilan saat DSP bypass (B3): graph meredup. */
  disabled?: boolean;
  /**
   * Ide 4b: graph bisa diseret langsung — titik sentuh memetakan ke band
   * terdekat + gain. Tidak ada = graph read-only (mis. subscreen lain).
   * Dipanggil di JS thread; pemanggil yang menjaga klem/guard DSP.
   */
  onBandChange?: (index: number, gain: number) => void;
  /**
   * Boost yang TIDAK terlihat di kurva tapi ikut menaikkan puncak akhir:
   * bass boost (low-shelf 100 Hz, 0..+12 dB) dan master gain
   * (−12..+12 dB). Keduanya ditambahkan ke puncak kurva untuk
   * peringatan clip — sebelumnya pill hanya menghitung kurva, jadi
   * bass +12 dB + gain +12 dB bisa clip tanpa peringatan.
   */
  bassBoostDb?: number;
  masterGainDb?: number;
}

// Tinggi strip label Hz di bawah canvas.
const HZ_STRIP = 16;

export const FrequencyGraph = memo(({
  bands,
  combinedGains,
  width = 340,
  height = 120,
  disabled,
  onBandChange,
  bassBoostDb = 0,
  masterGainDb = 0,
}: Props) => {
  const { theme } = useTheme();

  // Dimensi & Skala Konstan
  const midY = height / 2;
  const maxGainVisible = 10;
  const verticalScale = (height * 0.45) / maxGainVisible;

  // Ide 4b — drag langsung pada kurva. Geometri (stepX / midY /
  // verticalScale) SAMA dengan yang menggambar kurva di atas, jadi titik
  // yang disentuh memetakan persis ke titik kurva yang terlihat.
  // - activeOffsetX + failOffsetY: drag HORIZONTAL mengklaim gesture,
  //   swipe VERTIKAL gagal cepat supaya ScrollView induk tetap bisa
  //   scroll — pola yang sama dengan directionalLockEnabled di mixer.
  // - onStart juga menyetel band, jadi ketuk (tanpa drag) ikut berfungsi.
  // - onBandChange hanya dipanggil saat (index, gain) berubah, supaya
  //   frame drag yang nilainya sama tidak membanjiri bridge.
  // - Gesture dibuat ulang tiap render (pola yang sama dengan ControlKnob),
  //   jadi closure onBandChange selalu segar.
  const dragEnabled = !disabled && !!onBandChange;
  // Dot penanda band aktif saat drag — posisi dari shared value supaya
  // mengikuti jari tanpa setState per frame; r=0 saat tidak drag.
  const dotX = useSharedValue(0);
  const dotY = useSharedValue(0);
  const dotR = useSharedValue(0);
  const lastIndex = useSharedValue(-1);
  const lastGain = useSharedValue(Number.NaN);
  const bandCount =
    "value" in bands ? (bands.value?.length ?? 0) : (bands?.length ?? 0);
  const graphGesture = Gesture.Pan()
    .enabled(dragEnabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart((e) => {
      // Item 2: drag kurva juga mengirim setter band (onBandChange) —
      // beri tahu poll visualizer supaya melambat selama drag.
      runOnJS(setDragActive)(true);
      const { index, gain } = pointToBand(e.x, e.y, width, height, bandCount);
      const pt = bandPoint(index, gain, width, height, bandCount);
      dotX.value = pt.x;
      dotY.value = pt.y;
      dotR.value = 7;
      lastIndex.value = index;
      lastGain.value = gain;
      if (onBandChange) runOnJS(onBandChange)(index, gain);
    })
    .onUpdate((e) => {
      const { index, gain } = pointToBand(e.x, e.y, width, height, bandCount);
      const pt = bandPoint(index, gain, width, height, bandCount);
      dotX.value = pt.x;
      dotY.value = pt.y;
      if (index !== lastIndex.value || gain !== lastGain.value) {
        lastIndex.value = index;
        lastGain.value = gain;
        if (onBandChange) runOnJS(onBandChange)(index, gain);
      }
    })
    .onFinalize(() => {
      dotR.value = 0;
      lastIndex.value = -1;
      lastGain.value = Number.NaN;
      // Item 2: drag selesai — poll visualizer kembali 50 ms penuh.
      runOnJS(setDragActive)(false);
    });

  // 1. Generate Path di UI Thread (Smooth Transition)
  //
  // Selain kurva + fill, dihitung juga:
  // - aboveWarn / aboveClip: potongan kurva di atas garis 0 dB (kuning
  //   0..+6 dB, merah > +6 dB) — supaya boost yang bisa clip langsung
  //   terlihat. Disampel dari kurva Bezier yang sama (bukan garis lurus
  //   antar band), jadi overlay menempel persis di kurva.
  // - maxGain: gain band terbesar, untuk teks peringatan (dicerminkan ke
  //   React state lewat useAnimatedReaction di bawah).
  // - combinedCurve: kurva gabungan (koreksi + EQ) sebagai polyline dari
  //   sampel kurva halus yang sama — digambar putus-putus, read-only.
  //   Bila kurva gabungan ada, overlay + maxGain memakai gain GABUNGAN
  //   (displayGains), bukan kurva EQ saja — itulah yang didengar.
  const paths = useDerivedValue(() => {
    const empty = {
      curve: Skia.Path.Make(),
      fill: Skia.Path.Make(),
      aboveWarn: Skia.Path.Make(),
      aboveClip: Skia.Path.Make(),
      combinedCurve: Skia.Path.Make(),
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
    // Gain yang dipakai = gabungan bila ada (yang didengar), EQ saja bila
    // tidak. Kurva gabungan bisa melewati batas ±10 dB tampilan (mis.
    // Kunten +10 dB di 9 kHz + boost EQ) — Skia memotong gambar ke
    // batas Canvas, jadi layout tetap rapi.
    const gains = currentBands.map((b) => b.gain);
    const hasCombined =
      !!combinedGains && combinedGains.length === gains.length;
    const displayGains: readonly number[] = hasCombined
      ? (combinedGains as readonly number[])
      : gains;
    const maxGain = Math.max(...displayGains);
    const runs = splitAboveZero(
      sampleSmoothCurve(displayGains, width, midY, verticalScale),
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

    // Path kurva gabungan dari sampel yang sama (polyline halus).
    const combinedCurve = Skia.Path.Make();
    if (hasCombined) {
      const samples = sampleSmoothCurve(
        displayGains,
        width,
        midY,
        verticalScale,
      );
      samples.forEach((pt, j) => {
        if (j === 0) combinedCurve.moveTo(pt.x, pt.y);
        else combinedCurve.lineTo(pt.x, pt.y);
      });
    }

    return {
      curve: skPath,
      fill: fillPath,
      aboveWarn: toPath(runs.warn),
      aboveClip: toPath(runs.clip),
      combinedCurve,
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
  const combinedCurvePath = useDerivedValue(() => paths.value.combinedCurve);

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
      // Kurva gabungan: oranye (beda dari gradien biru kurva EQ) + garis
      // putus-putus, supaya keduanya bisa dibedakan walau warnanya dekat.
      combined: accentOn([theme.colors.accent.orange], theme.colors.background.secondary, [theme.colors.text.primary]),
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

  // C1: label Hz di sumbu-x — dibaca dari frekuensi band yang sebenarnya
  // (bands[i].frequency), bukan hafalan. Frekuensi band tidak berubah
  // (hanya gain yang berubah), jadi baca sekali di render aman.
  const currentBands = "value" in bands ? bands.value : bands;
  const labelIndices = graphHzLabelIndices(currentBands?.length ?? 0);
  const stepX =
    currentBands && currentBands.length > 1
      ? width / (currentBands.length - 1)
      : width;

  // Puncak akhir yang jujur: puncak kurva + bass boost + master gain.
  // Bass dan gain TIDAK tergambar di kurva (bass = shelf, gain =
  // uniform), tapi keduanya menaikkan level yang keluar — pill clip
  // harus menghitungnya. Overlay kuning/merah di canvas tetap
  // mengikuti kurva saja (lihat komentar di sana).
  const effectiveMaxGain = maxGain + bassBoostDb + masterGainDb;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        effectiveMaxGain > 0
          ? `Kurva EQ. Boost maksimum ${formatBoostDb(effectiveMaxGain)} — bisa clip di lagu keras.${disabled ? " Tidak aktif (bypass)." : " Buka MIXER untuk menyetel tiap band."}`
          : `Kurva EQ. Tidak ada boost.${disabled ? " Tidak aktif (bypass)." : " Buka MIXER untuk menyetel tiap band."}`
      }
      style={[
        styles.container,
        {
          width,
          height: height + HZ_STRIP,
          opacity: disabled ? 0.4 : 1,
          // FASE 3 EQ: latar inset dari token (dulu rgba(0,0,0,0.05)
          // mentah — di tema gelap nyaris tak terlihat, di tema terang
          // menggelap sembarangan). background.primary memberi kontras
          // inset yang halus di kedua arah.
          backgroundColor: theme.colors.background.primary,
          borderRadius: BASE_RADIUS.sm,
        },
      ]}
    >
      {/* 0dB Reference Line */}
      <View
        style={[
          styles.zeroLine,
          { top: midY, width, borderColor: colors.border },
        ]}
      />

      {/* Ide 4b: GestureDetector membungkus Canvas lewat View berukuran
          sama — koordinat sentuh (e.x/e.y) relatif ke View ini, jadi sama
          dengan koordinat canvas. */}
      <GestureDetector gesture={graphGesture}>
        <View style={{ width, height }}>
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

            {/* Kurva gabungan (koreksi + EQ) — garis putus-putus,
                read-only. Path kosong bila tidak ada koreksi yang
                bisa digambar (tidak merender apa pun). */}
            <Path
              path={combinedCurvePath}
              style="stroke"
              strokeWidth={2}
              strokeJoin="round"
              strokeCap="round"
              color={colors.combined}
            >
              <DashPathEffect intervals={[8, 6]} phase={0} />
            </Path>

            {/* Potongan kurva di atas 0 dB — overlay tanpa blur supaya warna
            peringatan terbaca jelas: kuning 0..+6 dB, merah > +6 dB.
            Mengikuti gain gabungan bila kurva gabungan tampil. */}
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

            {/* Dot band aktif saat drag (r=0 saat tidak drag). */}
            <Circle cx={dotX} cy={dotY} r={dotR} color={colors.primary} />
          </Canvas>
        </View>
      </GestureDetector>

      {/* Peringatan boost: gain di atas 0 dB BELUM tentu clip (tergantung
          level sinyal lagu) — makanya teksnya "bisa clip", bukan "clip".
          Puncak yang dinilai = kurva + bass boost + master gain; pill
          disembunyikan saat bypass (tidak ada yang diterapkan). */}
      {effectiveMaxGain > 0 && !disabled && (
        <View style={styles.warnPill} pointerEvents="none">
          <Text
            style={[
              styles.warnText,
              {
                color:
                  effectiveMaxGain > BOOST_WARN_DB
                    ? GRAPH_CLIP_RED
                    : GRAPH_CLIP_YELLOW,
              },
            ]}
          >
            Boost {formatBoostDb(effectiveMaxGain)} — bisa clip di lagu keras
          </Text>
        </View>
      )}

      {/* Label Hz di sumbu-x (C1) — posisi x sama dengan titik band. */}
      {labelIndices.map((i) => {
        const freq = currentBands?.[i]?.frequency ?? 0;
        const x = i * stepX;
        const left = Math.max(0, Math.min(width - 36, x - 18));
        return (
          <Text
            key={`hz-${i}`}
            style={[
              styles.hzLabel,
              { left, top: height + 2, color: theme.colors.text.tertiary },
            ]}
          >
            {formatHzLabel(freq)}
          </Text>
        );
      })}

      <View style={[styles.debugInfo, { height }]}>
        {/* U-P2-30: dulu label debug "#888" hardcoded — 2,96:1 di
            Porcelain (gagal 4,5). Pakai token text.tertiary. */}
        <Text style={[styles.debugText, { color: theme.colors.text.tertiary }]}>+10dB</Text>
        <Text style={[styles.debugText, { color: theme.colors.text.tertiary }]}>-10dB</Text>
      </View>
    </View>
  );
}, areFrequencyGraphPropsEqual);

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    // Latar + radius kini inline dari token (lihat render di atas).
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
    top: 0,
    // height di-override inline (= tinggi canvas) supaya tidak ikut
    // strip label Hz di bawah.
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  debugText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    fontVariant: ["tabular-nums"],
  },
  hzLabel: {
    position: "absolute",
    // top di-override inline (= tepat di bawah canvas).
    width: 36,
    textAlign: "center",
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
  },
  warnPill: {
    position: "absolute",
    right: 8,
    // Di atas strip label Hz (16px) supaya tidak menabrak label 16k.
    bottom: 20,
    // FASE 3 EQ — pill 45% hitam DULU: teks kuning/merah di atasnya
    // hanya 1,02–2,03 di tema terang (terukur 2026-11-18) — praktis
    // tak terbaca. 90% hitam membuat keduanya lolos AA di keempat tema
    // (kuning 9,27–10,76; merah 4,72–5,48); 85% masih gagal merah
    // (4,13–4,17). Pill jadi lencana hampir-hitam — disengaja.
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  warnText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
});
