import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme } from '@/context/ThemeContext';

interface EqualizerBandProps {
  frequency: number;
  gain: number;
  onGainChange: (gain: number) => void;
}

export const EqualizerBand: React.FC<EqualizerBandProps> = ({
  frequency,
  gain,
  onGainChange,
}) => {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  const [localGain, setLocalGain] = useState(gain);

  const handleValueChange = (value: number) => {
    setLocalGain(value);
  };

  const handleSlidingComplete = (value: number) => {
    onGainChange(value);
  };

  // Format frequency (Hz -> kHz jika >1000)
  const freqText = frequency >= 1000 ? `${frequency / 1000}kHz` : `${frequency}Hz`;

  return (
    <View style={[styles.container, { 
      paddingVertical: spacing.sm,
      gap: spacing.md,
    }]}>
      <Text style={[styles.freqText, { 
        color: colors.text.secondary,
        width: 60,
      }]}>
        {freqText}
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={-12}
        maximumValue={12}
        value={localGain}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={colors.primary[500]}
        maximumTrackTintColor={colors.background.tertiary}
        thumbTintColor={colors.primary[500]}
      />
      <Text style={[styles.gainText, { 
        color: localGain > 0 ? colors.primary[500] : colors.text.secondary,
        width: 50,
        textAlign: 'right',
      }]}>
        {localGain > 0 ? `+${localGain}` : localGain} dB
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    height: 40,
  },
  freqText: {
    fontSize: 14,
  },
  gainText: {
    fontSize: 14,
  },
});