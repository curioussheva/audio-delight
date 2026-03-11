import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PlayerControls } from './PlayerControls';
import { formatTime } from '@/utils/time';

const { width } = Dimensions.get('window');

export const NowPlaying: React.FC = () => {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const { seek } = useAudioPlayer();

  if (!currentSong) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No song selected</Text>
        <Text style={styles.emptySubtext}>Choose a song from your library</Text>
      </View>
    );
  }

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.container}>
      {/* Album Art */}
      <View style={styles.artworkContainer}>
        {currentSong.artwork ? (
          <Image source={{ uri: currentSong.artwork }} style={styles.artwork} />
        ) : (
          <View style={styles.placeholderArtwork}>
            <Text style={styles.placeholderText}>♪</Text>
          </View>
        )}
      </View>

      {/* Song Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {currentSong.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {currentSong.artist}
        </Text>
        {currentSong.format && (
          <View style={styles.formatBadge}>
            <Text style={styles.formatText}>
              {currentSong.format.codec?.toUpperCase() || 'AUDIO'} • {Math.floor((currentSong.format.sampleRate || 44100) / 1000)}kHz
            </Text>
          </View>
        )}
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <ProgressBar 
          progress={progress} 
          onSeek={(p) => seek(p * duration)} 
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Controls */}
      <PlayerControls />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    padding: 24,
  },
  artworkContainer: {
    alignItems: 'center',
    marginVertical: 32,
  },
  artwork: {
    width: width - 48,
    height: width - 48,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  placeholderArtwork: {
    width: width - 48,
    height: width - 48,
    borderRadius: 12,
    backgroundColor: '#141E33',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 120,
    color: '#00D4AA',
    opacity: 0.3,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F0F4F8',
    marginBottom: 8,
    textAlign: 'center',
  },
  artist: {
    fontSize: 16,
    color: '#C8D4E0',
    marginBottom: 12,
  },
  formatBadge: {
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  formatText: {
    fontSize: 12,
    color: '#00D4AA',
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: 16,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#C8D4E0',
    fontVariant: ['tabular-nums'],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1628',
  },
  emptyText: {
    fontSize: 20,
    color: '#F0F4F8',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#C8D4E0',
  },
});