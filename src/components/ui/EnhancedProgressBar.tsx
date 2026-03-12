// src/components/ui/EnhancedProgressBar.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle,
  useSharedValue,
  runOnJS
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { formatTime } from '@/utils/time';

interface EnhancedProgressBarProps {
  progress: number;
  duration: number;
  onSeek: (position: number) => void;
  chapters?: { time: number; title: string }[];
}

export const EnhancedProgressBar: React.FC<EnhancedProgressBarProps> = ({
  progress,
  duration,
  onSeek,
  chapters = [],
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const [showPreview, setShowPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const width = useSharedValue(0);
  const startX = useSharedValue(0);

  // Gunakan Gesture.Pan() dari react-native-gesture-handler
  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(setShowPreview)(true);
    })
    .onUpdate((event) => {
      const newX = Math.max(0, Math.min(width.value, event.x));
      const newProgress = newX / width.value;
      runOnJS(setPreviewTime)(newProgress * duration);
    })
    .onEnd((event) => {
      const newProgress = Math.max(0, Math.min(1, event.x / width.value));
      runOnJS(onSeek)(newProgress * duration);
      runOnJS(setShowPreview)(false);
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View 
          style={styles.track}
          onLayout={(e) => {
            width.value = e.nativeEvent.layout.width;
          }}
        >
          {/* Chapter markers */}
          {chapters.map((chapter, index) => (
            <View
              key={index}
              style={[
                styles.chapterMarker,
                {
                  left: `${(chapter.time / duration) * 100}%`,
                  backgroundColor: colors.primary[500],
                },
              ]}
            />
          ))}

          {/* Progress bar */}
          <Animated.View 
            style={[
              styles.progress,
              {
                width: `${progress * 100}%`,
                backgroundColor: colors.primary[500],
              },
            ]} 
          />
        </Animated.View>
      </GestureDetector>

      {/* Time display */}
      <View style={[styles.timeContainer, { marginTop: spacing.xs }]}>
        <Text style={[styles.timeText, { color: colors.text.primary }]}>
          {formatTime(progress * duration)}
        </Text>
        <Text style={[styles.timeText, { color: colors.text.secondary }]}>
          {formatTime(duration)}
        </Text>
      </View>

      {/* Preview tooltip */}
      {showPreview && (
        <View style={[styles.previewContainer, { 
          left: `${(previewTime / duration) * 100}%`,
          marginLeft: -30,
        }]}>
          <View style={[styles.previewTooltip, { backgroundColor: colors.background.tertiary }]}>
            <Text style={[styles.previewText, { color: colors.text.primary }]}>
              {formatTime(previewTime)}
            </Text>
          </View>
          <View style={[styles.previewLine, { backgroundColor: colors.primary[500] }]} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  track: {
    height: 4,
    backgroundColor: '#1F2A3A',
    borderRadius: 2,
    position: 'relative',
  },
  chapterMarker: {
    position: 'absolute',
    width: 2,
    height: 8,
    top: -2,
    borderRadius: 1,
  },
  progress: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
  },
  previewContainer: {
    position: 'absolute',
    top: -30,
    alignItems: 'center',
    width: 60,
  },
  previewTooltip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  previewText: {
    fontSize: 10,
    fontWeight: '600',
  },
  previewLine: {
    width: 2,
    height: 16,
    marginTop: 2,
  },
});