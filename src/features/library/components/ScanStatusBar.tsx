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

export function ScanStatusBar() {
  const { colors } = useTheme().theme;
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
        <ActivityIndicator size="small" color="#fff" />
        <Text style={[styles.text, { color: "#fff" }]} numberOfLines={1}>
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
        <ActivityIndicator size="small" color="#fff" />
        <View style={styles.textContainer}>
          <Text style={[styles.text, { color: "#fff" }]} numberOfLines={1}>
            Enhancing {current}/{total} songs...
          </Text>
          {currentSong && (
            <Text
              style={[styles.subtext, { color: "rgba(255,255,255,0.8)" }]}
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
        <Sparkles size={16} color="#fff" />
        <Text style={[styles.text, { color: "#fff" }]}>
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
