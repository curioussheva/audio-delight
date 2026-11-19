import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { accentOn } from "@/shared/utils/contrast";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { usePlayerStore } from "@/features/player/store/playerStore";
import {
  describeBitPerfectPath,
  type BitPerfectPathTone,
} from "@/features/player/api/bitPerfectPath";

/**
 * Subscreen Bit-Perfect: kartu jalur sinyal read-only + tombol pindah ke DSP.
 *
 * Data hanya dari hook yang sudah ada:
 *  - useBitPerfectStatus: verdict stream (exclusive/shared) + laju stream
 *    aktual. Aturan hook dihormati: saat `unavailable` tampil "Native belum
 *    siap", saat `stale` (pause) hanya keadaan terakhir diketahui dengan
 *    catatan "diperbarui saat memutar" — tidak ada verdict live.
 *  - useAudioOutput: perangkat yang BENAR-BENAR mengeluarkan suara.
 *
 * Tidak ada indikator limiter di sini — Ide 3 butuh getter native baru,
 * di luar ronde ini.
 */
const BYPASSED = [
  "EQ",
  "bass boost",
  "pelebar stereo",
  "reverb",
  "koreksi headphone",
  "retune (tuning)",
];

export function BitPerfectSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const status = useBitPerfectStatus();
  const { currentDevice } = useAudioOutput();
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);

  const verdict = describeBitPerfectPath(status);
  // FASE 3 EQ: warna tone mentah (hijau/oranye aksen) gagal AA di tema
  // terang (terukur 4,15–4,51). Pola Equalizer: aksen dipakai selama
  // terbaca di atas permukaan kartu, jatuh ke teks bila tidak.
  const toneColor = (tone: BitPerfectPathTone): string => {
    switch (tone) {
      case "active":
        return accentOn(
          [colors.accent.green],
          colors.background.secondary,
          [colors.text.primary, colors.text.secondary],
        );
      case "fallback":
        return accentOn(
          [colors.accent.orange],
          colors.background.secondary,
          [colors.text.primary, colors.text.secondary],
        );
      case "stale":
      case "not-ready":
      case "idle":
      default:
        return colors.text.tertiary;
    }
  };

  const info = MODE_INFO["bit-perfect"];
  const deviceName = currentDevice?.name ?? "Tidak diketahui";
  const deviceType = currentDevice?.type;
  const sampleRate =
    status.actualSampleRate > 0 ? `${status.actualSampleRate} Hz` : "—";
  // F2: laju HARDWARE — yang benar-benar jalan di DAC/mixer. Bisa berbeda
  // dari laju app (mis. file 96 kHz → hardware 48 kHz: mixer meresample).
  const hardwareRate =
    status.hardwareSampleRate > 0 ? `${status.hardwareSampleRate} Hz` : "—";

  return (
    <View
      style={[styles.wrap, { marginHorizontal: spacing.md, gap: spacing.md }]}
    >
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {info.description}
      </Text>

      {/* Kartu jalur sinyal */}
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
          Jalur sinyal
        </Text>

        {/* Status stream */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
            Status stream
          </Text>
          <Text
            style={[
              styles.rowValue,
              { color: toneColor(verdict.tone), textAlign: "right" },
            ]}
          >
            {verdict.label}
          </Text>
        </View>
        <Text
          style={[
            styles.rowNote,
            { color: colors.text.tertiary, marginBottom: spacing.sm },
          ]}
        >
          {verdict.note}
        </Text>

        {/* Perangkat output */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
            Perangkat output
          </Text>
          <Text
            style={[
              styles.rowValue,
              { color: colors.text.primary, textAlign: "right" },
            ]}
          >
            {deviceType ? `${deviceName} · ${deviceType}` : deviceName}
          </Text>
        </View>

        {/* Laju stream (sisi app) */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
            Laju stream (app)
          </Text>
          <Text
            style={[
              styles.rowValue,
              { color: colors.text.primary, textAlign: "right" },
            ]}
          >
            {sampleRate}
          </Text>
        </View>

        {/* Laju hardware — yang benar-benar jalan di DAC/mixer */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
            Laju hardware
          </Text>
          <Text
            style={[
              styles.rowValue,
              { color: colors.text.primary, textAlign: "right" },
            ]}
          >
            {hardwareRate}
          </Text>
        </View>

        {/* Yang dilewati */}
        <View style={[styles.row, styles.rowTop]}>
          <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
            Dilewati
          </Text>
          <Text
            style={[
              styles.rowValue,
              { color: colors.text.primary, textAlign: "right" },
            ]}
          >
            {BYPASSED.join(" · ")}
          </Text>
        </View>
        <Text style={[styles.rowNote, { color: colors.text.tertiary }]}>
          Semua pemrosesan di atas dilewati di mode ini.
        </Text>
        <Text
          style={[
            styles.rowNote,
            { color: colors.text.tertiary, marginTop: spacing.xs },
          ]}
        >
          Koreksi headphone tidak memproses di Bit-Perfect (seluruh DSP
          dilewati) — berlaku lagi saat kembali ke DSP atau Solfeggio.
        </Text>
      </View>

      {/* Pindah ke DSP — keluar dari bit-perfect tidak perlu konfirmasi. */}
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary[500] }]}
        onPress={() => void setAudioMode("dsp")}
        accessibilityRole="button"
        accessibilityLabel="Pindah ke mode DSP"
      >
        <Text style={[styles.buttonText, { color: colors.text.inverse }]}>
          Pindah ke DSP
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
  },
  description: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 19,
  },
  card: {
    borderRadius: BASE_RADIUS.xl,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  rowTop: {
    alignItems: "flex-start",
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.semiBold,
    flex: 1,
    flexWrap: "wrap",
  },
  rowNote: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 16,
    marginTop: 2,
  },
  button: {
    borderRadius: BASE_RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
});
