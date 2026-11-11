// Tambahkan animasi atau indicator yang lebih jelas

import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useScanManager } from "../hooks/useScanManager";
import { useRouter } from "expo-router";
import { Sparkles, Loader2 } from "lucide-react-native"; // ➕ Gunakan icon yang berputar
import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

export function ScanStatusBar() {
  const { colors } = useTheme().theme;

  // Teks/ikon di atas bar primary[500] dan status.success — dipilih dari
  // luminansi latar (putih 2,24:1 / 2,48:1 di Noir, hitam 9,37:1 / 8,45:1),
  // bukan hardcoded "#fff".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";
  const onSuccess =
    pickReadable(["#FFFFFF", "#000000"], colors.status.success, AA_NORMAL) ??
    "#FFFFFF";
  const {
    isAutoScanning,
    autoScanProgress,
    isEnriching,
    enrichmentProgress,
    enrichmentQueueSize,
    unenrichedCount,
    isBackgroundEnriching,
  } = useScanManager();

  const router = useRouter();

  // Auto scan - PRIORITY TINGGI, selalu tampil
  if (isAutoScanning) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.primary[500] }]}
      >
        <ActivityIndicator size="small" color={onPrimary} />
        <Text style={[styles.text, { color: onPrimary }]} numberOfLines={1}>
          {autoScanProgress
            ? `Scanning library... ${autoScanProgress.current}/${autoScanProgress.total}`
            : "Scanning library..."}
        </Text>
      </View>
    );
  }

  // Manual scan
  if (isEnriching && enrichmentProgress) {
    const { current, total, currentSong } = enrichmentProgress;
    return (
      <View
        style={[styles.container, { backgroundColor: colors.status.success }]}
      >
        <ActivityIndicator size="small" color={onSuccess} />
        <View style={styles.textContainer}>
          <Text style={[styles.text, { color: onSuccess }]} numberOfLines={1}>
            Enhancing {current}/{total} songs...
          </Text>
          {currentSong && (
            <Text
              style={[
                styles.subtext,
                { color: onSuccess, opacity: 0.8 },
              ]}
              numberOfLines={1}
            >
              {currentSong}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Background enrichment
  if (isBackgroundEnriching && enrichmentQueueSize > 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.status.success + "dd" },
        ]}
      >
        <Sparkles size={16} color={onSuccess} />
        <Text style={[styles.text, { color: onSuccess }]}>
          Enhancing {enrichmentQueueSize} songs in background...
        </Text>
      </View>
    );
  }

  // Pending enrichment
  if (unenrichedCount > 0) {
    return (
      <TouchableOpacity
        style={[
          styles.container,
          { backgroundColor: colors.status.success + "20" },
        ]}
        onPress={() => router.push("/(drawer)/settings")}
        activeOpacity={0.8}
      >
        <Sparkles size={16} color={colors.status.success} />
        <Text
          style={[styles.actionText, { color: colors.status.success }]}
          numberOfLines={1}
        >
          ✨ {unenrichedCount} songs ready for metadata enhancement
        </Text>
        <Text style={[styles.arrow, { color: colors.status.success }]}>→</Text>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12, // ➕ Lebih tinggi untuk visibility
    paddingHorizontal: 16,
    gap: 10,
  },
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 14, // ➕ Lebih besar
    fontWeight: "600", // ➕ Bold
    flex: 1,
  },
  subtext: {
    fontSize: 12,
    marginTop: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  arrow: {
    fontSize: 14,
    fontWeight: "600",
  },
});
