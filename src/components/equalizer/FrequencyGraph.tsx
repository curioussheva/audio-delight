import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EqualizerBand } from '@/types/equalizer'; // ← Sekarang file sudah ada

interface FrequencyGraphProps {
  bands: EqualizerBand[];
}

export const FrequencyGraph: React.FC<FrequencyGraphProps> = ({ bands }) => {
  return <View style={styles.container} />;
};

const styles = StyleSheet.create({
  container: {
    height: 100,
    backgroundColor: '#1F2A3A',
    marginVertical: 16,
  },
});