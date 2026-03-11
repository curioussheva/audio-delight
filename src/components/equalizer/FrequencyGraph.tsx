import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { EqualizerBand } from '@/types/equalizer';

interface FrequencyGraphProps {
  bands: EqualizerBand[];
}

export const FrequencyGraph: React.FC<FrequencyGraphProps> = ({ bands }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <View style={[styles.container, { 
      backgroundColor: colors.background.secondary,
      marginVertical: spacing.md,
    }]} />
  );
};

const styles = StyleSheet.create({
  container: {
    height: 100,
  },
});