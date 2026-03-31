// src/features/library/components/FileTypeList.tsx
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
interface FileTypeItem {
  codec: string;
  count: number;
}

interface FileTypeListProps {
  fileTypes: FileTypeItem[];
  tracks: MediaTrack[];
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (id: string) => void;
}

// ── Codec metadata ────────────────────────────────────────────────────────────
// Warna dan label per format audio — audiophile-aware
const CODEC_META: Record<string, { color: string; bg: string; label: string; isHiRes: boolean }> = {
  FLAC:  { color: "#3b82f6", bg: "#3b82f618", label: "FLAC",        isHiRes: true  },
  WAV:   { color: "#8b5cf6", bg: "#8b5cf618", label: "WAV",         isHiRes: true  },
  AIFF:  { color: "#8b5cf6", bg: "#8b5cf618", label: "AIFF",        isHiRes: true  },
  DSD:   { color: "#f59e0b", bg: "#f59e0b18", label: "DSD",         isHiRes: true  },
  DSDF:  { color: "#f59e0b", bg: "#f59e0b18", label: "DSF",         isHiRes: true  },
  DSF:   { color: "#f59e0b", bg: "#f59e0b18", label: "DSF",         isHiRes: true  },
  DFF:   { color: "#f59e0b", bg: "#f59e0b18", label: "DFF",         isHiRes: true  },
  ALAC:  { color: "#14b8a6", bg: "#14b8a618", label: "ALAC",        isHiRes: true  },
  APE:   { color: "#06b6d4", bg: "#06b6d418", label: "APE",         isHiRes: true  },
  MP3:   { color: "#6b7280", bg: "#6b728018", label: "MP3",         isHiRes: false },
  AAC:   { color: "#6b7280", bg: "#6b728018", label: "AAC",         isHiRes: false },
  OGG:   { color: "#6b7280", bg: "#6b728018", label: "OGG",         isHiRes: false },
  OPUS:  { color: "#6b7280", bg: "#6b728018", label: "OPUS",        isHiRes: false },
  M4A:   { color: "#6b7280", bg: "#6b728018", label: "M4A",         isHiRes: false },
  WMA:   { color: "#6b7280", bg: "#6b728018", label: "WMA",         isHiRes: false },
};

const getCodecMeta = (codec: string) => {
  const key = codec.toUpperCase().replace(/\./g, "");
  return CODEC_META[key] ?? { color: "#9ca3af", bg: "#9ca3af18", label: codec.toUpperCase(), isHiRes: false };
};

// ── FileTypeRow ───────────────────────────────────────────────────────────────
const FileTypeRow = memo(({ item, onPress, colors, spacing }: {
  item: FileTypeItem;
  onPress: (item: FileTypeItem) => void;
  colors: any;
  spacing: any;
}) => {
  const meta = useMemo(() => getCodecMeta(item.codec), [item.codec]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.6}
      style={[styles.row, { paddingHorizontal: spacing.md }]}
    >
      {/* Codec badge box */}
      <View style={[styles.codecBox, { backgroundColor: meta.bg, borderColor: meta.color + "40", borderWidth: 1 }]}>
        <Text style={[styles.codecText, { color: meta.color }]}>{meta.label}</Text>
        {meta.isHiRes && (
          <Text style={[styles.hiresTag, { color: meta.color }]}>HI-RES</Text>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text.primary }]}>
          {meta.label}
          {meta.isHiRes && (
            <Text style={[styles.hiresInline, { color: meta.color }]}> · Lossless</Text>
          )}
        </Text>
        <Text style={[styles.meta, { color: colors.text.secondary }]}>
          {item.count} lagu
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.text.disabled} />
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.codec === next.item.codec &&
  prev.item.count === next.item.count &&
  prev.colors === next.colors
);

