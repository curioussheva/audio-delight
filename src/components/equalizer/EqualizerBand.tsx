import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/context/ThemeContext';

interface EqualizerBandProps {
  frequency: number;
  gain: number;
  onValueChange: (value: number) => void;
}

export const EqualizerBand: React.FC<EqualizerBandProps> = React.memo(({ frequency, gain, onValueChange }) => {
  const { theme } = useTheme();
  const [localGain, setLocalGain] = useState(gain);

  useEffect(() => {
    setLocalGain(gain);
  }, [gain]);

  const formatFreq = (freq: number) => freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
        {formatFreq(frequency)}
      </Text>
      
      <Slider
        style={styles.slider}
        minimumValue={-15}
        maximumValue={15}
        step={0.5}
        value={localGain}
        onValueChange={setLocalGain}
        onSlidingComplete={onValueChange}
        minimumTrackTintColor={theme.colors.primary[500]}
        maximumTrackTintColor={theme.colors.background.tertiary}
        thumbTintColor={theme.colors.text.primary}
      />

      <Text style={[styles.gainValue, { color: theme.colors.primary[500] }]}>
        {localGain > 0 ? `+${localGain.toFixed(1)}` : localGain.toFixed(1)} dB
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, height: 40 },
  label: { width: 55, fontSize: 12, fontWeight: '700' },
  slider: { flex: 1, height: 40 },
  gainValue: { width: 60, fontSize: 12, textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] }
});
