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
import * as Haptics from "expo-haptics";
import { 
  Library, 
  ChevronLeft, 
  Play, 
  Shuffle, 
  Heart, 
  Music2, 
  Disc3,
  AudioLines
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS = 2;
const H_PAD = 20; // Padding lebih luas untuk kesan premium
const TILE_GAP = 16;
const TILE_SIZE = (SCREEN_WIDTH - H_PAD * 2 - TILE_GAP) / COLS;

// ── AlbumTile ─────────────────────────────────────────────────────────────────
const AlbumTile = memo(({ item, onPress, colors }: any) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.tile}>
      <View style={[styles.artworkContainer, { backgroundColor: colors.background.secondary }]}>
        <Disc3 size={TILE_SIZE * 0.3} color={colors.text.disabled} strokeWidth={1.2} />
        {/* Badge jumlah lagu di pojok artwork */}
        <View style={[styles.countBadge, { backgroundColor: colors.background.tertiary }]}>
          <Text style={[styles.countText, { color: colors.text.secondary }]}>{item.count}</Text>
        </View>
      </View>

      <View style={styles.tileMeta}>
        <Text style={[styles.tileName, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.tileArtist, { color: colors.text.secondary }]} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── AlbumSongRow ──────────────────────────────────────────────────────────────
const AlbumSongRow = memo(({ track, isNowPlaying, isFavorite, onPress, onToggleFavorite, colors }: any) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.songRow, isNowPlaying && { backgroundColor: `${colors.primary[500]}10` }]}
    >
      <View style={styles.songLeading}>
        {isNowPlaying ? (
          <AudioLines size={18} color={colors.primary[500]} />
        ) : (
          <Text style={[styles.trackNum, { color: colors.text.disabled }]}>
            {track.trackNumber || '-'}
          </Text>
        )}
      </View>

      <View style={styles.songMain}>
        <View style={styles.songTitleRow}>
          <Text style={[styles.songTitle, { color: isNowPlaying ? colors.primary[500] : colors.text.primary }]} numberOfLines={1}>
            {track.title}
          </Text>
          <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
        </View>
        <Text style={[styles.songSub, { color: colors.text.tertiary }]}>
           {track.bitDepth || 16}bit • {Math.round(track.sampleRate / 1000)}kHz
        </Text>
      </View>

      <View style={styles.songTrailing}>
        <TouchableOpacity onPress={onToggleFavorite} style={styles.favBtn}>
          <Heart 
            size={16} 
            color={isFavorite ? colors.status.error : colors.text.disabled} 
            fill={isFavorite ? colors.status.error : 'transparent'}
          />
        </TouchableOpacity>
        <Text style={[styles.duration, { color: colors.text.disabled }]}>
          {formatTime(track.duration)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── AlbumGrid Component ───────────────────────────────────────────────────────
export const AlbumGrid: React.FC<any> = ({
  albums,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const [selectedAlbum, setSelectedAlbum] = useState<any | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedAlbum) return [];
    return (tracks ?? []).filter(
      (t: any) => t.album === selectedAlbum.name && t.artist === selectedAlbum.artist
    );
  }, [tracks, selectedAlbum]);

  const totalDuration = useMemo(
    () => filteredSongs.reduce((acc, t: any) => acc + (t.duration || 0), 0),
    [filteredSongs]
  );

  if (!selectedAlbum) {
    return (
      <FlatList
        data={albums}
        numColumns={COLS}
        keyExtractor={(item) => `${item.name}-${item.artist}`}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContent, { paddingBottom: 120 }]}
        renderItem={({ item }) => <AlbumTile item={item} onPress={setSelectedAlbum} colors={colors} />}
      />
    );
  }

  return (
    <View style={[styles.detailContainer, { backgroundColor: colors.background.primary }]}>
      {/* Custom Header Area */}
      <View style={[styles.navBar, { paddingTop: Platform.OS === 'ios' ? 50 : 20 }]}>
        <TouchableOpacity onPress={() => setSelectedAlbum(null)} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerHero}>
            <View style={[styles.largeArtwork, { backgroundColor: colors.background.secondary, shadowColor: '#000' }]}>
               <Disc3 size={80} color={colors.text.disabled} strokeWidth={1} />
            </View>
            <View style={styles.headerTextContent}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>{selectedAlbum.name}</Text>
              <Text style={[styles.headerArtist, { color: colors.primary[500] }]}>{selectedAlbum.artist}</Text>
              <Text style={[styles.headerMeta, { color: colors.text.disabled }]}>
                {filteredSongs.length} Tracks • {formatTime(totalDuration)}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.mainBtn, { backgroundColor: colors.primary[500] }]}
                onPress={() => onSongPress(filteredSongs[0], filteredSongs)}
              >
                <Play size={18} color="#fff" fill="#fff" />
                <Text style={styles.mainBtnText}>Play</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.secondaryBtn, { backgroundColor: colors.background.tertiary }]}
                onPress={() => {/* Shuffle Logic */}}
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
            isFavorite={favoriteIds.has(item.id)}
            onPress={() => onSongPress(item, filteredSongs)}
            onToggleFavorite={() => onToggleFavorite?.(item.id)}
            colors={colors}
          />
        )}
        contentContainerStyle={{ paddingBottom: 150 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  gridContent: { paddingHorizontal: H_PAD, paddingTop: 10 },
  gridRow: { justifyContent: 'space-between', marginBottom: TILE_GAP },
  tile: { width: TILE_SIZE },
  artworkContainer: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  countBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countText: { fontSize: 10, fontWeight: '800' },
  tileMeta: { marginTop: 8, paddingHorizontal: 2 },
  tileName: { fontSize: 14, fontWeight: "700" },
  tileArtist: { fontSize: 12, marginTop: 2, opacity: 0.7 },

  detailContainer: { flex: 1 },
  navBar: { paddingHorizontal: 16, marginBottom: 10 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerHero: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 },
  largeArtwork: {
    width: 180,
    height: 180,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    marginBottom: 20
  },
  headerTextContent: { alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  headerArtist: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  headerMeta: { fontSize: 12, marginTop: 8, letterSpacing: 1, textTransform: 'uppercase' },
  
  actionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  mainBtn: { flex: 1, height: 48, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  mainBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  songLeading: { width: 30, alignItems: 'flex-start' },
  trackNum: { fontSize: 12, fontWeight: '600' },
  songMain: { flex: 1, paddingRight: 10 },
  songTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  songTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  songSub: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  songTrailing: { alignItems: 'flex-end', gap: 4 },
  favBtn: { padding: 4 },
  duration: { fontSize: 10, opacity: 0.6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
