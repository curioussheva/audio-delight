// src/components/audio/NowPlaying.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { AlbumArt } from './AlbumArt';
import { SongMetadata } from './SongMetadata';
import { EnhancedProgressBar } from '../ui/EnhancedProgressBar';
import { PlayerControls } from './PlayerControls';
import { QueueManager } from './QueueManager';
import { formatTime } from '@/utils/time';

const { width } = Dimensions.get('window');


export const NowPlaying: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const insets = useSafeAreaInsets();
  
  const { currentSong, isPlaying, position, duration, queue } = usePlayerStore();
  const { seek } = useAudioPlayer();
  
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  if (!currentSong) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background.primary }]}>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
          No song selected
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.mainContent, { paddingTop: insets.top + spacing.md }]}>
        <AlbumArt
          artwork={currentSong.artwork}
          isPlaying={isPlaying}
          showVisualizer={showVisualizer}
          onToggleVisualizer={() => setShowVisualizer(!showVisualizer)}
          size={width - spacing.xxl * 2}
        />

        <SongMetadata song={currentSong} />

        <EnhancedProgressBar
          progress={position / duration}
          duration={duration}
          onSeek={seek}
        />

        <PlayerControls />
      </View>

      <TouchableOpacity
        style={[styles.queueToggle, { padding: spacing.md }]}
        onPress={() => setShowQueue(!showQueue)}
      >
        <Text style={[styles.queueText, { color: colors.text.secondary }]}>
          Up Next ({queue.length})
        </Text>
        <Ionicons 
          name={showQueue ? 'chevron-down' : 'chevron-up'} 
          size={20} 
          color={colors.text.secondary} 
        />
      </TouchableOpacity>

      {showQueue && (
        <QueueManager
          visible={showQueue}
          onClose={() => setShowQueue(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  mainContent: {
    flex: 1,
  },
  queueToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queueText: {
    fontSize: 14,
  },
});