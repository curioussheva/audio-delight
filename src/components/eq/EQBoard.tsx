import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { EQ_DISPLAY_LABELS, MAX_GAIN, MIN_GAIN } from '../../constants/eq';
import { useEQStore } from '../../store/useEQStore';
import { formatGain } from '../../utils';

const BAND_HEIGHT = 160;

interface BandSliderProps {
  index: number;
  gain: number;
  label: string;
  onGainChange: (index: number, gain: number) => void;
}

function BandSlider({ index, gain, label, onGainChange }: BandSliderProps) {
  const gainRange = MAX_GAIN - MIN_GAIN;
  const thumbPct = 1 - (gain - MIN_GAIN) / gainRange; // 0 = top, 1 = bottom
  const thumbY = thumbPct * BAND_HEIGHT;

  const isPositive = gain > 0;
  const neutralY = (1 - (0 - MIN_GAIN) / gainRange) * BAND_HEIGHT;

  const fillTop = isPositive ? thumbY : neutralY;
  const fillHeight = Math.abs(neutralY - thumbY);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newPct = Math.max(0, Math.min(1, thumbPct + e.translationY / BAND_HEIGHT));
      const newGain = Math.round(((1 - newPct) * gainRange + MIN_GAIN) * 2) / 2;
      runOnJS(onGainChange)(index, Math.max(MIN_GAIN, Math.min(MAX_GAIN, newGain)));
    });

  return (
    <View style={styles.bandCol}>
      <Text style={styles.gainLabel}>{formatGain(gain)}</Text>
      <GestureDetector gesture={panGesture}>
        <View style={styles.sliderWrap}>
          {/* Track */}
          <View style={styles.track}>
            {/* Zero line */}
            <View style={[styles.zeroLine, { top: neutralY }]} />
            {/* Fill */}
            <View
              style={[
                styles.fill,
                {
                  top: fillTop,
                  height: Math.max(2, fillHeight),
                  backgroundColor: isPositive ? Colors.accent : Colors.accent2,
                },
              ]}
            />
            {/* Thumb */}
            <View
              style={[
                styles.thumb,
                { top: thumbY - 6 },
                isPositive && { shadowColor: Colors.accent, shadowRadius: 6, shadowOpacity: 0.8 },
              ]}
            />
          </View>
        </View>
      </GestureDetector>
      <Text style={styles.freqLabel}>{label}</Text>
    </View>
  );
}

export function EQBoard() {
  const { bands, isEQEnabled, setBand, setEQEnabled } = useEQStore();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Equalizer</Text>
        <TouchableOpacity
          style={[styles.toggle, isEQEnabled && styles.toggleActive]}
          onPress={() => setEQEnabled(!isEQEnabled)}
        >
          <Text style={[styles.toggleText, isEQEnabled && styles.toggleTextActive]}>
            {isEQEnabled ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bands */}
      <View style={[styles.bands, !isEQEnabled && styles.disabled]}>
        {bands.map((band, i) => (
          <BandSlider
            key={band.id}
            index={i}
            gain={band.gain}
            label={EQ_DISPLAY_LABELS[i]}
            onGainChange={(idx, gain) => setBand(idx, { gain })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  toggleText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleTextActive: {
    color: Colors.accent,
  },
  bands: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    flex: 1,
  },
  disabled: {
    opacity: 0.3,
  },
  bandCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  gainLabel: {
    fontSize: 8,
    color: Colors.accent,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  sliderWrap: {
    height: BAND_HEIGHT,
    width: '100%',
    alignItems: 'center',
  },
  track: {
    width: 3,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 2,
    position: 'relative',
  },
  zeroLine: {
    position: 'absolute',
    left: -3,
    right: -3,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: -4.5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.text,
    elevation: 4,
  },
  freqLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
