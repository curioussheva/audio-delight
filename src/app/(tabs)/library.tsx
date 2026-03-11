import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext'; // ← IMPORT ThemeContext
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { Song } from '@/types/audio';
import { formatTime } from '@/utils/time';

export default function LibraryScreen() {
  const { theme } = useTheme(); // ← AMBIL THEME
  const { colors, spacing, typography } = theme; // ← DESTRUCTURE
  
  const { songs, loading, error, reload } = useMediaLibrary();
  const { setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer();
  const currentSong = usePlayerStore((state) => state.currentSong); // ← AMBIL DARI STORE

  const handlePlaySong = async (song: Song) => {
    setQueue(songs);
    await loadSong(song);
  };

  const renderSongItem = ({ item, index }: { item: Song; index: number }) => {
    const isPlaying = currentSong?.id === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.songItem,
          { 
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.sm,
            marginBottom: spacing.xs,
            borderRadius: 12,
            backgroundColor: isPlaying ? colors.background.tertiary : 'transparent',
          }
        ]}
        onPress={() => handlePlaySong(item)}
      >
        <View style={[styles.songNumber, { width: 30, marginRight: spacing.sm }]}>
          <Text style={[styles.numberText, { color: colors.text.tertiary }]}>
            {index + 1}
          </Text>
        </View>
        
        <View style={[styles.songInfo, { marginRight: spacing.md }]}>
          <Text 
            style={[
              styles.songTitle, 
              { 
                color: isPlaying ? colors.primary[500] : colors.text.primary,
                marginBottom: spacing.xs,
              }
            ]} 
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.songArtist, { color: colors.text.secondary }]} numberOfLines={1}>
            {item.artist} • {item.album}
          </Text>
        </View>
        
        <View style={[styles.songMeta, { gap: spacing.sm }]}>
          <Text style={[styles.songDuration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>
          {isPlaying && (
            <Ionicons name="volume-high" size={16} color={colors.primary[500]} />
          )}
          <Ionicons 
            name="play-circle-outline" 
            size={24} 
            color={isPlaying ? colors.primary[500] : colors.text.secondary} 
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background.primary }]}>
        <Ionicons name="alert-circle" size={48} color={colors.status.error} />
        <Text style={[styles.errorText, { 
          color: colors.status.error,
          marginTop: spacing.md,
          marginBottom: spacing.lg,
        }]}>
          Error: {error}
        </Text>
        <TouchableOpacity 
          onPress={reload} 
          style={[styles.retryButton, { 
            backgroundColor: colors.primary[500],
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: 8,
          }]}
        >
          <Text style={[styles.retryText, { color: colors.background.primary }]}>
            Coba lagi
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header dengan jumlah lagu */}
      <View style={[styles.header, { 
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.background.tertiary,
      }]}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Library</Text>
        <Text style={[styles.songCount, { color: colors.text.secondary }]}>
          {songs.length} lagu
        </Text>
      </View>

      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={renderSongItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, {
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.xxxl,
        }]}
      />
    </View>
  );
}

// StyleSheet untuk layout dasar (tanpa warna dan spacing)
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  songCount: {
    fontSize: 14,
  },
  listContent: {
    // spacing di-inline
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  songNumber: {
    alignItems: 'center',
  },
  numberText: {
    fontSize: 14,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  songArtist: {
    fontSize: 12,
  },
  songMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  songDuration: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 8,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600',
  },
});