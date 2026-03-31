// src/features/library/components/FolderList.tsx
import React, { memo, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// ── Types ──────────────────────────────────────────────────────────────────────
interface FolderItem {
  path: string;
  name: string;
  count: number;
}

interface FolderListProps {
  folders: FolderItem[];
  tracks: MediaTrack[];
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (id: string) => void;
}

// ── Path helper ───────────────────────────────────────────────────────────────
// SAF path bisa berupa: /storage/emulated/0/Music atau
// content://com.android.externalstorage.documents/tree/primary%3AMusic
// Ambil bagian yang readable untuk ditampilkan sebagai breadcrumb
const formatPath = (path: string): string => {
  try {
    // Decode URI encoding
    const decoded = decodeURIComponent(path);
    // Hapus prefix SAF yang panjang
    const cleaned = decoded
      .replace(/^content:\/\/[^/]+\/tree\//, "")
      .replace(/^primary:/, "")
      .replace(/^\/storage\/emulated\/0\//, "");
    return cleaned || path;
  } catch {
    return path;
  }
};

// ── FolderRow ─────────────────────────────────────────────────────────────────
const FolderRow = memo(({ item, onPress, colors, spacing }: {
  item: FolderItem;
  onPress: (item: FolderItem) => void;
  colors: any;
  spacing: any;
}) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  const displayPath = useMemo(() => formatPath(item.path), [item.path]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.6}
      style={[styles.row, { paddingHorizontal: spacing.md }]}
    >
      {/* Folder icon */}
      <View style={[styles.iconBox, { backgroundColor: `${colors.primary[500]}18` }]}>
        <Ionicons name="folder" size={24} color={colors.primary[500]} />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text
          style={[styles.name, { color: colors.text.primary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.name}
        </Text>
        <Text
          style={[styles.path, { color: colors.text.tertiary }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {displayPath}
        </Text>
        <Text style={[styles.meta, { color: colors.text.secondary }]}>
          {item.count} lagu
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.text.disabled} />
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.path === next.item.path &&
  prev.item.count === next.item.count &&
  prev.colors === next.colors
);

// ── FolderSongRow ─────────────────────────────────────────────────────────────
const FolderSongRow = memo(({ track, isNowPlaying, isFavorite, onPress, onToggleFavorite, colors }: {
  track: MediaTrack;
  isNowPlaying: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  colors: any;
}) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const handleFav = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleFavorite?.();
  }, [onToggleFavorite]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.6}
      style={[styles.songRow, isNowPlaying && { backgroundColor: colors.background.tertiary }]}
    >
      <View style={[
        styles.songIcon,
        { backgroundColor: isNowPlaying ? `${colors.primary[500]}20` : colors.background.secondary },
      ]}>
        <Ionicons
          name={isNowPlaying ? "stats-chart" : "musical-note"}
          size={18}
          color={isNowPlaying ? colors.primary[500] : colors.text.tertiary}
        />
      </View>

      <View style={styles.songInfo}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.songTitle, { color: isNowPlaying ? colors.primary[500] : colors.text.primary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {track.title}
          </Text>
          {(track.sampleRate || track.codec) && (
            <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
          )}
        </View>
        <Text style={[styles.songSub, { color: colors.text.secondary }]} numberOfLines={1}>
          {track.artist || "Unknown Artist"}
          {track.album ? ` · ${track.album}` : ""}
        </Text>
      </View>

      <View style={styles.rightActions}>
        {onToggleFavorite && (
          <TouchableOpacity onPress={handleFav} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={isFavorite ? colors.status.error : colors.text.tertiary}
            />
          </TouchableOpacity>
        )}
        <Text style={[styles.duration, {
          color: colors.text.disabled,
          fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
        }]}>
          {formatTime(track.duration || 0)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.track.id === next.track.id &&
  prev.isNowPlaying === next.isNowPlaying &&
  prev.isFavorite === next.isFavorite &&
  prev.colors === next.colors
);

// ── FolderDetailHeader ────────────────────────────────────────────────────────
const FolderDetailHeader = memo(({ folder, songCount, totalDuration, onBack, onPlayAll, colors, spacing }: {
  folder: FolderItem;
  songCount: number;
  totalDuration: number;
  onBack: () => void;
  onPlayAll: () => void;
  colors: any;
  spacing: any;
}) => {
  const displayPath = useMemo(() => formatPath(folder.path), [folder.path]);

  return (
    <View style={{ backgroundColor: colors.background.secondary }}>
      <TouchableOpacity
        onPress={onBack}
        style={[styles.backRow, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.primary[500]} />
        <Text style={[styles.backLabel, { color: colors.primary[500] }]}>Folders</Text>
      </TouchableOpacity>

      <View style={[styles.detailHeader, { paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
        <View style={[styles.detailIconBox, { backgroundColor: `${colors.primary[500]}18` }]}>
          <Ionicons name="folder" size={44} color={colors.primary[500]} />
        </View>
        <View style={styles.detailInfo}>
          <Text style={[styles.detailName, { color: colors.text.primary }]} numberOfLines={2}>
            {folder.name}
          </Text>
          <Text
            style={[styles.detailPath, { color: colors.text.tertiary }]}
            numberOfLines={2}
            ellipsizeMode="middle"
          >
            {displayPath}
          </Text>
          <Text style={[styles.detailMeta, { color: colors.text.disabled }]}>
            {songCount} lagu · {formatTime(totalDuration)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onPlayAll}
        style={[styles.playAllBtn, {
          backgroundColor: colors.primary[500],
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
        }]}
      >
        <Ionicons name="play" size={16} color="#fff" />
        <Text style={styles.playAllLabel}>Putar Semua</Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: colors.background.tertiary }]} />
    </View>
  );
});

// ── FolderList ────────────────────────────────────────────────────────────────
export const FolderList: React.FC<FolderListProps> = ({
  folders,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedFolder) return [];
    return (tracks ?? []).filter((t) => t.folder === selectedFolder.path);
  }, [tracks, selectedFolder]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs]
  );

  const handleFolderPress = useCallback((folder: FolderItem) => setSelectedFolder(folder), []);
  const handleBack = useCallback(() => setSelectedFolder(null), []);
  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length > 0) onSongPress(filteredSongs[0], filteredSongs);
  }, [filteredSongs, onSongPress]);
  const handleSongPress = useCallback(
    (track: MediaTrack) => onSongPress(track, filteredSongs),
    [filteredSongs, onSongPress]
  );

  // ── Folder list ───────────────────────────────────────────────────────────────
  if (!selectedFolder) {
    if (!folders.length) {
      return (
        <View style={[styles.empty, { backgroundColor: colors.background.primary }]}>
          <Ionicons name="folder-open-outline" size={52} color={colors.text.disabled} />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>Belum ada folder</Text>
          <Text style={[styles.emptySubText, { color: colors.text.disabled }]}>
            Scan library terlebih dahulu
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={folders}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <FolderRow item={item} onPress={handleFolderPress} colors={colors} spacing={spacing} />
        )}
        contentContainerStyle={{ paddingVertical: spacing.xs, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.background.tertiary, marginLeft: 72 }]} />
        )}
      />
    );
  }

  // ── Folder detail ─────────────────────────────────────────────────────────────
  return (
    <FlatList
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <FolderDetailHeader
          folder={selectedFolder}
          songCount={filteredSongs.length}
          totalDuration={totalDuration}
          onBack={handleBack}
          onPlayAll={handlePlayAll}
          colors={colors}
          spacing={spacing}
        />
      }
      renderItem={({ item }) => (
        <FolderSongRow
          track={item}
          isNowPlaying={item.id === currentTrackId}
          isFavorite={favoriteIds.has(item.id)}
          onPress={() => handleSongPress(item)}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(item.id) : undefined}
          colors={colors}
        />
      )}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={15}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
    />
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 68, gap: 14, paddingVertical: 8 },
  iconBox: { width: 46, height: 46, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", marginBottom: 1 },
  path: { fontSize: 11, marginBottom: 2 },
  meta: { fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  detailHeader: { flexDirection: "row", gap: 16, alignItems: "center" },
  detailIconBox: { width: 88, height: 88, borderRadius: 20, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  detailInfo: { flex: 1, gap: 4 },
  detailName: { fontSize: 20, fontWeight: "700", lineHeight: 24 },
  detailPath: { fontSize: 11, lineHeight: 15 },
  detailMeta: { fontSize: 13 },
  playAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  playAllLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  divider: { height: 1 },
  songRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 64 },
  songIcon: { width: 40, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  songInfo: { flex: 1, marginHorizontal: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  songTitle: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 4 },
  songSub: { fontSize: 12, marginTop: 1 },
  rightActions: { alignItems: "flex-end", gap: 4 },
  duration: { fontSize: 10 },
});
 