import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePlayerStore } from '@/store/playerStore';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatTime } from '@/utils/time';

export const NowPlaying = () => {
  const { currentSong, position, duration } = usePlayerStore();

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      <View style={styles.artworkPlaceholder} />
      <Text style={styles.title}>{currentSong.title}</Text>
      <Text style={styles.artist}>{currentSong.artist}</Text>
      <View style={styles.progressContainer}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <ProgressBar progress={duration > 0 ? position / duration : 0} />
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 32 },
  artworkPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: '#1F2A3A',
    borderRadius: 16,
    marginBottom: 24,
  },
  title: { color: '#F0F4F8', fontSize: 24, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  artist: { color: '#C8D4E0', fontSize: 18, marginBottom: 24 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8 },
  time: { color: '#C8D4E0', fontSize: 12 },
});