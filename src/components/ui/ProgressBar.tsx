import React from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle,
  withSpring 
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface ProgressBarProps {
  progress: number; // 0 to 1
  buffered?: number; // 0 to 1
  onSeek: (progress: number) => void;
  color?: string;
  trackColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  buffered = 0,
  onSeek,
  color = '#00D4AA',
  trackColor = '#1E3A5F',
}) => {
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = contextX.value + event.translationX;
    })
    .onEnd(() => {
      // Calculate progress and call onSeek
    });

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress * 100}%`,
  }));

  const bufferedStyle = useAnimatedStyle(() => ({
    width: `${buffered * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.buffered, bufferedStyle]} />
        <Animated.View style={[styles.progress, { backgroundColor: color }, progressStyle]} />
      </View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.thumb, progressStyle]} />
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 24,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  buffered: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2D4A6F',
  },
  progress: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#00D4AA',
    marginLeft: -8,
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
});
