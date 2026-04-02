// src/features/library/components/ArtistList.tsx
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
interface ArtistItem {
  name: string;
  trackCount: number;
  albumCount: number;
}

interface ArtistListProps {
  /** Pre-computed artists dari selectArtists() di parent */
  artists: ArtistItem[];
  /** Raw tracks — untuk filter lagu per artist */
  tracks: MediaTrack[];
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (id: string) => void;
}

// ── ArtistRow ─────────────────────────────────────────────────────────────────
interface ArtistRowProps {
  item: ArtistItem;
  onPress: (item: ArtistItem) => void;
  colors: any;
  spacing: any;
}

const ArtistRow = memo(
  ({ item, onPress, colors, spacing }: ArtistRowProps) => {
    const handlePress = useCallback(() => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress(item);
    }, [item, onPress]);

    // Generate warna avatar dari nama artist (konsisten per nama)
    const avatarColor = useMemo(() => {
      const palette = [
        "#6366f1",
        "#8b5cf6",
        "#ec4899",
        "#f43f5e",
        "#f97316",
        "#eab308",
        "#22c55e",
        "#14b8a6",
        "#3b82f6",
        "#06b6d4",
      ];
      let hash = 0;
      for (let i = 0; i < item.name.length; i++) {
        hash = item.name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return palette[Math.abs(hash) % palette.length];
    }, [item.name]);

    const initials = useMemo(() => {
      const words = item.name.trim().split(/\s+/);
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }, [item.name]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.6}
        style={[styles.row, { paddingHorizontal: spacing.md }]}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
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
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {item.trackCount} lagu
            {item.albumCount > 0 ? ` · ${item.albumCount} album` : ""}
          </Text>
        </View>

        {/* Chevron */}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.text.disabled}
        />
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item.name === next.item.name &&
    prev.item.trackCount === next.item.trackCount &&
    prev.colors === next.colors,
);

// ── ArtistSongRow ─────────────────────────────────────────────────────────────
interface ArtistSongRowProps {
  track: MediaTrack;
  isNowPlaying: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  colors: any;
}

