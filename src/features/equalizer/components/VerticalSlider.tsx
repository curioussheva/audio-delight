// src/features/equalizer/components/VerticalSlider.tsx
//
// Slider vertikal DSP (opsi B Fase 3, keputusan csheva 2026-11-18 08:08):
// bass boost + pelebar stereo yang dulu ControlKnob kini fader vertikal
// ala slider GAIN kanan Neutron — spektrum di atas, slider di bawah,
// label di atas, nilai % di bawah.
//
// Bahasa visualnya SAMA dengan fader band di Band.tsx (track 160px,
// tick, fill dari bawah, thumb kotak) supaya kedua slider di layar ini
// terbaca sebagai satu keluarga — bukan dua pola geser yang berbeda.
// Rentang nilai SAMA dengan knob lama (0..1000) dan dengan yang diterima
// Kotlin (bass 0..+12 dB, widener width 1.0..2.0), jadi tanpa konversi:
// nilai yang dikirim ke store/native tidak berubah, hanya bentuk
// kontrolnya. Tampilan % juga sama dengan knob (value/10).
//
// Master gain memakai rentang lain (0..1.5, tampil ×1.00) lewat props
// opsional `maxValue` + `formatValue` — default tetap 0..1000 + %,
// jadi kedua pemakai lama tidak berubah.
//
// ControlKnob TIDAK dihapus di ronde ini (aturan dead code: inventaris
// dulu) — tapi sesudah ronde ini nol pemakainya; lihat laporan Fase 3 EQ.
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
import { FONT_FAMILY } from "@/shared/constants/themes/base";
import {
  DSP_SLIDER_HEIGHT,
  dspValueToY,
  dspYToValue,
} from "@/features/equalizer/api/verticalSliderMath";

interface VerticalSliderProps {
  label: string;
  value: number; // 0 - maxValue (default 1000, sama seperti knob lama)
  onChange: (val: number) => void;
  color: string;
  disabled?: boolean;
  // Batas atas rentang (default 1000). Master gain memakai 1.5.
  maxValue?: number;
  // Teks nilai di bawah slider. Default: persen (value/10), sama seperti
  // knob lama. Master gain memakai `×${v.toFixed(2)}`.
  formatValue?: (value: number) => string;
}

const TRACK_WIDTH = 30;
const THUMB_WIDTH = 26;
const THUMB_HEIGHT = 24;

export const VerticalSlider = ({
  label,
  value,
  onChange,
  color,
  disabled,
  maxValue = 1000,
  formatValue,
}: VerticalSliderProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;

  const translateY = useSharedValue(dspValueToY(value || 0, DSP_SLIDER_HEIGHT, 0, maxValue));

  // Sync saat value prop berubah (mis. ganti preset / reset)
  React.useEffect(() => {
    if (!isNaN(value)) {
      translateY.value = withSpring(dspValueToY(value, DSP_SLIDER_HEIGHT, 0, maxValue));
    }
  }, [value, maxValue]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    // Area sentuh: track visual 30px + hitSlop 8px tiap sisi = 46px,
    // supaya ibu jari tidak harus tepat di track (knob lama memakai
    // hitSlop 20; fader band tidak memakai hitSlop sama sekali).
    .hitSlop({ left: 8, right: 8, top: 4, bottom: 4 })
    .onUpdate((e) => {
      // Travel thumb di-inset ke [12, SLIDER_HEIGHT - 12] (pola fader
      // band): di 0/1000 setengah thumb tidak menggantung di luar track.
      let nextY = e.y;
      if (nextY < 12) nextY = 12;
      if (nextY > DSP_SLIDER_HEIGHT - 12) nextY = DSP_SLIDER_HEIGHT - 12;
      translateY.value = nextY;
      const newValue = dspYToValue(nextY, DSP_SLIDER_HEIGHT, 0, maxValue);
      runOnJS(onChange)(newValue);
    });

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - 12 }],
    backgroundColor: color,
    shadowColor: color,
  }));

  const animatedFillStyle = useAnimatedStyle(() => ({
    height: DSP_SLIDER_HEIGHT - translateY.value,
    backgroundColor: color,
    opacity: interpolate(value || 0, [0, maxValue], [0.2, 0.8]),
  }));

  const displayValue = !isNaN(value) ? Math.round(value / 10) : 0;
  const displayText =
    formatValue != null
      ? formatValue(!isNaN(value) ? value : 0)
      : `${displayValue}%`;

  // Aksesibilitas: pola yang sama dengan knob lama — screen reader
  // mengatur lewat aksi naik/turun (langkah 10%), bukan cuma drag.
  const handleAccessibilityAction = (event: {
    nativeEvent: { actionName: string };
  }) => {
    const step = maxValue / 10; // 10% dari rentang
    const next =
      event.nativeEvent.actionName === "increment"
        ? Math.min(maxValue, (value || 0) + step)
        : Math.max(0, (value || 0) - step);
    onChange(next);
  };

  return (
    <View
      style={[styles.container, { opacity: disabled ? 0.35 : 1 }]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} ${displayText}`}
      accessibilityValue={{ min: 0, max: maxValue, now: value || 0 }}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[
        { name: "increment", label: "Naikkan" },
        { name: "decrement", label: "Turunkan" },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      {/* Label efek di atas — sama seperti label knob lama. */}
      <Text
        style={[
          styles.label,
          {
            color: disabled ? colors.text.tertiary : colors.text.secondary,
          },
        ]}
      >
        {label}
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
          {/* Garis-garis skala (Tick Marks): 100 / 50 / 0 — 0 ditekankan
              (lebih lebar), seperti garis 0 dB pada fader band. */}
          <View style={styles.ticks}>
            {[100, 50, 0].map((v) => (
              <View
                key={v}
                style={[
                  styles.tickLine,
                  { backgroundColor: colors.border.medium },
                  v === 0 && {
                    width: 20,
                    backgroundColor:
                      colors.border.light ?? colors.border.medium,
                  },
                ]}
              />
            ))}
          </View>

          {/* Fill Progress dari Bawah */}
          <Animated.View style={[styles.fill, animatedFillStyle]} />

          {/* Thumb fader kotak (gaya studio, sama seperti fader band) */}
          <Animated.View style={[styles.thumb, animatedThumbStyle]}>
            <View style={styles.thumbLine} />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Nilai di bawah — default %, atau formatValue pemakai (mis. ×1.00
          untuk master gain). */}
      <Text
        style={[
          styles.valueText,
          { color: disabled ? colors.text.tertiary : color },
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    marginBottom: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  faderTrack: {
    width: TRACK_WIDTH,
    height: DSP_SLIDER_HEIGHT,
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
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
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
  valueText: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.bold,
    fontVariant: ["tabular-nums"],
    marginTop: 12,
  },
});
