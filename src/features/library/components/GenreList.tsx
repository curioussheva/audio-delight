// src/features/library/components/GenreList.tsx
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
interface GenreItem {
  name: string;
  count: number;
}

interface GenreListProps {
  genres: GenreItem[];
  tracks: MediaTrack[];
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (id: string) => void;
}

// ── Color helper ──────────────────────────────────────────────────────────────
const GENRE_COLORS = [
  { bg: "#6366f120", icon: "#6366f1" },
  { bg: "#8b5cf620", icon: "#8b5cf6" },
  { bg: "#ec489920", icon: "#ec4899" },
  { bg: "#f43f5e20", icon: "#f43f5e" },
  { bg: "#f9731620", icon: "#f97316" },
  { bg: "#eab30820", icon: "#eab308" },
  { bg: "#22c55e20", icon: "#22c55e" },
  { bg: "#14b8a620", icon: "#14b8a6" },
  { bg: "#3b82f620", icon: "#3b82f6" },
  { bg: "#06b6d420", icon: "#06b6d4" },
];

const genreColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GENRE_COLORS[Math.abs(hash) % GENRE_COLORS.length];
};

// ── GenreRow ──────────────────────────────────────────────────────────────────
const GenreRow = memo(
  ({
    item,
    onPress,
    colors,
    spacing,
  }: {
    item: GenreItem;
    onPress: (item: GenreItem) => void;
    colors: any;
    spacing: any;
  }) => {
    const color = useMemo(() => genreColor(item.name), [item.name]);

    const handlePress = useCallback(() => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress(item);
    }, [item, onPress]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.6}
        style={[styles.row, { paddingHorizontal: spacing.md }]}
      >
        <View style={[styles.iconBox, { backgroundColor: color.bg }]}>
          <Ionicons name="musical-notes" size={22} color={color.icon} />
        </View>
        <View style={styles.info}>
          <Text
            style={[styles.name, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {item.count} lagu
          </Text>
        </View>
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
    prev.item.count === next.item.count &&
    prev.colors === next.colors,
);

// ── GenreSongRow ──────────────────────────────────────────────────────────────
const GenreSongRow = memo(
  ({
    track,
    isNowPlaying,
    isFavorite,
    onPress,
    onToggleFavorite,
    colors,
  }: {
    track: MediaTrack;
    isNowPlaying: boolean;
    isFavorite: boolean;
    onPress: () => void;
    onToggleFavorite?: () => void;
    colors: any;
  }) => {
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
            style={[styles.songSub, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {track.artist || "Unknown Artist"}
            {track.album ? ` · ${track.album}` : ""}
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

// ── GenreDetailHeader ─────────────────────────────────────────────────────────
const GenreDetailHeader = memo(
  ({
    genre,
    songCount,
    totalDuration,
    color,
    onBack,
    onPlayAll,
    colors,
    spacing,
  }: {
    genre: GenreItem;
    songCount: number;
    totalDuration: number;
    color: { bg: string; icon: string };
    onBack: () => void;
    onPlayAll: () => void;
    colors: any;
    spacing: any;
  }) => (
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
          Genres
        </Text>
      </TouchableOpacity>

      <View
        style={[
          styles.detailHeader,
          { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
        ]}
      >
        <View style={[styles.detailIconBox, { backgroundColor: color.bg }]}>
          <Ionicons name="musical-notes" size={44} color={color.icon} />
        </View>
        <View style={styles.detailInfo}>
          <Text
            style={[styles.detailName, { color: colors.text.primary }]}
            numberOfLines={2}
          >
            {genre.name}
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

// ── GenreList ─────────────────────────────────────────────────────────────────
export const GenreList: React.FC<GenreListProps> = ({
  genres,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [selectedGenre, setSelectedGenre] = useState<GenreItem | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedGenre) return [];
    return (tracks ?? []).filter(
      (t) => (t.genre || "Unknown") === selectedGenre.name,
    );
  }, [tracks, selectedGenre]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs],
  );

  const selectedColor = useMemo(
    () => (selectedGenre ? genreColor(selectedGenre.name) : GENRE_COLORS[0]),
    [selectedGenre],
  );

  const handleGenrePress = useCallback(
    (genre: GenreItem) => setSelectedGenre(genre),
    [],
  );
  const handleBack = useCallback(() => setSelectedGenre(null), []);
  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length > 0) onSongPress(filteredSongs[0], filteredSongs);
  }, [filteredSongs, onSongPress]);
  const handleSongPress = useCallback(
    (track: MediaTrack) => onSongPress(track, filteredSongs),
    [filteredSongs, onSongPress],
  );

  // ── Genre list ────────────────────────────────────────────────────────────────
  if (!selectedGenre) {
    if (!genres.length) {
      return (
        <View
          style={[styles.empty, { backgroundColor: colors.background.primary }]}
        >
          <Ionicons
            name="grid-outline"
            size={52}
            color={colors.text.disabled}
          />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
            Belum ada genre
          </Text>
          <Text style={[styles.emptySubText, { color: colors.text.disabled }]}>
            Scan library terlebih dahulu
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        key="genre-list"
        data={genres}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <GenreRow
            item={item}
            onPress={handleGenrePress}
            colors={colors}
            spacing={spacing}
          />
        )}
        contentContainerStyle={{
          paddingVertical: spacing.xs,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        ItemSeparatorComponent={() => (
          <View
            style={[
              styles.separator,
              { backgroundColor: colors.background.tertiary, marginLeft: 72 },
            ]}
          />
        )}
      />
    );
  }

  // ── Genre detail ──────────────────────────────────────────────────────────────
  return (
    <FlatList
      key="genre-detail"
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <GenreDetailHeader
          genre={selectedGenre}
          songCount={filteredSongs.length}
          totalDuration={totalDuration}
          color={selectedColor}
          onBack={handleBack}
          onPlayAll={handlePlayAll}
          colors={colors}
          spacing={spacing}
        />
      }
      renderItem={({ item }) => (
        <GenreSongRow
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
  row: { flexDirection: "row", alignItems: "center", height: 64, gap: 14 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  meta: { fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  detailHeader: { flexDirection: "row", gap: 16, alignItems: "center" },
  detailIconBox: {
    width: 88,
    height: 88,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
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
  songSub: { fontSize: 12, marginTop: 1 },
  rightActions: { alignItems: "flex-end", gap: 4 },
  duration: { fontSize: 10 },
});
