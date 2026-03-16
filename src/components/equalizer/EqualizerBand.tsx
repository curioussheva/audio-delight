import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider'; // Pastikan sudah install ini
import { useTheme } from '@/context/ThemeContext';

interface EqualizerBandProps {
  frequency: number;
  gain: number;
  onValueChange: (value: number) => void;
}

export const EqualizerBand: React.FC<EqualizerBandProps> = ({ frequency, gain, onValueChange }) => {
  const { theme } = useTheme();

  // Format label frekuensi (contoh: 1000 -> 1kHz)
  const formatFreq = (freq: number) => freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
        {formatFreq(frequency)}
      </Text>
      
      <Slider
        style={styles.slider}
        minimumValue={-12}
        maximumValue={12}
        step={0.5}
        value={gain}
        onValueChange={onValueChange}
        minimumTrackTintColor={theme.colors.primary[500]}
        maximumTrackTintColor={theme.colors.background.tertiary}
        thumbTintColor={theme.colors.primary[500]}
      />

      <Text style={[styles.gainValue, { color: theme.colors.primary[500] }]}>
        {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    height: 40,
  },
  label: { width: 55, fontSize: 12, fontWeight: '700' },
  slider: { flex: 1, height: 40 },
  gainValue: { width: 60, fontSize: 12, textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] }
});
