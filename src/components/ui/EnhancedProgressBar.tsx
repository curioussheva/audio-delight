import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  useDerivedValue
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { usePlayerStore } from '@/store/playerStore'; // Tambahkan ini
import { formatTime } from '@/utils/time';

export const EnhancedProgressBar: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  
  // Ambil state dari store
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const setPosition = usePlayerStore((state) => state.setPosition);

  const [showPreview, setShowPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  
  const containerWidth = useSharedValue(0);
  
  // Hitung progress (0 sampai 1)
  const progress = duration > 0 ? position / duration : 0;

  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(setShowPreview)(true);
    })
    .onUpdate((event) => {
      const newX = Math.max(0, Math.min(containerWidth.value, event.x));
      const calcProgress = newX / containerWidth.value;
      runOnJS(setPreviewTime)(calcProgress * duration);
    })
    .onEnd((event) => {
      const finalX = Math.max(0, Math.min(containerWidth.value, event.x));
      const finalProgress = finalX / containerWidth.value;
      runOnJS(setPosition)(finalProgress * duration);
      runOnJS(setShowPreview)(false);
    });

  return (
    <View style={styles.container}>
      {/* Tooltip Preview */}
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

      <GestureDetector gesture={panGesture}>
        <View 
          style={styles.gestureArea}
          onLayout={(e) => {
            containerWidth.value = e.nativeEvent.layout.width;
          }}
        >
          <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Animated.View 
              style={[
                styles.progress,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: colors.primary[500],
                },
              ]} 
            />
          </View>
        </View>
      </GestureDetector>

      <View style={[styles.timeContainer, { marginTop: 8 }]}>
        <Text style={[styles.timeText, { color: colors.text.secondary }]}>
          {formatTime(position)}
        </Text>
        <Text style={[styles.timeText, { color: colors.text.secondary }]}>
          {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', height: 40, justifyContent: 'center' },
  gestureArea: { height: 20, justifyContent: 'center', width: '100%' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progress: { height: '100%' },
  timeContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  previewContainer: { position: 'absolute', top: -25, alignItems: 'center', width: 60, zIndex: 10 },
  previewTooltip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  previewText: { fontSize: 10, fontWeight: 'bold' },
  previewLine: { width: 1.5, height: 10, marginTop: 2 }
});
