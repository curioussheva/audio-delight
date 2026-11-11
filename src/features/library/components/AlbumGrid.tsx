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
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ChevronLeft,
  Play,
  Shuffle,
  Heart,
  Disc3,
  AudioLines,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import { DURATION_FONT_FAMILY } from "@/shared/utils/typography";
import QualityBadge from "@/shared/components/ui/QualityBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS = 2;
const H_PAD = 20;
const TILE_GAP = 16;
const TILE_SIZE = (SCREEN_WIDTH - H_PAD * 2 - TILE_GAP) / COLS;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Album {
  id: string;
  name: string;
  artist: string;
  artwork?: string | null;
  count: number;
  duration: number;
}

interface AlbumGridProps {
  tracks: MediaTrack[];
  currentTrackId?: string;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (songId: string) => Promise<boolean>;
  isFavorite?: (songId: string) => boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getGroupedAlbums = (tracks: MediaTrack[]): Album[] => {
  if (!tracks?.length) return [];

  const map = new Map<string, Album>();

  tracks.forEach((track) => {
    const key = `${track.album || "Unknown Album"}__${track.artist || "Unknown Artist"}`;

    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: track.album || "Unknown Album",
        artist: track.artist || "Unknown Artist",
        artwork: track.artwork || null,
        count: 1,
        duration: track.duration || 0,
      });
    } else {
      const entry = map.get(key)!;
      entry.count += 1;
      entry.duration += track.duration || 0;
      // Ambil artwork dari track lain dalam album jika belum ada
      if (!entry.artwork && track.artwork) entry.artwork = track.artwork;
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// ─── AlbumTile ────────────────────────────────────────────────────────────────

const AlbumTile = memo(
  ({
    item,
    onPress,
    colors,
  }: {
    item: Album;
    onPress: (album: Album) => void;
    colors: any;
  }) => {
    const [imgError, setImgError] = useState(false);
    const showImage = !!item.artwork && !imgError;

    const handlePress = useCallback(() => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress(item);
    }, [item, onPress]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={styles.tile}
      >
        <View
          style={[
            styles.artworkContainer,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          {showImage ? (
            <Image
              source={{ uri: item.artwork! }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={250}
              cachePolicy="memory-disk"
              onError={() => setImgError(true)}
            />
          ) : (
            <Disc3
              size={TILE_SIZE * 0.38}
              color={colors.text.disabled}
              strokeWidth={1.1}
            />
          )}

          <View
            style={[
              styles.countBadge,
              { backgroundColor: colors.background.tertiary },
            ]}
          >
            <Text style={[styles.countText, { color: colors.text.secondary }]}>
              {item.count}
            </Text>
          </View>
        </View>

        <View style={styles.tileMeta}>
          <Text
            style={[styles.tileName, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text
            style={[styles.tileArtist, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {item.artist}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

// ─── AlbumSongRow ─────────────────────────────────────────────────────────────

const AlbumSongRow = memo(
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
    onToggleFavorite?: (songId: string) => Promise<boolean>;
    colors: any;
  }) => {
    // Optimistic update: langsung flip visual, rollback kalau gagal
    const [localFav, setLocalFav] = useState(isFavorite);
    const router = useRouter();

    // U-P2-09: long-press → Song Detail, pola yang sama dengan
    // ArtistSongRow — dulu hanya ArtistSongRow yang punya jalan ini.
    const handleLongPress = useCallback(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/song/[id]", params: { id: track.id } });
    }, [router, track.id]);

    // Sync kalau prop berubah dari luar (misal re-scan)
    React.useEffect(() => {
      setLocalFav(isFavorite);
    }, [isFavorite]);

    const handleFavPress = useCallback(async () => {
      if (!onToggleFavorite) return;
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const optimistic = !localFav;
      setLocalFav(optimistic); // langsung update UI

      try {
        const result = await onToggleFavorite(track.id);
        setLocalFav(result); // sync dengan hasil sebenarnya
      } catch {
        setLocalFav(!optimistic); // rollback kalau gagal
      }
    }, [localFav, onToggleFavorite, track.id]);

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        style={[
          styles.songRow,
          isNowPlaying && { backgroundColor: `${colors.primary[500]}10` },
        ]}
      >
        {/* Leading: track number / now playing indicator */}
        <View style={styles.songLeading}>
          {isNowPlaying ? (
            <AudioLines size={18} color={colors.primary[500]} />
          ) : (
            <Text style={[styles.trackNum, { color: colors.text.disabled }]}>
              {track.trackNumber || "–"}
            </Text>
          )}
        </View>

        {/* Main: title + quality */}
        <View style={styles.songMain}>
          <View style={styles.songTitleRow}>
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
            >
              {track.title}
            </Text>
            <QualityBadge
              sampleRate={track.sampleRate}
              bitDepth={track.bitDepth}
              codec={track.codec}
            />
          </View>
          <Text style={[styles.songSub, { color: colors.text.tertiary }]}>
            {/* Tanpa data jangan klaim terukur (U-P1-05): dulu bitDepth
                kosong tampil "16bit" dan sampleRate kosong "44.1 kHz". */}
            {track.bitDepth > 0 ? `${track.bitDepth}bit` : "-"} •{" "}
            {track.sampleRate > 0
              ? `${(track.sampleRate / 1000).toFixed(1)} kHz`
              : "-"}
          </Text>
        </View>

        {/* Trailing: heart + duration */}
        <View style={styles.songTrailing}>
          <TouchableOpacity
            onPress={handleFavPress}
            style={styles.favBtn}
            // U-P2-01: ikon 16 + padding 4 + hitSlop 8 lama = ±40dp.
            // hitSlop 12 → 16 + 8 + 24 = 48dp.
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={
              localFav ? "Hapus dari favorit" : "Tambah ke favorit"
            }
          >
            <Heart
              size={16}
              color={localFav ? colors.status.error : colors.text.disabled}
              fill={localFav ? colors.status.error : "transparent"}
            />
          </TouchableOpacity>
          <Text style={[styles.duration, { color: colors.text.disabled }]}>
            {formatTime(track.duration)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

// ─── AlbumGrid ────────────────────────────────────────────────────────────────

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  tracks = [],
  currentTrackId,
  onSongPress,
  onToggleFavorite,
  isFavorite = () => false,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // Teks/ikon di atas tombol primary[500] — dipilih dari luminansi primary
  // (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#fff".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);

  const albums = useMemo(() => getGroupedAlbums(tracks), [tracks]);

  const handleSelectAlbum = useCallback((album: Album) => {
    setHeroImgError(false);
    setSelectedAlbum(album);
  }, []);

  const filteredSongs = useMemo(() => {
    if (!selectedAlbum) return [];
    return tracks
      .filter(
        (t) =>
          (t.album || "Unknown Album") === selectedAlbum.name &&
          (t.artist || "Unknown Artist") === selectedAlbum.artist,
      )
      .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
  }, [tracks, selectedAlbum]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t) => acc + (t.duration || 0), 0),
    [filteredSongs],
  );

  const handlePlayAlbum = useCallback(() => {
    if (filteredSongs.length > 0) onSongPress(filteredSongs[0], filteredSongs);
  }, [onSongPress, filteredSongs]);

  const handleShuffleAlbum = useCallback(() => {
    const shuffled = shuffleArray(filteredSongs);
    if (shuffled.length > 0) onSongPress(shuffled[0], shuffled);
  }, [onSongPress, filteredSongs]);

  // ── Grid View ──
  if (!selectedAlbum) {
    return (
      <FlatList
        data={albums}
        numColumns={COLS}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContent, { paddingBottom: 120 }]}
        renderItem={({ item }) => (
          <AlbumTile item={item} onPress={handleSelectAlbum} colors={colors} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Disc3 size={48} color={colors.text.disabled} strokeWidth={1} />
            <Text style={[styles.emptyText, { color: colors.text.disabled }]}>
              No albums found
            </Text>
            <Text
              style={[styles.emptySubText, { color: colors.text.disabled }]}
            >
              {tracks.length} tracks loaded
            </Text>
          </View>
        }
      />
    );
  }

  // ── Detail View ──
  const showHeroImage = !!selectedAlbum.artwork && !heroImgError;

  return (
    <View
      style={[
        styles.detailContainer,
        { backgroundColor: colors.background.primary },
      ]}
    >
      <View
        style={[styles.navBar, { paddingTop: Platform.OS === "ios" ? 50 : 20 }]}
      >
        {/* U-P2-09: back berlabel, sama seperti Folder/Format/Genre —
            dulu ikon saja tanpa label. */}
        <TouchableOpacity
          onPress={() => setSelectedAlbum(null)}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.primary[500]} />
          <Text style={[styles.backLabel, { color: colors.primary[500] }]}>
            Albums
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 150 }}
        ListHeaderComponent={
          <View style={styles.headerHero}>
            {/* Hero artwork */}
            <View
              style={[
                styles.largeArtwork,
                {
                  backgroundColor: colors.background.secondary,
                  shadowColor: "#000",
                },
              ]}
            >
              {showHeroImage ? (
                <Image
                  source={{ uri: selectedAlbum.artwork! }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={300}
                  onError={() => setHeroImgError(true)}
                />
              ) : (
                <Disc3 size={80} color={colors.text.disabled} strokeWidth={1} />
              )}
            </View>

            {/* Album info */}
            <View style={styles.headerTextContent}>
              <Text
                style={[styles.headerTitle, { color: colors.text.primary }]}
              >
                {selectedAlbum.name}
              </Text>
              <Text
                style={[styles.headerArtist, { color: colors.primary[500] }]}
              >
                {selectedAlbum.artist}
              </Text>
              <Text
                style={[styles.headerMeta, { color: colors.text.disabled }]}
              >
                {filteredSongs.length} Tracks • {formatTime(totalDuration)}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.mainBtn,
                  { backgroundColor: colors.primary[500] },
                ]}
                onPress={handlePlayAlbum}
              >
                <Play size={18} color={onPrimary} fill={onPrimary} />
                <Text style={[styles.mainBtnText, { color: onPrimary }]}>
                  Play
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.background.tertiary },
                ]}
                onPress={handleShuffleAlbum}
              >
                <Shuffle size={18} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AlbumSongRow
            track={item}
            isNowPlaying={item.id === currentTrackId}
            isFavorite={isFavorite(item.id)}
            onPress={() => onSongPress(item, filteredSongs)}
            onToggleFavorite={onToggleFavorite}
            colors={colors}
          />
        )}
      />
    </View>
  );
};

