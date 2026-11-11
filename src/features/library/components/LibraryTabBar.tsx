import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Music2,
  Disc3,
  Mic2,
  LayoutGrid,
  FolderArchive,
  ListMusic,
  Binary,
  RotateCw,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import type { LibraryTab } from "../types/scan";
import { accentOn, pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

// ── Tab Configuration ────────────────────────────────────────────────────────
export const TABS: { id: LibraryTab; label: string; icon: any }[] = [
  { id: "song", label: "Songs", icon: Music2 },
  { id: "album", label: "Albums", icon: Disc3 },
  { id: "artist", label: "Artists", icon: Mic2 },
  { id: "genre", label: "Genres", icon: LayoutGrid },
  { id: "folder", label: "Folders", icon: FolderArchive },
  { id: "playlist", label: "Playlists", icon: ListMusic },
  { id: "filetype", label: "Formats", icon: Binary },
];

interface Props {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  scanProgress: number;
  scanTotal: number;
  isScanning: boolean;
  isEnriching?: boolean;
  enrichProgress?: number;
  enrichTotal?: number;
  trackCount: number;
  // U-P2-06: boleh mengembalikan Promise<boolean> — false = refresh
  // gagal, supaya LibraryTabBar tidak menembak haptic sukses palsu.
  onRefresh?: () => void | Promise<boolean>;
}

export const LibraryTabBar = ({
  activeTab,
  onTabChange,
  scanProgress,
  scanTotal,
  isScanning,
  isEnriching = false,
  enrichProgress = 0,
  enrichTotal = 0,
  trackCount,
  onRefresh,
}: Props) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const scrollRef = useRef<ScrollView>(null);

  // Teks/ikon pill tab aktif di atas primary[500] — dipilih dari luminansi
  // primary (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#fff".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  const handleTabPress = useCallback(
    (tabId: LibraryTab) => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onTabChange(tabId);
    },
    [onTabChange],
  );

  // U-P2-06: haptic sukses ditembak SETELAH refresh selesai dan hanya
  // bila berhasil — dulu ditembak sebelum onRefresh() dipanggil, jadi
  // refresh yang gagal pun terasa "berhasil". Gagal = haptic error.
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    let ok: boolean | void = true;
    try {
      ok = await onRefresh();
    } catch {
      ok = false;
    }
    if (Platform.OS === "web") return;
    Haptics.notificationAsync(
      ok === false
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success,
    );
  }, [onRefresh]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      {/* Scan Status Pill (Hanya muncul saat scanning) */}
      {(isScanning || isEnriching) && (
        <View
          style={[
            styles.scanOverlay,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          {/* Scan progress */}
          {isScanning && (
            <View style={styles.progressRow}>
              <ActivityIndicator
                size="small"
                color={colors.primary[500]}
                style={{ transform: [{ scale: 0.8 }] }}
              />
              <Text style={[styles.scanText, { color: colors.text.secondary }]}>
                {scanTotal > 0
                  ? `Scanning ${scanProgress} / ${scanTotal} files`
                  : "Discovering files..."}
              </Text>
              {scanTotal > 0 && (
                <Text style={[styles.pctText, { color: colors.primary[500] }]}>
                  {Math.floor((scanProgress / scanTotal) * 100)}%
                </Text>
              )}
            </View>
          )}

          {/* Progress bar scan */}
          {isScanning && scanTotal > 0 && (
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.background.tertiary },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary[500],
                    width: `${Math.floor((scanProgress / scanTotal) * 100)}%`,
                  },
                ]}
              />
            </View>
          )}

          {/* Enrichment progress */}
          {isEnriching && (
            <View style={[styles.progressRow, isScanning && { marginTop: 8 }]}>
              <ActivityIndicator
                size="small"
                color={accentOn([colors.accent.purple], colors.background.secondary, [colors.text.primary])}
                style={{ transform: [{ scale: 0.8 }] }}
              />
              <Text style={[styles.scanText, { color: colors.text.secondary }]}>
                {enrichTotal > 0
                  ? `Enriching ${enrichProgress} / ${enrichTotal} tracks`
                  : "Reading audio metadata..."}
              </Text>
              {enrichTotal > 0 && (
                <Text
                  style={[
                    styles.pctText,
                    { color: accentOn([colors.accent.purple], colors.background.secondary, [colors.text.primary]) },
                  ]}
                >
                  {Math.floor(((enrichProgress ?? 0) / enrichTotal) * 100)}%
                </Text>
              )}
            </View>
          )}

          {/* Progress bar enrich */}
          {isEnriching && (enrichTotal ?? 0) > 0 && (
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.background.tertiary, marginTop: 4 },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: accentOn([colors.accent.purple], colors.background.secondary, [colors.text.primary]),
                    width: `${Math.floor(((enrichProgress ?? 0) / (enrichTotal ?? 1)) * 100)}%`,
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}

      {/* Horizontal Tab Navigation */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => handleTabPress(tab.id)}
              activeOpacity={0.8}
              style={[
                styles.tabPill,
                {
                  backgroundColor: isActive
                    ? colors.primary[500]
                    : `${colors.background.tertiary}80`,
                  borderColor: isActive
                    ? colors.primary[500]
                    : colors.background.tertiary,
                },
              ]}
            >
              <Icon
                size={16}
                color={isActive ? onPrimary : colors.text.tertiary}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? onPrimary : colors.text.secondary,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Refresh Action */}
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isScanning}
          style={[
            styles.refreshBtn,
            { backgroundColor: `${colors.background.tertiary}80` },
          ]}
        >
          <RotateCw
            size={16}
            color={isScanning ? colors.text.disabled : colors.primary[500]}
            strokeWidth={2.5}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: "center",
    gap: 8,
  },
  // Scan UI
  scanOverlay: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
    }),
  },
  scanInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  scanText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  progressTrack: { height: 4, width: 80, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },

  // Tab Pills
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pctText: {
    fontSize: 11,
    fontWeight: "800",
    marginLeft: "auto",
  },
});
