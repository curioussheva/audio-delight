import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { COLORS, SPACING } from '@/constants/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const PlayerControls: React.FC = () => {
  const { play, pause, skipToNext, skipToPrevious } = useAudioPlayer();
  const { isPlaying, shuffle, repeat, toggleShuffle, toggleRepeat } = usePlayerStore();

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isPlaying ? 1 : 1.1) }],
  }));

  return (
    <View style={styles.container}>
      {/* Shuffle */}
      <TouchableOpacity onPress={toggleShuffle} style={styles.secondaryButton}>
        <Ionicons
          name="shuffle"
          size={24}
          color={shuffle ? COLORS.primary[500] : COLORS.text.tertiary}
        />
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity onPress={skipToPrevious} style={styles.mainButton}>
        <Ionicons name="play-skip-back" size={32} color={COLORS.text.primary} />
      </TouchableOpacity>

      {/* Play/Pause */}
      <AnimatedTouchable
        onPress={isPlaying ? pause : play}
        style={[styles.playButton, playButtonStyle]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={40}
          color={COLORS.background.primary}
        />
      </AnimatedTouchable>

      {/* Next */}
      <TouchableOpacity onPress={skipToNext} style={styles.mainButton}>
        <Ionicons name="play-skip-forward" size={32} color={COLORS.text.primary} />
      </TouchableOpacity>

      {/* Repeat */}
      <View style={styles.repeatContainer}>
        <TouchableOpacity onPress={toggleRepeat} style={styles.secondaryButton}>
          <Ionicons
            name={repeat === 'track' ? 'repeat' : repeat === 'all' ? 'repeat' : 'repeat-outline'}
            size={24}
            color={repeat !== 'off' ? COLORS.primary[500] : COLORS.text.tertiary}
          />
        </TouchableOpacity>
        {repeat === 'track' && <View style={styles.repeatOneIndicator} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.lg,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mainButton: {
    padding: SPACING.sm,
  },
  secondaryButton: {
    padding: SPACING.xs,
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
    backgroundColor: COLORS.primary[500],
  },
});