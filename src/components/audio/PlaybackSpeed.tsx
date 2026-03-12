// Di src/components/audio/PlaybackSpeed.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/context/ThemeContext';

interface PlaybackSpeedProps {
  onClose: () => void;
}

export const PlaybackSpeed: React.FC<PlaybackSpeedProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const [speed, setSpeed] = useState(1.0);

  const presets = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  return (
    <View style={[styles.container, { padding: spacing.md }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Kecepatan Putar
      </Text>
      
      <View style={[styles.presets, { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }]}>
        {presets.map((preset) => (
          <TouchableOpacity
            key={preset}
            style={[
              styles.preset,
              {
                backgroundColor: speed === preset ? colors.primary[500] : colors.background.secondary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: 20,
              }
            ]}
            onPress={() => setSpeed(preset)}
          >
            <Text style={{ 
              color: speed === preset ? colors.background.primary : colors.text.primary 
            }}>
              {preset}x
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Slider
        style={{ width: '100%', height: 40, marginTop: spacing.md }}
        minimumValue={0.5}
        maximumValue={2.0}
        step={0.05}
        value={speed}
        onValueChange={setSpeed}
        minimumTrackTintColor={colors.primary[500]}
        maximumTrackTintColor={colors.background.tertiary}
        thumbTintColor={colors.primary[500]}
      />

      <Text style={[styles.currentSpeed, { color: colors.primary[500], marginTop: spacing.md }]}>
        {speed.toFixed(2)}x
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // style di-inline via props
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  // QueueManager specific
  queueItem: {
    // style di-inline
  },
  queueItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  queueArtist: {
    fontSize: 12,
  },
  queueDuration: {
    fontSize: 12,
  },
  // PlaybackSpeed specific
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  preset: {
    borderRadius: 20,
  },
  currentSpeed: {
    fontSize: 14,
    fontWeight: '600',
  },
  // SleepTimer specific
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  option: {
    borderRadius: 20,
  },
  activeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // SongMetadata specific
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  meta: {
    fontSize: 12,
    marginRight: 8,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  formatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  format: {
    fontSize: 12,
  },
  bitrate: {
    fontSize: 12,
    fontWeight: '500',
  },
});