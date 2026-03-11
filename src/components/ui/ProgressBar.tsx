import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface ProgressBarProps {
  progress: number;
  onSeek?: (progress: number) => void;
  height?: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  onSeek,
  height = 4,
  color,
}) => {
  const { theme } = useTheme();
  const barColor = color || theme.colors.primary[500];

  return (
    <View style={[styles.container, { height }]}>
      <View 
        style={[
          styles.progress, 
          { width: `${progress * 100}%`, backgroundColor: barColor, height }
        ]} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F2A3A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progress: {
    borderRadius: 2,
  },
});