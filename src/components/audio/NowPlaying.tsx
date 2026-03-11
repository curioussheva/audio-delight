import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatTime } from '@/utils/time';
import { COLORS, TYPOGRAPHY, SPACING } from '@/constants/theme';

const { width } = Dimensions.get('window');
const ARTWORK_SIZE = width - SPACING.xxl * 2;

export const NowPlaying: React.FC = () => {
  const { currentSong, isPlaying, position, duration } = usePlayerStore();
  const { seek, togglePlayPause, skipToNext, skipToPrevious } = useAudioPlayer();

  if (!currentSong) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="musical-notes" size={64} color={COLORS.background.tertiary} />
        <Text style={styles.emptyText}>No song selected</Text>
        <Text style={styles.emptySubtext}>Choose a song from your library</Text>
      </View>
    );
  }

  const progress = duration > 0 ? position / duration : 0;

  return (
    <LinearGradient
      colors={[COLORS.background.primary, COLORS.background.secondary]}
      style={styles.container}
    >
      {/* Album Art */}
      <View style={styles.artworkWrapper}>
        {currentSong.artwork ? (
          <Image source={{ uri: currentSong.artwork }} style={styles.artwork} />
        ) : (
          <View style={styles.placeholderArtwork}>
            <Ionicons name="musical-notes" size={80} color={COLORS.primary[500]} />
          </View>
        )}
      </View>

      {/* Song Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>{currentSong.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{currentSong.artist}</Text>
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>
            {currentSong.format.codec.toUpperCase()} • {currentSong.format.sampleRate / 1000}kHz • {currentSong.format.bitDepth}bit
          </Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <ProgressBar
          progress={progress}
          onSeek={(p) => seek(p * duration)}
          height={6}
          color={COLORS.primary[500]}
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Controls - dipisah ke PlayerControls */}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background.primary,
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text.primary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    ...TYPOGRAPHY.body2,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  artworkWrapper: {
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 16,
    shadowColor: COLORS.primary[500],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  placeholderArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 16,
    backgroundColor: COLORS.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  artist: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
  },
  formatBadge: {
    backgroundColor: COLORS.background.tertiary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
  },
  formatText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary[500],
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: SPACING.lg,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  timeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.text.secondary,
  },
});