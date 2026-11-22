import React, { memo, useCallback } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { usePlayerStore } from "@/features/player/store/playerStore";

/**
 * Tombol "Pindah ke DSP" bersama BitPerfect + Solfeggio.
 *
 * Per-node render (2026-11-22): komponen memo tanpa prop — induk
 * (subscreen) boleh render ulang, tombol ini tidak ikut; handler
 * `onPress` stabil (useCallback + setter store yang stabil), jadi
 * memo tidak batal oleh identitas callback baru tiap render induk.
 * Dipakai BitPerfectSubscreen dan SolfeggioSubscreen; sebelumnya
 * masing-masing punya salinan inline dengan handler anonim baru tiap
 * render.
 */
export const SwitchToDspButton = memo(function SwitchToDspButton() {
  const { theme } = useTheme();
  const { colors } = theme;
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setAudioMode("dsp");
  }, [setAudioMode]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primary[500] },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Pindah ke mode DSP"
    >
      <Text style={[styles.buttonText, { color: colors.text.inverse }]}>
        Pindah ke DSP
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    borderRadius: BASE_RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  // Umpan balik tekan (P2 audit): Pressable tanpa style pressed terasa
  // mati — samakan dengan TuningControl (haptic) + opacity.
  pressed: {
    opacity: 0.7,
  },
});
