// Di src/components/audio/SleepTimer.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface SleepTimerProps {
  onClose: () => void;
}

export const SleepTimer: React.FC<SleepTimerProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  const [time, setTime] = useState<number | null>(null);

  const options = [5, 10, 15, 30, 45, 60];

  const handleSetTimer = (minutes: number) => {
    setTime(minutes);
    // Implementasi timer logic
  };

  return (
    <View style={[styles.container, { padding: spacing.md }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Sleep Timer
      </Text>
      <View style={[styles.options, { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }]}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.option,
              {
                backgroundColor: time === option ? colors.primary[500] : colors.background.secondary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: 20,
              }
            ]}
            onPress={() => handleSetTimer(option)}
          >
            <Text style={{ 
              color: time === option ? colors.background.primary : colors.text.primary 
            }}>
              {option} min
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {time && (
        <Text style={[styles.activeText, { color: colors.primary[500], marginTop: spacing.md }]}>
          Timer aktif: {time} menit
        </Text>
      )}
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