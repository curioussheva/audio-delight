// src/features/library/components/AlbumGrid.tsx
import React, { memo, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// ── Constants ──────────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS = 2;
const H_PAD = 16;
const TILE_GAP = 12;
const TILE_SIZE = (SCREEN_WIDTH - H_PAD * 2 - TILE_GAP) / COLS;

// ── Types ──────────────────────────────────────────────────────────────────────
interface AlbumGridProps {
  /** Pre-computed albums dari selectAlbums() di parent */
  albums: AlbumItem[];
  /** Raw tracks — dipakai untuk filter lagu per album */
  tracks: MediaTrack[];
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (id: string) => void;
}

interface AlbumItem {
  name: string;
  artist: string;
  artwork?: string;
  count: number;
}

// ── AlbumTile ─────────────────────────────────────────────────────────────────
interface AlbumTileProps {
  item: AlbumItem;
  onPress: (item: AlbumItem) => void;
  colors: any;
  spacing: any;
}

const AlbumTile = memo(({ item, onPress, colors, spacing }: AlbumTileProps) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[styles.tile, { width: TILE_SIZE }]}
    >
      {/* Artwork */}
      <View
        style={[
          styles.artwork,
          { backgroundColor: colors.background.secondary, width: TILE_SIZE, height: TILE_SIZE },
        ]}
      >
        <Ionicons name="albums" size={TILE_SIZE * 0.35} color={colors.text.disabled} />
      </View>

      {/* Info */}
      <View style={[styles.tileInfo, { paddingHorizontal: spacing.xs, paddingTop: spacing.xs }]}>
        <Text
          style={[styles.tileName, { color: colors.text.primary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.name}
        </Text>
        <Text
          style={[styles.tileArtist, { color: colors.text.secondary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.artist}
        </Text>
        <Text style={[styles.tileCount, { color: colors.text.disabled }]}>
          {item.count} {item.count === 1 ? "lagu" : "lagu"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.name === next.item.name &&
  prev.item.artist === next.item.artist &&
  prev.colors === next.colors
);

// ── AlbumSongRow ──────────────────────────────────────────────────────────────
interface AlbumSongRowProps {
  track: MediaTrack;
  isNowPlaying: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  colors: any;
}

const AlbumSongRow = memo(({
  track, isNowPlaying, isFavorite, onPress, onToggleFavorite, colors,
}: AlbumSongRowProps) => {
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
      style={[
        styles.songRow,
        isNowPlaying && { backgroundColor: colors.background.tertiary },
      ]}
    >
      {/* Track number / playing indicator */}
      <View style={[styles.trackNumContainer, { backgroundColor: isNowPlaying ? `${colors.primary[500]}20` : colors.background.secondary }]}>
        <Ionicons
          name={isNowPlaying ? "stats-chart" : "musical-note"}
          size={18}
          color={isNowPlaying ? colors.primary[500] : colors.text.tertiary}
        />
      </View>

      {/* Song info */}
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
        <Text style={[styles.songArtist, { color: colors.text.secondary }]} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      {/* Right actions */}
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
        <Text style={[styles.duration, { color: colors.text.disabled, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }]}>
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

// ── AlbumDetailHeader ─────────────────────────────────────────────────────────
interface AlbumDetailHeaderProps {
  album: AlbumItem;
  songCount: number;
  totalDuration: number;
  onBack: () => void;
  onPlayAll: () => void;
  colors: any;
  spacing: any;
}

const AlbumDetailHeader = memo(({
  album, songCount, totalDuration, onBack, onPlayAll, colors, spacing,
}: AlbumDetailHeaderProps) => (
  <View style={{ backgroundColor: colors.background.secondary }}>
    {/* Back nav */}
    <TouchableOpacity
      onPress={onBack}
      style={[styles.backRow, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
    >
      <Ionicons name="chevron-back" size={18} color={colors.primary[500]} />
      <Text style={[styles.backLabel, { color: colors.primary[500] }]}>Albums</Text>
    </TouchableOpacity>

    {/* Album summary */}
    <View style={[styles.albumHeader, { paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
      <View style={[styles.headerArtwork, { backgroundColor: colors.background.tertiary }]}>
        <Ionicons name="albums" size={52} color={colors.text.disabled} />
      </View>
      <View style={styles.headerInfo}>
        <Text style={[styles.headerAlbumName, { color: colors.text.primary }]} numberOfLines={2}>
          {album.name}
        </Text>
        <Text style={[styles.headerArtist, { color: colors.text.secondary }]} numberOfLines={1}>
          {album.artist}
        </Text>
        <Text style={[styles.headerMeta, { color: colors.text.disabled }]}>
          {songCount} lagu · {formatTime(totalDuration)}
        </Text>
      </View>
    </View>

    {/* Play all button */}
    <TouchableOpacity
      onPress={onPlayAll}
      style={[styles.playAllBtn, { backgroundColor: colors.primary[500], marginHorizontal: spacing.md, marginBottom: spacing.md }]}
    >
      <Ionicons name="play" size={16} color="#fff" />
      <Text style={styles.playAllLabel}>Putar Semua</Text>
    </TouchableOpacity>

    {/* Divider */}
    <View style={[styles.divider, { backgroundColor: colors.background.tertiary }]} />
  </View>
));

// ── AlbumGrid ─────────────────────────────────────────────────────────────────
export const AlbumGrid: React.FC<AlbumGridProps> = ({
  albums,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [selectedAlbum, setSelectedAlbum] = useState<AlbumItem | null>(null);

  // ── Selectors ────────────────────────────────────────────────────────────────
  // albums sudah di-compute di parent, langsung pakai

  const filteredSongs = useMemo(() => {
    if (!selectedAlbum) return [];
    const safeTracks = tracks ?? [];
    return safeTracks.filter(
      (t) =>
        (t.album || "Unknown Album") === selectedAlbum.name &&
        (t.artist || "Unknown Artist") === selectedAlbum.artist
    );
  }, [tracks, selectedAlbum]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAlbumPress = useCallback((album: AlbumItem) => {
    setSelectedAlbum(album);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedAlbum(null);
  }, []);

  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length > 0) {
      onSongPress(filteredSongs[0], filteredSongs);
    }
  }, [filteredSongs, onSongPress]);

  const handleSongPress = useCallback(
    (track: MediaTrack) => {
      onSongPress(track, filteredSongs);
    },
    [filteredSongs, onSongPress]
  );

  // ── Render: Grid ──────────────────────────────────────────────────────────────
  if (!selectedAlbum) {
    if (albums.length === 0) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: colors.background.primary }]}>
          <Ionicons name="albums-outline" size={52} color={colors.text.disabled} />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>Belum ada album</Text>
          <Text style={[styles.emptySubText, { color: colors.text.disabled }]}>
            Scan library terlebih dahulu
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        key="grid"
        data={albums}
        keyExtractor={(item) => `${item.name}__${item.artist}`}
        numColumns={COLS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.gridContent,
          { paddingHorizontal: H_PAD, paddingTop: spacing.sm, paddingBottom: 120 },
        ]}
        renderItem={({ item }) => (
          <AlbumTile item={item} onPress={handleAlbumPress} colors={colors} spacing={spacing} />
        )}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
      />
    );
  }

  // ── Render: Detail (filtered songs) ──────────────────────────────────────────
  return (
    <FlatList
      key="detail"
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <AlbumDetailHeader
          album={selectedAlbum}
          songCount={filteredSongs.length}
          totalDuration={totalDuration}
          onBack={handleBack}
          onPlayAll={handlePlayAll}
          colors={colors}
          spacing={spacing}
        />
      }
      renderItem={({ item }) => (
        <AlbumSongRow
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
  // Grid
  gridContent: { gap: TILE_GAP },
  row: { gap: TILE_GAP },
  tile: { borderRadius: 10, overflow: "hidden" },
  artwork: {
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  tileInfo: { paddingBottom: 10 },
  tileName: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  tileArtist: { fontSize: 12, marginBottom: 2 },
  tileCount: { fontSize: 11 },

  // Empty
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13 },

  // Detail header
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  albumHeader: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  headerArtwork: {
    width: 100,
    height: 100,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  headerInfo: { flex: 1, justifyContent: "center", gap: 4 },
  headerAlbumName: { fontSize: 18, fontWeight: "700", lineHeight: 22 },
  headerArtist: { fontSize: 14 },
  headerMeta: { fontSize: 12 },
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
  trackNumContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  songInfo: { flex: 1, marginHorizontal: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  songTitle: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 4 },
  songArtist: { fontSize: 12, marginTop: 1 },
  rightActions: { alignItems: "flex-end", gap: 4 },
  duration: { fontSize: 10 },
});
 