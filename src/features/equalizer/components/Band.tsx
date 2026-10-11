import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { GestureDetector, Gesture } from "react-native-gesture-handler";

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  runOnJS,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/shared/context/ThemeContext";
import {
  accentOn,
  pickReadable,
  AA_NORMAL,
} from "@/shared/utils/contrast";

interface BandProps {
  frequency: number;
  gain: number;
  onValueChange: (gain: number) => void;
  color?: string;
  disabled?: boolean;
}

const BAND_WIDTH = 65; // Ukuran lebar yang pas untuk scroll horizontal
const SLIDER_HEIGHT = 160; // Tinggi area geser

export const EqualizerBand = ({
  frequency,
  gain,
  onValueChange,
  color,
  disabled,
}: BandProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;

  // Fader butuh warna aksen nyata. `primary[500]` di tema gelap adalah shade
  // GELAP (charcoal-black #1A1A1A, midnight-blue #0F1E3D), jadi fader-nya
  // nyaris tak terlihat di atas kartu gelap. Token `text.primary` bukan aksen,
  // jadi tidak bisa dipakai untuk elemen grafis. Yang dipakai: aksen tema kalau
  // ada, kalau tidak `primary[500]` - dan permukaan kartu dibuat kontras
  // terhadapnya di layar.
  const accent =
    color ?? accentOn([colors.accent.blue], colors.background.secondary, [colors.text.primary]);

  const translateY = useSharedValue(
    interpolate(gain, [-12, 12], [SLIDER_HEIGHT, 0]),
  );

  // Sync saat gain berubah (misal ganti preset)
  React.useEffect(() => {
    translateY.value = withSpring(
      interpolate(gain, [-12, 12], [SLIDER_HEIGHT, 0]),
    );
  }, [gain]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      let nextY = e.y;
      if (nextY < 0) nextY = 0;
      if (nextY > SLIDER_HEIGHT) nextY = SLIDER_HEIGHT;

      translateY.value = nextY;
      const newGain = interpolate(nextY, [0, SLIDER_HEIGHT], [12, -12]);
      runOnJS(onValueChange)(parseFloat(newGain.toFixed(1)));
    });

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - 12 }],
    backgroundColor: gain === 0 ? colors.background.tertiary : accent,
    shadowColor: accent,
  }));

  const animatedFillStyle = useAnimatedStyle(() => ({
    height: SLIDER_HEIGHT - translateY.value,
    backgroundColor: accent,
    opacity: interpolate(Math.abs(gain), [0, 12], [0.2, 0.8]),
  }));

  const freqLabel = frequency < 1000 ? `${frequency}` : `${frequency / 1000}k`;

  // Nilai dB di atas fader. Warna dulu aksen mentah / `#555` hardcoded.
  // Diukur terhadap latar kartu supaya angka gain selalu terbaca - elemen ini
  // menampilkan nilai numerik, jadi 4.5 berlaku (bukan 3.0).
  const cardBg = colors.background.secondary;
  const gainColor =
    gain === 0
      ? colors.text.tertiary
      : (pickReadable([accent, colors.text.primary], cardBg, AA_NORMAL) ??
         colors.text.primary);

  return (
    <View style={[styles.container, { opacity: disabled ? 0.35 : 1 }]}>
      {/* DB Value di atas */}
      <Text style={[styles.gainText, { color: gainColor }]}>
        {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
      </Text>

      <GestureDetector gesture={gesture}>
        <View
          style={[
            styles.faderTrack,
            {
              backgroundColor: colors.background.primary,
              borderColor: colors.border.medium,
            },
          ]}
        >
          {/* Garis-garis Skala (Tick Marks) */}
          <View style={styles.ticks}>
            {[12, 6, 0, -6, -12].map((v) => (
              <View
                key={v}
                style={[
                  styles.tickLine,
                  { backgroundColor: colors.border.medium },
                  v === 0 && {
                    width: 20,
                    backgroundColor: colors.border.light ?? colors.border.medium,
                  },
                ]}
              />
            ))}
          </View>

          {/* Fill Progress dari Bawah */}
          <Animated.View style={[styles.fill, animatedFillStyle]} />

          {/* Knob Fader Kotak (Studio Style) */}
          <Animated.View style={[styles.thumb, animatedThumbStyle]}>
            <View style={styles.thumbLine} />
          </Animated.View>
        </View>
      </GestureDetector>

      <Text style={[styles.freqText, { color: colors.text.secondary }]}>
        {freqLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: BAND_WIDTH,
    alignItems: "center",
    paddingVertical: 10,
  },
  gainText: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 8,
    fontVariant: ["tabular-nums"],
  },
  faderTrack: {
    width: 30, // Area sentuh lebih lebar
    height: SLIDER_HEIGHT,
    borderRadius: 4,
    justifyContent: "flex-end",
    alignItems: "center",
    borderWidth: 1,
    overflow: "visible",
  },
  ticks: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 0,
  },
  tickLine: {
    width: 10,
    height: 1,
  },
  fill: {
    width: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 0,
  },
  thumb: {
    width: 26,
    height: 24,
    borderRadius: 4,
    position: "absolute",
    left: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  thumbLine: {
    width: 15,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 1,
  },
  freqText: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: "bold",
  },
});