const ArtistSongRow = memo(
  ({
    track,
    isNowPlaying,
    isFavorite,
    onPress,
    onToggleFavorite,
    colors,
  }: ArtistSongRowProps) => {
    const handlePress = useCallback(() => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }, [onPress]);

    const handleFav = useCallback(() => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onToggleFavorite?.();
    }, [onToggleFavorite]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.6}
        style={[
          styles.songRow,
          isNowPlaying && { backgroundColor: colors.background.tertiary },
        ]}
      >
        <View
          style={[
            styles.songIcon,
            {
              backgroundColor: isNowPlaying
                ? `${colors.primary[500]}20`
                : colors.background.secondary,
            },
          ]}
        >
          <Ionicons
            name={isNowPlaying ? "stats-chart" : "musical-note"}
            size={18}
            color={isNowPlaying ? colors.primary[500] : colors.text.tertiary}
          />
        </View>

        <View style={styles.songInfo}>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.songTitle,
                {
                  color: isNowPlaying
                    ? colors.primary[500]
                    : colors.text.primary,
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {track.title}
            </Text>
            {(track.sampleRate || track.codec) && (
              <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
            )}
          </View>
          <Text
            style={[styles.songAlbum, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {track.album || "Unknown Album"}
          </Text>
        </View>

        <View style={styles.rightActions}>
          {onToggleFavorite && (
            <TouchableOpacity
              onPress={handleFav}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={18}
                color={isFavorite ? colors.status.error : colors.text.tertiary}
              />
            </TouchableOpacity>
          )}
          <Text
            style={[
              styles.duration,
              {
                color: colors.text.disabled,
                fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
              },
            ]}
          >
            {formatTime(track.duration || 0)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.track.id === next.track.id &&
    prev.isNowPlaying === next.isNowPlaying &&
    prev.isFavorite === next.isFavorite &&
    prev.colors === next.colors,
);

// ── ArtistDetailHeader ────────────────────────────────────────────────────────
interface ArtistDetailHeaderProps {
  artist: ArtistItem;
  songCount: number;
  totalDuration: number;
  avatarColor: string;
  initials: string;
  onBack: () => void;
  onPlayAll: () => void;
  colors: any;
  spacing: any;
}

const ArtistDetailHeader = memo(
  ({
    artist,
    songCount,
    totalDuration,
    avatarColor,
    initials,
    onBack,
    onPlayAll,
    colors,
    spacing,
  }: ArtistDetailHeaderProps) => (
    <View style={{ backgroundColor: colors.background.secondary }}>
      <TouchableOpacity
        onPress={onBack}
        style={[
          styles.backRow,
          { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.primary[500]} />
        <Text style={[styles.backLabel, { color: colors.primary[500] }]}>
          Artists
        </Text>
      </TouchableOpacity>

      <View
        style={[
          styles.detailHeader,
          { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
        ]}
      >
        {/* Large avatar */}
        <View style={[styles.detailAvatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.detailAvatarText}>{initials}</Text>
        </View>
        <View style={styles.detailInfo}>
          <Text
            style={[styles.detailName, { color: colors.text.primary }]}
            numberOfLines={2}
          >
            {artist.name}
          </Text>
          <Text style={[styles.detailMeta, { color: colors.text.disabled }]}>
            {songCount} lagu · {formatTime(totalDuration)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onPlayAll}
        style={[
          styles.playAllBtn,
          {
            backgroundColor: colors.primary[500],
            marginHorizontal: spacing.md,
            marginBottom: spacing.md,
          },
        ]}
      >
        <Ionicons name="play" size={16} color="#fff" />
        <Text style={styles.playAllLabel}>Putar Semua</Text>
      </TouchableOpacity>

      <View
        style={[
          styles.divider,
          { backgroundColor: colors.background.tertiary },
        ]}
      />
    </View>
  ),
);

// ── ArtistList ────────────────────────────────────────────────────────────────
export const ArtistList: React.FC<ArtistListProps> = ({
  artists,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [selectedArtist, setSelectedArtist] = useState<ArtistItem | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedArtist) return [];
    return (tracks ?? []).filter(
      (t) => (t.artist || "Unknown Artist") === selectedArtist.name,
    );
  }, [tracks, selectedArtist]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs],
  );

  // Avatar props untuk detail header (harus konsisten dengan row)
  const detailAvatarColor = useMemo(() => {
    if (!selectedArtist) return "#6366f1";
    const palette = [
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
      "#f43f5e",
      "#f97316",
      "#eab308",
      "#22c55e",
      "#14b8a6",
      "#3b82f6",
      "#06b6d4",
    ];
    let hash = 0;
    for (let i = 0; i < selectedArtist.name.length; i++) {
      hash = selectedArtist.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }, [selectedArtist]);

  const detailInitials = useMemo(() => {
    if (!selectedArtist) return "";
    const words = selectedArtist.name.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }, [selectedArtist]);

  const handleArtistPress = useCallback((artist: ArtistItem) => {
    setSelectedArtist(artist);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedArtist(null);
  }, []);

  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length > 0) onSongPress(filteredSongs[0], filteredSongs);
  }, [filteredSongs, onSongPress]);

  const handleSongPress = useCallback(
    (track: MediaTrack) => onSongPress(track, filteredSongs),
    [filteredSongs, onSongPress],
  );

  // ── Render: Artist list ───────────────────────────────────────────────────────
  if (!selectedArtist) {
    if (!artists.length) {
      return (
        <View
          style={[styles.empty, { backgroundColor: colors.background.primary }]}
        >
          <Ionicons
            name="person-outline"
            size={52}
            color={colors.text.disabled}
          />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
            Belum ada artist
          </Text>
          <Text style={[styles.emptySubText, { color: colors.text.disabled }]}>
            Scan library terlebih dahulu
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        key="artist-list"
        data={artists}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <ArtistRow
            item={item}
            onPress={handleArtistPress}
            colors={colors}
            spacing={spacing}
          />
        )}
        contentContainerStyle={{
          paddingVertical: spacing.xs,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        ItemSeparatorComponent={() => (
          <View
            style={[
              styles.separator,
              { backgroundColor: colors.background.tertiary, marginLeft: 76 },
            ]}
          />
        )}
      />
    );
  }

  // ── Render: Artist detail ─────────────────────────────────────────────────────
  return (
    <FlatList
      key="artist-detail"
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <ArtistDetailHeader
          artist={selectedArtist}
          songCount={filteredSongs.length}
          totalDuration={totalDuration}
          avatarColor={detailAvatarColor}
          initials={detailInitials}
          onBack={handleBack}
          onPlayAll={handlePlayAll}
          colors={colors}
          spacing={spacing}
        />
      }
      renderItem={({ item }) => (
        <ArtistSongRow
          track={item}
          isNowPlaying={item.id === currentTrackId}
          isFavorite={favoriteIds.has(item.id)}
          onPress={() => handleSongPress(item)}
          onToggleFavorite={
            onToggleFavorite ? () => onToggleFavorite(item.id) : undefined
          }
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
  // Artist row
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 68,
    gap: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
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
  detailAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  detailAvatarText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  detailInfo: { flex: 1, gap: 6 },
  detailName: { fontSize: 20, fontWeight: "700", lineHeight: 24 },
  detailMeta: { fontSize: 13 },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  playAllLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  divider: { height: 1 },

  // Song rows
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 64,
  },
  songIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  songInfo: { flex: 1, marginHorizontal: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  songTitle: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 4 },
  songAlbum: { fontSize: 12, marginTop: 1 },
  rightActions: { alignItems: "flex-end", gap: 4 },
  duration: { fontSize: 10 },
});
