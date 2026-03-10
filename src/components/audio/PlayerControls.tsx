import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';
import { usePlayerStore } from '@/store/playerStore'; // ← UBAH
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const PlayerControls: React.FC = () => {
  const { play, pause, skipToNext, skipToPrevious } = useAudioPlayer();
  const isPlaying = usePlayerStore((state) => state.isPlaying); // ← UBAH
  const currentSong = usePlayerStore((state) => state.currentSong); // ← UBAH
  // Untuk shuffle & repeat, perlu ditambahkan ke playerStore
  // Sementara gunakan state lokal atau placeholder

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isPlaying ? 1 : 1.1) }],
  }));

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      {/* Shuffle (placeholder) */}
      <TouchableOpacity style={styles.secondaryButton}>
        <Ionicons name="shuffle" size={24} color="#C8D4E0" />
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity onPress={skipToPrevious} style={styles.mainButton}>
        <Ionicons name="play-skip-back" size={32} color="#F0F4F8" />
      </TouchableOpacity>

      {/* Play/Pause */}
      <AnimatedTouchable 
        onPress={isPlaying ? pause : play} 
        style={[styles.playButton, playButtonStyle]}
      >
        <Ionicons 
          name={isPlaying ? 'pause' : 'play'} 
          size={40} 
          color="#0A1628" 
        />
      </AnimatedTouchable>

      {/* Next */}
      <TouchableOpacity onPress={skipToNext} style={styles.mainButton}>
        <Ionicons name="play-skip-forward" size={32} color="#F0F4F8" />
      </TouchableOpacity>

      {/* Repeat (placeholder) */}
      <TouchableOpacity style={styles.secondaryButton}>
        <Ionicons name="repeat-outline" size={24} color="#C8D4E0" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 24,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mainButton: {
    padding: 12,
  },
  secondaryButton: {
    padding: 8,
    opacity: 0.8,
  },
});