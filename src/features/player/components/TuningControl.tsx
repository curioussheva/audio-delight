import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { pickReadable, accentOn, AA_NORMAL } from "@/shared/utils/contrast";
import { usePlayerStore } from "@/features/player/store/playerStore";
import {
  A432_CENTS,
  TUNING_MAX_CENTS,
  TUNING_MIN_CENTS,
  TUNING_STEP_CENTS,
  centsToFrequency,
} from "@/features/player/utils/tuning";

interface TuningControlProps {
  /** Penyelarasan di tempat pakai — settings rata kanan, subscreen
      Solfeggio dibiarkan melebar. */
  style?: ViewStyle;
}

/**
 * Kontrol tuning (retune) bersama — dipakai settings DAN subscreen
 * Solfeggio. Satu-satunya sumber UI tuning; state tetap di playerStore
 * (tuningCents/setTuningCents), tidak ada state lokal.
 *
 * FASE R (2026-11-11): preset A=440 (0 sen) / A=432 Verdi (−31,77 sen),
 * stepper ±5 sen, rentang ±100 sen (clamp di store). Nonaktif di mode
 * Bit-Perfect — aturan yang sama dengan settings.
 */
export function TuningControl({ style }: TuningControlProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const tuningCents = usePlayerStore((s) => s.tuningCents);
  const setTuningCents = usePlayerStore((s) => s.setTuningCents);
  const audioMode = usePlayerStore((s) => s.audioMode);

  // Teks di atas permukaan primary[500] — pola settings (dipilih dari
  // luminansi primary, bukan hardcoded "#fff").
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";
  // Aksen sebagai teks — pola Equalizer: aksen dipakai selama terbaca di
  // atas permukaan kartu (background.secondary).
  const accentOnSecondary = accentOn(
    [colors.primary[500]],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );

  const disabled = audioMode === "bit-perfect";
  const cents = tuningCents ?? 0;
  const isA440 = Math.abs(cents) < 0.5;
  const isA432 = Math.abs(cents - A432_CENTS) < 0.5;

  const handleTuningPreset = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTuningCents(value);
  };

  const handleTuningChange = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTuningCents(cents + delta);
  };

  return (
    <View style={[styles.wrap, disabled && styles.disabled, style]}>
      <View style={styles.presets}>
        <TouchableOpacity
          onPress={() => handleTuningPreset(0)}
          disabled={disabled}
          style={[
            styles.preset,
            {
              backgroundColor: isA440
                ? colors.primary[500]
                : colors.background.tertiary,
            },
          ]}
        >
          <Text
            style={[
              styles.presetLabel,
              { color: isA440 ? onPrimary : colors.text.primary },
            ]}
          >
            A=440
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleTuningPreset(A432_CENTS)}
          disabled={disabled}
          style={[
            styles.preset,
            {
              backgroundColor: isA432
                ? colors.primary[500]
                : colors.background.tertiary,
            },
          ]}
        >
          <Text
            style={[
              styles.presetLabel,
              { color: isA432 ? onPrimary : colors.text.primary },
            ]}
          >
            A=432
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity
          onPress={() => handleTuningChange(-TUNING_STEP_CENTS)}
          disabled={disabled || cents <= TUNING_MIN_CENTS}
          accessibilityRole="button"
          accessibilityLabel="Turunkan tuning 5 sen"
          style={[
            styles.stepButton,
            {
              backgroundColor: colors.background.tertiary,
              opacity: cents <= TUNING_MIN_CENTS ? 0.3 : 1,
            },
          ]}
        >
          <Text style={[styles.stepGlyph, { color: colors.text.primary }]}>
            −
          </Text>
        </TouchableOpacity>
        <View style={styles.readout}>
          <Text style={[styles.frequency, { color: accentOnSecondary }]}>
            A={centsToFrequency(cents).toFixed(1)} Hz
          </Text>
          <Text style={[styles.cents, { color: colors.text.tertiary }]}>
            {cents > 0 ? "+" : ""}
            {cents.toFixed(1)} sen
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleTuningChange(TUNING_STEP_CENTS)}
          disabled={disabled || cents >= TUNING_MAX_CENTS}
          accessibilityRole="button"
          accessibilityLabel="Naikkan tuning 5 sen"
          style={[
            styles.stepButton,
            {
              backgroundColor: colors.background.tertiary,
              opacity: cents >= TUNING_MAX_CENTS ? 0.3 : 1,
            },
          ]}
        >
          <Text style={[styles.stepGlyph, { color: colors.text.primary }]}>
            +
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  presets: {
    flexDirection: "row",
    gap: 6,
  },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BASE_RADIUS.sm,
  },
  presetLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  stepButton: {
    // U-P2-01: 32×32 lama, di bawah 44dp.
    width: 44,
    height: 44,
    borderRadius: BASE_RADIUS.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  stepGlyph: {
    fontSize: 18,
    lineHeight: 20,
  },
  readout: {
    minWidth: 92,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  frequency: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  cents: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
  },
});
