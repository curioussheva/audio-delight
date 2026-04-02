import React, { memo, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronLeft, 
  Play, 
  AudioLines, 
  FileAudio,
  Heart,
  MoreVertical
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// ── Path Formatter ──────────────────────────────────────────────────────────
const getReadablePath = (path: string) => {
  try {
    const decoded = decodeURIComponent(path);
    return decoded.replace(/^.*\/tree\/primary:|^\/storage\/emulated\/0\//, "");
  } catch {
    return path;
  }
};

// ── FolderRow (Main List) ─────────────────────────────────────────────────────
const FolderRow = memo(({ item, onPress, colors }: any) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.folderRow}>
      <View style={[styles.folderIconContainer, { backgroundColor: `${colors.primary[500]}10` }]}>
        <Folder size={24} color={colors.primary[500]} fill={`${colors.primary[500]}20`} strokeWidth={1.5} />
      </View>
      
      <View style={styles.folderInfo}>
        <Text style={[styles.folderName, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.folderPath, { color: colors.text.tertiary }]} numberOfLines={1} ellipsizeMode="middle">
          {getReadablePath(item.path)}
        </Text>
      </View>

      <View style={styles.folderRight}>
        <Text style={[styles.countText, { color: colors.text.disabled }]}>{item.count} items</Text>
        <ChevronRight size={16} color={colors.text.disabled} />
      </View>
    </TouchableOpacity>
  );
});

// ── FolderSongRow (Inside Folder) ─────────────────────────────────────────────
const FolderSongRow = memo(({ track, isNowPlaying, isFavorite, onPress, onToggleFavorite, colors }: any) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[styles.songRow, isNowPlaying && { backgroundColor: `${colors.primary[500]}10` }]}
  >
    <View style={styles.songLeading}>
      {isNowPlaying ? (
        <AudioLines size={18} color={colors.primary[500]} />
      ) : (
        <FileAudio size={18} color={colors.text.disabled} strokeWidth={1.5} />
      )}
    </View>

    <View style={styles.songMain}>
      <View style={styles.songTitleRow}>
        <Text style={[styles.songTitle, { color: isNowPlaying ? colors.primary[500] : colors.text.primary }]} numberOfLines={1}>
          {track.title || track.filename}
        </Text>
        <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
      </View>
      <Text style={[styles.songSub, { color: colors.text.tertiary }]}>
        {track.artist}  •  {track.codec?.toUpperCase()} {track.bitDepth ? `${track.bitDepth}bit` : ''}
      </Text>
    </View>

    <View style={styles.songTrailing}>
       <TouchableOpacity onPress={onToggleFavorite} style={{ padding: 4 }}>
          <Heart 
            size={16} 
            color={isFavorite ? colors.status.error : colors.text.disabled} 
            fill={isFavorite ? colors.status.error : 'transparent'}
          />
       </TouchableOpacity>
       <Text style={[styles.duration, { color: colors.text.disabled }]}>{formatTime(track.duration)}</Text>
    </View>
  </TouchableOpacity>
));

// ── FolderList Main Component ────────────────────────────────────────────────
export const FolderList: React.FC<any> = ({
  folders,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [selectedFolder, setSelectedFolder] = useState<any | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedFolder) return [];
    return (tracks ?? []).filter(t => t.folder === selectedFolder.path);
  }, [tracks, selectedFolder]);

  if (!selectedFolder) {
    return (
      <FlatList
        data={folders}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => <FolderRow item={item} onPress={setSelectedFolder} colors={colors} />}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.background.tertiary }]} />}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Folder Header */}
      <View style={[styles.header, { backgroundColor: colors.background.secondary }]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => setSelectedFolder(null)} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.primary[500]} />
            <Text style={[styles.backText, { color: colors.primary[500] }]}>Folders</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.folderHero}>
          <View style={[styles.heroIconContainer, { backgroundColor: `${colors.primary[500]}15` }]}>
            <FolderOpen size={40} color={colors.primary[500]} strokeWidth={1.5} />
          </View>
          <View style={styles.heroContent}>
            <Text style={[styles.heroTitle, { color: colors.text.primary }]} numberOfLines={1}>
              {selectedFolder.name}
            </Text>
            <Text style={[styles.heroPath, { color: colors.text.tertiary }]} numberOfLines={2} ellipsizeMode="middle">
              {getReadablePath(selectedFolder.path)}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.playAllBtn, { backgroundColor: colors.primary[500] }]}
          onPress={() => onSongPress(filteredSongs[0], filteredSongs)}
        >
          <Play size={18} color="#fff" fill="#fff" />
          <Text style={styles.playAllText}>Play Folder</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FolderSongRow
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
  container: { flex: 1 },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  folderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderInfo: { flex: 1, marginLeft: 16, marginRight: 8 },
  folderName: { fontSize: 15, fontWeight: '600' },
  folderPath: { fontSize: 11, marginTop: 4, opacity: 0.6 },
  folderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countText: { fontSize: 11, fontWeight: '500' },
  separator: { height: 1, marginHorizontal: 20, opacity: 0.3 },

  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  navBar: { paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 50 : 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  backText: { fontSize: 16, fontWeight: '600', marginLeft: 4 },
  
  folderHero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginTop: 10, gap: 20 },
  heroIconContainer: { width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  heroContent: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroPath: { fontSize: 12, marginTop: 6, lineHeight: 18, opacity: 0.8 },
  
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginTop: 24,
    height: 48,
    borderRadius: 14,
    gap: 8
  },
  playAllText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  songLeading: { width: 32 },
  songMain: { flex: 1, paddingRight: 10 },
  songTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  songTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  songSub: { fontSize: 11, marginTop: 2 },
  songTrailing: { alignItems: 'flex-end', gap: 4 },
  duration: { fontSize: 10, opacity: 0.6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