// ── FileTypeSongRow ───────────────────────────────────────────────────────────
const FileTypeSongRow = memo(({ track, isNowPlaying, isFavorite, onPress, onToggleFavorite, colors }: {
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

// ── FileTypeDetailHeader ──────────────────────────────────────────────────────
const FileTypeDetailHeader = memo(({ fileType, songCount, totalDuration, onBack, onPlayAll, colors, spacing }: {
  fileType: FileTypeItem;
  songCount: number;
  totalDuration: number;
  onBack: () => void;
  onPlayAll: () => void;
  colors: any;
  spacing: any;
}) => {
  const meta = useMemo(() => getCodecMeta(fileType.codec), [fileType.codec]);

  return (
    <View style={{ backgroundColor: colors.background.secondary }}>
      <TouchableOpacity
        onPress={onBack}
        style={[styles.backRow, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.primary[500]} />
        <Text style={[styles.backLabel, { color: colors.primary[500] }]}>Format</Text>
      </TouchableOpacity>

      <View style={[styles.detailHeader, { paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
        {/* Large codec badge */}
        <View style={[styles.detailCodecBox, { backgroundColor: meta.bg, borderColor: meta.color + "60", borderWidth: 1.5 }]}>
          <Text style={[styles.detailCodecText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.detailInfo}>
          <View style={styles.detailNameRow}>
            <Text style={[styles.detailName, { color: colors.text.primary }]}>
              {meta.label}
            </Text>
            {meta.isHiRes && (
              <View style={[styles.losslessBadge, { backgroundColor: meta.bg, borderColor: meta.color + "60", borderWidth: 1 }]}>
                <Text style={[styles.losslessText, { color: meta.color }]}>LOSSLESS</Text>
              </View>
            )}
          </View>
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

// ── FileTypeList ──────────────────────────────────────────────────────────────
export const FileTypeList: React.FC<FileTypeListProps> = ({
  fileTypes,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [selectedFileType, setSelectedFileType] = useState<FileTypeItem | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedFileType) return [];
    return (tracks ?? []).filter(
      (t) => (t.codec || "Unknown").toUpperCase() === selectedFileType.codec.toUpperCase()
    );
  }, [tracks, selectedFileType]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs]
  );

  const handleFileTypePress = useCallback((ft: FileTypeItem) => setSelectedFileType(ft), []);
  const handleBack = useCallback(() => setSelectedFileType(null), []);
  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length > 0) onSongPress(filteredSongs[0], filteredSongs);
  }, [filteredSongs, onSongPress]);
  const handleSongPress = useCallback(
    (track: MediaTrack) => onSongPress(track, filteredSongs),
    [filteredSongs, onSongPress]
  );

  // ── Format list ───────────────────────────────────────────────────────────────
  if (!selectedFileType) {
    if (!fileTypes.length) {
      return (
        <View style={[styles.empty, { backgroundColor: colors.background.primary }]}>
          <Ionicons name="document-outline" size={52} color={colors.text.disabled} />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>Belum ada format</Text>
          <Text style={[styles.emptySubText, { color: colors.text.disabled }]}>
            Scan library terlebih dahulu
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={fileTypes}
        keyExtractor={(item) => item.codec}
        renderItem={({ item }) => (
          <FileTypeRow item={item} onPress={handleFileTypePress} colors={colors} spacing={spacing} />
        )}
        contentContainerStyle={{ paddingVertical: spacing.xs, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.background.tertiary, marginLeft: 76 }]} />
        )}
      />
    );
  }

  // ── Format detail ─────────────────────────────────────────────────────────────
  return (
    <FlatList
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <FileTypeDetailHeader
          fileType={selectedFileType}
          songCount={filteredSongs.length}
          totalDuration={totalDuration}
          onBack={handleBack}
          onPlayAll={handlePlayAll}
          colors={colors}
          spacing={spacing}
        />
      }
      renderItem={({ item }) => (
        <FileTypeSongRow
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
  // Format row
  row: { flexDirection: "row", alignItems: "center", height: 68, gap: 14 },
  codecBox: {
    width: 62,
    height: 46,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    gap: 2,
  },
  codecText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  hiresTag: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  hiresInline: { fontSize: 13 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  meta: { fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth },

  // Empty
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13 },

  // Detail header
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  detailHeader: { flexDirection: "row", gap: 16, alignItems: "center" },
  detailCodecBox: {
    width: 88,
    height: 88,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  detailCodecText: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  detailInfo: { flex: 1, gap: 6 },
  detailNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  detailName: { fontSize: 22, fontWeight: "800" },
  losslessBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  losslessText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  detailMeta: { fontSize: 13 },
  playAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  playAllLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  divider: { height: 1 },

  // Song rows
  songRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 64 },
  songIcon: { width: 40, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  songInfo: { flex: 1, marginHorizontal: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  songTitle: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 4 },
  songSub: { fontSize: 12, marginTop: 1 },
  rightActions: { alignItems: "flex-end", gap: 4 },
  duration: { fontSize: 10 },
});
 