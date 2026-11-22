/**
 * ScanStatusBar — notifikasi progres scan/enrichment.
 *
 * Sejak 2026-11-18 (keputusan csheva): BUKAN lagi banner full-width hijau
 * terang di atas layar Library. Bentuknya chip kecil yang duduk TEPAT DI
 * ATAS pill FloatingPlayer (dirender dari tabs/_layout.tsx, mengikuti pill
 * di semua tab) — background surface tema, teks kecil muted, tidak menutupi
 * pill, tab bar, atau konten. Chip non-interaktif (pointerEvents none).
 *
 * Perilaku tetap: hanya tampil saat ada scan/enrichment berjalan
 * (3 cabang di bawah, kondisi sama seperti sebelumnya); hilang saat
 * selesai. Teks/angka progres sama.
 *
 * Cabang toast "N songs ready for metadata enhancement" (unenrichedCount)
 * DINONAKTIFKAN 2026-11-18 dan tetap mati: pintu masuk enrichment tetap
 * ada di badge header Library (library.tsx).
 */
import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useScanProgress } from "../hooks/useScanManager";
import { Sparkles } from "lucide-react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { isScanStatusVisible } from "../utils/scanStatus";

export function useScanStatusVisible(): boolean {
  // Per-node render (2026-11-22): chip + wrapper layout-nya hanya
  // melanggan potongan progres — tick progres membangunkan chip ini
  // saja, bukan layar yang sedang tampil.
  const {
    isAutoScanning,
    isEnriching,
    enrichmentProgress,
    isBackgroundEnriching,
    enrichmentQueueSize,
  } = useScanProgress();
  return isScanStatusVisible({
    isAutoScanning,
    isEnriching,
    enrichmentProgress,
    isBackgroundEnriching,
    enrichmentQueueSize,
  });
}

export function ScanStatusBar() {
  const { colors } = useTheme().theme;
  const {
    isAutoScanning,
    autoScanProgress,
    isEnriching,
    enrichmentProgress,
    enrichmentQueueSize,
    isBackgroundEnriching,
  } = useScanProgress();

  // Teks + ikon + fraksi progres per cabang (teks sama seperti banner lama).
  let icon: React.ReactNode = null;
  let label = "";
  let progress: number | null = null;

  // Auto scan - PRIORITY TINGGI, selalu tampil
  if (isAutoScanning) {
    label = autoScanProgress
      ? `Scanning library... ${autoScanProgress.current}/${autoScanProgress.total}`
      : "Scanning library...";
    progress =
      autoScanProgress && autoScanProgress.total > 0
        ? autoScanProgress.current / autoScanProgress.total
        : null;
    icon = <ActivityIndicator size={14} color={colors.text.secondary} />;
  } else if (isEnriching && enrichmentProgress) {
    const { current, total } = enrichmentProgress;
    label = `Enhancing ${current}/${total} songs...`;
    progress = total > 0 ? current / total : null;
    icon = <ActivityIndicator size={14} color={colors.text.secondary} />;
  } else if (isBackgroundEnriching && enrichmentQueueSize > 0) {
    label = `Enhancing ${enrichmentQueueSize} songs in background...`;
    icon = <Sparkles size={13} color={colors.text.secondary} />;
  } else {
    return null;
  }

  // Subtext nama lagu (cabang manual) sengaja tidak ikut: chip satu baris,
  // supaya tetap kecil dan tidak mencolok. Angka progres sudah ada di teks.
  return (
    <View
      pointerEvents="none"
      style={[
        styles.chip,
        {
          backgroundColor: colors.background.secondary,
          borderColor:
            colors.border?.medium ?? colors.background.tertiary,
        },
      ]}
    >
      <View style={styles.row}>
        {icon}
        <Text
          style={[styles.text, { color: colors.text.secondary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {progress != null && (
        <View
          style={[styles.track, { backgroundColor: colors.background.tertiary }]}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: colors.text.primary,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "center",
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  track: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },
  fill: {
    height: 2,
    borderRadius: 1,
  },
});
