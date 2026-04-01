import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

// Lucide Icons (nama yang benar)
import {
  Music,        // musical notes
  Disc,         // album
  User,         // artist
  Grid,         // genre
  Folder,       // folder
  List,         // playlist
  FileText,     // filetype
  RefreshCw,    // refresh
} from "lucide-react-native";

import { useTheme } from "@/context/ThemeContext";
import type { LibraryTab } from "../store/libraryStore";

export const TABS: { id: LibraryTab; label: string; icon: React.ReactNode }[] = [
  { id: "song",     label: "Song",     icon: <Music size={14} strokeWidth={2.5} /> },
  { id: "album",    label: "Album",    icon: <Disc size={14} strokeWidth={2.5} /> },
  { id: "artist",   label: "Artist",   icon: <User size={14} strokeWidth={2.5} /> },
  { id: "genre",    label: "Genre",    icon: <Grid size={14} strokeWidth={2.5} /> },
  { id: "folder",   label: "Folder",   icon: <Folder size={14} strokeWidth={2.5} /> },
  { id: "playlist", label: "Playlist", icon: <List size={14} strokeWidth={2.5} /> },
  { id: "filetype", label: "Format",   icon: <FileText size={14} strokeWidth={2.5} /> },
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
  trackCount,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={{ backgroundColor: colors.background.secondary }}>
      {/* Scan status bar */}
      {isScanning && (
        <View style={[styles.scanBar, { backgroundColor: colors.background.tertiary, paddingHorizontal: spacing.md }]}>
          <ActivityIndicator size="small" color={colors.primary[500]} />

          {scanTotal > 0 ? (
            <>
              <Text style={[styles.scanText, { color: colors.text.secondary, marginLeft: spacing.xs }]}>
                Memindai {scanProgress} / {scanTotal}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: colors.background.elevated, flex: 1, marginLeft: spacing.sm }]}>
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
            </>
          ) : (
            <Text style={[styles.scanText, { color: colors.text.secondary, marginLeft: spacing.xs }]}>
              Mengumpulkan file...
            </Text>
          )}
        </View>
      )}

      {/* Tab list */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? colors.primary[500] : colors.background.tertiary,
                  marginRight: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <View style={{ color: isActive ? colors.background.primary : colors.text.secondary }}>
                {tab.icon}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.background.primary : colors.text.secondary,
                    marginLeft: 4,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Refresh button */}
        <TouchableOpacity
          onPress={onRefresh}
          disabled={isScanning}
          style={[
            styles.tab,
            {
              backgroundColor: colors.background.tertiary,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <RefreshCw
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
  scanBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  scanText: { fontSize: 11 },
  progressBar: { height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
}); 