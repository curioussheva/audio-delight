import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { accentOn } from "@/shared/utils/contrast";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import {
  describeBitPerfectPath,
  type BitPerfectPathTone,
} from "@/features/player/api/bitPerfectPath";
import { SwitchToDspButton } from "@/features/equalizer/components/SwitchToDspButton";

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
 *
 * Per-node render (2026-11-22):
 *  - Audit: guard `sameBitPerfectStatus` di hook (ronde Analyzer)
 *    sudah membuat tick poll 2 dtk yang diam tidak setState — tapi itu
 *    saja belum cukup. (a) Subscreen ini bukan memo, jadi tiap render
 *    induk (equalizer.tsx) membangunkan seluruh kartu. (b) `useAudioOutput`
 *    memanggil `setBluetoothCodec(objek baru)` TANPA guard tiap sync
 *    3 dtk saat perangkat aktif Bluetooth — subscreen bangun tiap 3 dtk
 *    walau codecnya sama (diperbaiki di hook: `sameBluetoothCodec`).
 *    (c) Satu perubahan field status (mis. laju stream) me-render ulang
 *    SEMUA baris, termasuk verdict dan perangkat yang tidak berubah.
 *  - Sesudah: shell memo ini memiliki kedua hook SEKALI (satu instance
 *    tiap hook — TIDAK digandakan ke leaf, supaya poller native tetap
 *    satu), lalu meneruskan PRIMITIF (string/tone) ke leaf memo di
 *    bawah. Verdict berubah → hanya VerdictRows yang render ulang;
 *    laju berubah → hanya StreamRateRows; perangkat berganti → hanya
 *    OutputDeviceRow. Tombol DSP memo tanpa prop (SwitchToDspButton).
 */
// P2 audit BitPerfect/Solfeggio 2026-11-20: HRTF + master gain dulu hilang
// dari daftar — keduanya dilewati di bit-perfect (HRTFNode dan GainNode
// ada di DSPChain yang tidak jalan di mode ini), jadi daftar ini tidak
// lengkap tanpa mereka.
const BYPASSED = [
  "EQ",
  "bass boost",
  "pelebar stereo",
  "reverb",
  "HRTF",
  "master gain",
  "koreksi headphone",
  "retune (tuning)",
];

export const BitPerfectSubscreen = memo(function BitPerfectSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const status = useBitPerfectStatus();
  const { currentDevice } = useAudioOutput();
  // setAudioMode TIDAK lagi dilanggan di sini — tombol DSP (memo, tanpa
  // prop) memiliki selector-nya sendiri di SwitchToDspButton.

  const verdict = describeBitPerfectPath(status);
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
        <Text style={[styles.displayTitle, { color: colors.text.primary }]}>
          Jalur sinyal
        </Text>

        <VerdictRows
          label={verdict.label}
          note={verdict.note}
          tone={verdict.tone}
        />
        <OutputDeviceRow deviceName={deviceName} deviceType={deviceType} />
        <StreamRateRows sampleRate={sampleRate} hardwareRate={hardwareRate} />

        {/* Yang dilewati — statis, tinggal di shell memo. */}
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
      <SwitchToDspButton />
    </View>
  );
});

interface VerdictRowsProps {
  label: string;
  note: string;
  tone: BitPerfectPathTone;
}

/**
 * Baris verdict stream — hanya render ulang bila label/note/tone
 * berubah. Perubahan laju atau perangkat tidak menyentuhnya.
 */
const VerdictRows = memo(function VerdictRows({
  label,
  note,
  tone,
}: VerdictRowsProps) {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  // FASE 3 EQ: warna tone mentah (hijau/oranye aksen) gagal AA di tema
  // terang (terukur 4,15–4,51). Pola Equalizer: aksen dipakai selama
  // terbaca di atas permukaan kartu, jatuh ke teks bila tidak.
  const toneColor = (t: BitPerfectPathTone): string => {
    switch (t) {
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

  return (
    <View>
      {/* Status stream */}
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>
          Status stream
        </Text>
        <Text
          style={[
            styles.rowValue,
            { color: toneColor(tone), textAlign: "right" },
          ]}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.rowNote,
          { color: colors.text.tertiary, marginBottom: spacing.sm },
        ]}
      >
        {note}
      </Text>
    </View>
  );
});

interface OutputDeviceRowProps {
  deviceName: string;
  deviceType: string | undefined;
}

/**
 * Baris perangkat output — hanya render ulang bila nama/tipe perangkat
 * berganti. Poll status bit-perfect tidak menyentuhnya.
 */
const OutputDeviceRow = memo(function OutputDeviceRow({
  deviceName,
  deviceType,
}: OutputDeviceRowProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
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
  );
});

interface StreamRateRowsProps {
  sampleRate: string;
  hardwareRate: string;
}

/**
 * Baris laju stream (app + hardware) — hanya render ulang bila salah
 * satu laju berubah. Perubahan verdict tidak menyentuhnya.
 */
const StreamRateRows = memo(function StreamRateRows({
  sampleRate,
  hardwareRate,
}: StreamRateRowsProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View>
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
    </View>
  );
});

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
  // P2 audit BitPerfect/Solfeggio 2026-11-20: keluarga tab EQ nol
  // Playfair — satu-satunya tanpa suara display. Satu jenjang display
  // (h4, 20/28 — seperti statusValue Analyzer): judul kartu utama tiap
  // layar memakai displayBold, sisanya tetap Inter.
  displayTitle: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.displayBold,
    lineHeight: 28,
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
});
