import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  interpolate 
} from 'react-native-reanimated';
import { useAudioStore } from '@store/audioStore';
import { useAudioPlayer } from '@hooks/useAudioPlayer';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const PlayerControls: React.FC = () => {
  const { play, pause } = useAudioPlayer();
  const isPlaying = useAudioStore((state) => state.playback.isPlaying);
  const queue = useAudioStore((state) => state.queue);
  const next = useAudioStore((state) => state.next);
  const previous = useAudioStore((state) => state.previous);
  const toggleShuffle = useAudioStore((state) => state.toggleShuffle);
  const toggleRepeat = useAudioStore((state) => state.toggleRepeat);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isPlaying ? 1 : 1.1) }],
  }));

  const getRepeatIconName = () => {
    if (queue.repeat === 'off') return 'repeat-outline';
    return 'repeat'; // Untuk 'all' dan 'track' pakai icon yang sama
  };

  return (
    <View style={styles.container}>
      {/* Shuffle */}
      <TouchableOpacity onPress={toggleShuffle} style={styles.secondaryButton}>
        <Ionicons 
          name="shuffle" 
          size={24} 
          color={queue.shuffle ? '#00D4AA' : '#C8D4E0'} 
        />
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity onPress={previous} style={styles.mainButton}>
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
      <TouchableOpacity onPress={next} style={styles.mainButton}>
        <Ionicons name="play-skip-forward" size={32} color="#F0F4F8" />
      </TouchableOpacity>

      {/* Repeat */}
      <View style={styles.repeatContainer}>
        <TouchableOpacity onPress={toggleRepeat} style={styles.secondaryButton}>
          <Ionicons 
            name={getRepeatIconName()} 
            size={24} 
            color={queue.repeat !== 'off' ? '#00D4AA' : '#C8D4E0'} 
          />
        </TouchableOpacity>
        {queue.repeat === 'track' && (
          <View style={styles.repeatOneIndicator} />
        )}
      </View>
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
  repeatContainer: {
    position: 'relative',
  },
  repeatOneIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D4AA',
  },
});