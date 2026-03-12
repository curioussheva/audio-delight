// src/components/equalizer/FrequencyGraph.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EqualizerBand } from '@/types/equalizer';

interface FrequencyGraphProps {
  bands: EqualizerBand[];
  height?: number;
}

export const FrequencyGraph: React.FC<FrequencyGraphProps> = ({ bands, height = 100 }) => {
  return (
    <View style={[styles.container, { height }]} />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F2A3A',
    borderRadius: 8,
  },
});