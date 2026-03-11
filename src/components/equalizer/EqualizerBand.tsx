import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface EqualizerBandProps {
  frequency: number;
  gain: number;
  onGainChange: (gain: number) => void;
}

export const EqualizerBand: React.FC<EqualizerBandProps> = ({ 
  frequency, 
  gain, 
  onGainChange 
}) => {
  return (
    <View style={styles.container}>
      <Text>{frequency}Hz</Text>
      <Text>{gain}dB</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
  },
});