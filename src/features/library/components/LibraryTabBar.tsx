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

import { useTheme } from "@/context/ThemeContext";
import type { LibraryTab } from "../store/libraryStore";

// ── Tab Configuration ────────────────────────────────────────────────────────
export const TABS: { id: LibraryTab; label: string; icon: any }[] = [
  { id: "song",     label: "Songs",     icon: Music2 },
  { id: "album",    label: "Albums",    icon: Disc3 },
  { id: "artist",   label: "Artists",   icon: Mic2 },
  { id: "genre",    label: "Genres",    icon: LayoutGrid },
  { id: "folder",   label: "Folders",   icon: FolderArchive },
  { id: "playlist", label: "Playlists", icon: ListMusic },
  { id: "filetype", label: "Formats",   icon: Binary },
];

interface Props {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  isScanning: boolean;
  scanProgress: number;
  scanTotal?: number;
  onRefresh: () => void;
  trackCount: number;
}

export const LibraryTabBar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  isScanning,
  scanProgress,
  scanTotal = 0,
  onRefresh,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const scrollRef = useRef<ScrollView>(null);

  const handleTabPress = useCallback((tabId: LibraryTab) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(tabId);
  }, [onTabChange]);

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRefresh();
  }, [onRefresh]);

  const progressPercent = scanTotal > 0 ? Math.floor((scanProgress / scanTotal) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Scan Status Pill (Hanya muncul saat scanning) */}
      {isScanning && (
        <View style={[styles.scanOverlay, { backgroundColor: colors.background.secondary }]}>
          <View style={styles.scanInfo}>
            <ActivityIndicator size="small" color={colors.primary[500]} style={{ transform: [{ scale: 0.8 }] }} />
            <Text style={[styles.scanText, { color: colors.text.secondary }]}>
              {scanTotal > 0 ? `Indexing: ${scanProgress}/${scanTotal}` : "Analyzing Storage..."}
            </Text>
          </View>
          {scanTotal > 0 && (
            <View style={[styles.progressTrack, { backgroundColor: colors.background.tertiary }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary[500], width: `${progressPercent}%` }]} />
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
                  backgroundColor: isActive ? colors.primary[500] : `${colors.background.tertiary}80`,
                  borderColor: isActive ? colors.primary[500] : colors.background.tertiary,
                },
              ]}
            >
              <Icon 
                size={16} 
                color={isActive ? "#fff" : colors.text.tertiary} 
                strokeWidth={isActive ? 2.5 : 2} 
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? "#fff" : colors.text.secondary }
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
          style={[styles.refreshBtn, { backgroundColor: `${colors.background.tertiary}80` }]}
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
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 8,
  },
  // Scan UI
  scanOverlay: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
      android: { elevation: 2 }
    })
  },
  scanInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  progressTrack: { height: 4, width: 80, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

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
    marginLeft: 4
  },
});
 