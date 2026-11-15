import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Slider from "@react-native-community/slider";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import { TuningControl } from "@/features/player/components/TuningControl";
import { usePlayerStore } from "@/features/player/store/playerStore";

/**
 * Subscreen Solfeggio (mode immersive): tuning + intensitas master.
 *
 * - Tuning: TuningControl bersama (dipakai juga settings) — preset A=440 /
 *   A=432, stepper ±5 sen, nonaktif di Bit-Perfect.
 * - Intensitas: slider master 0–100% (resonansi + exciter + spatial
 *   bersama), default 50%, live ke NativeDSPModule.setResonanceIntensity
 *   lewat playerStore — pola setBassBoost, tanpa throttle.
 * - Tidak ada kontrol binaural: binaural beat tidak diimplementasikan.
 * - Kontrol EQ/DSP tidak berlaku di mode ini; mereka tinggal di tab DSP.
 */
export function SolfeggioSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const resonanceIntensity = usePlayerStore((s) => s.resonanceIntensity);
  const setResonanceIntensity = usePlayerStore((s) => s.setResonanceIntensity);

  const info = MODE_INFO.immersive;
  // Nilai % sebagai teks aksen — pola Equalizer: aksen dipakai selama
  // terbaca di atas permukaan kartu (background.secondary).
  const accentOnSecondary = accentOn(
    [colors.primary[500]],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );

  return (
    <View
      style={[styles.wrap, { marginHorizontal: spacing.md, gap: spacing.md }]}
    >
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {info.description}
      </Text>

      {/* Tuning (Nada Dasar) */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
          Tuning (Nada Dasar)
        </Text>
        <Text
          style={[
            styles.cardHint,
            { color: colors.text.tertiary, marginBottom: spacing.sm },
          ]}
        >
          Tinggi nada lagu tanpa mengubah tempo (A=440 standar, A=432 Verdi).
          Tidak berlaku di mode Bit-Perfect.
        </Text>
        <TuningControl />
      </View>

      {/* Intensitas master */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Intensitas
          </Text>
          <Text style={[styles.value, { color: accentOnSecondary }]}>
            {Math.round(resonanceIntensity * 100)}%
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={resonanceIntensity}
          onValueChange={setResonanceIntensity}
          minimumTrackTintColor={colors.primary[500]}
          maximumTrackTintColor={colors.background.tertiary}
          thumbTintColor={colors.primary[500]}
          accessibilityLabel="Intensitas Solfeggio"
          accessibilityRole="adjustable"
        />
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Intensitas master — resonansi, exciter, dan spatial diatur bersama.
        </Text>
      </View>

      <Text style={[styles.note, { color: colors.text.tertiary }]}>
        Kontrol EQ/DSP tidak berlaku di mode ini — atur di tab DSP.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  value: {
    fontSize: 14,
    fontWeight: "800",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
  },
});