export default AlbumGrid;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Grid
  gridContent: { paddingHorizontal: H_PAD, paddingTop: 10 },
  gridRow: { justifyContent: "space-between", marginBottom: TILE_GAP },

  // Tile
  tile: { width: TILE_SIZE },
  artworkContainer: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  countBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countText: { fontSize: 10, fontWeight: "800" },
  tileMeta: { marginTop: 8, paddingHorizontal: 2 },
  tileName: { fontSize: 14, fontWeight: "700" },
  tileArtist: { fontSize: 12, marginTop: 2, opacity: 0.7 },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 12, opacity: 0.6 },

  // Detail container
  detailContainer: { flex: 1 },
  navBar: { paddingHorizontal: 16, marginBottom: 10 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    justifyContent: "flex-start",
  },
  backLabel: { fontSize: 16, fontWeight: "600", marginLeft: 4 },

  // Hero header
  headerHero: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  largeArtwork: {
    width: 180,
    height: 180,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    marginBottom: 20,
  },
  headerTextContent: { alignItems: "center", marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  headerArtist: { fontSize: 16, fontWeight: "600", marginTop: 4 },
  headerMeta: {
    fontSize: 12,
    marginTop: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // Action buttons
  actionRow: { flexDirection: "row", gap: 12, width: "100%" },
  mainBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  // U-P2-04: tanpa `color` — warna teks selalu di-overide inline dengan
  // onPrimary (pickReadable atas primary[500]) di pemakaian style ini.
  mainBtnText: { fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  // Song row
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  songLeading: { width: 30, alignItems: "flex-start" },
  trackNum: { fontSize: 12, fontWeight: "600" },
  songMain: { flex: 1, paddingRight: 10 },
  songTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  songTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  songSub: { fontSize: 11, marginTop: 2, fontWeight: "500" },
  songTrailing: { alignItems: "flex-end", gap: 4 },
  favBtn: { padding: 4 },
  duration: {
    fontSize: 10,
    opacity: 0.6,
    // U-P2-09: satu font durasi bersama.
    fontFamily: DURATION_FONT_FAMILY,
  },
});
