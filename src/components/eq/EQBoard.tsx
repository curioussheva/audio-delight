/**
 * EQBoard — Week 2
 * 10-band vertical sliders dengan:
 * - Pan gesture (GestureHandler)
 * - Haptic feedback saat nol crossing
 * - Smooth fill animation
 * - Double-tap reset per band
 */
import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS, withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import {
  EQ_DISPLAY_LABELS, MAX_GAIN, MIN_GAIN, DEFAULT_BANDS,
} from '../../constants/eq';
import { useEQStore } from '../../store/useEQStore';

const BAND_HEIGHT = 160;
const GAIN_RANGE = MAX_GAIN - MIN_GAIN; // 24

function formatGain(gain: number): string {
  if (gain === 0) return '0';
  return gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1);
}

interface BandProps {
  index: number;
  gain: number;
  label: string;
  isEnabled: boolean;
  onGainChange: (index: number, gain: number) => void;
  onReset: (index: number) => void;
}

function BandSlider({ index, gain, label, isEnabled, onGainChange, onReset }: BandProps) {
  const startGain = useSharedValue(gain);
  const prevGain = useSharedValue(gain);

  const thumbPct = 1 - (gain - MIN_GAIN) / GAIN_RANGE;
  const thumbY = thumbPct * BAND_HEIGHT;
  const neutralY = (1 - (0 - MIN_GAIN) / GAIN_RANGE) * BAND_HEIGHT;
  const isPositive = gain >= 0;
  const fillTop = isPositive ? thumbY : neutralY;
  const fillHeight = Math.max(2, Math.abs(neutralY - thumbY));

  const hapticOnZero = useCallback((newGain: number, old: number) => {
    if ((old < 0 && newGain >= 0) || (old > 0 && newGain <= 0)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startGain.value = gain;
    })
    .onUpdate((e) => {
      const deltaGain = -(e.translationY / BAND_HEIGHT) * GAIN_RANGE;
      const raw = startGain.value + deltaGain;
      const snapped = Math.round(raw * 2) / 2; // 0.5dB steps
      const clamped = Math.max(MIN_GAIN, Math.min(MAX_GAIN, snapped));

      if (clamped !== prevGain.value) {
        runOnJS(hapticOnZero)(clamped, prevGain.value);
        prevGain.value = clamped;
        runOnJS(onGainChange)(index, clamped);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onReset)(index);
      runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
    });

  const composed = Gesture.Simultaneous(panGesture, doubleTap);

  const isZero = Math.abs(gain) < 0.05;

  return (
    <View style={[styles.bandCol, !isEnabled && styles.bandDisabled]}>
      {/* Gain label */}
      <Text style={[
        styles.gainLabel,
        isPositive && !isZero && { color: Colors.accent },
        !isPositive && { color: Colors.accent2 },
      ]}>
        {formatGain(gain)}
      </Text>

      {/* Slider */}
      <GestureDetector gesture={composed}>
        <View style={styles.sliderWrap}>
          {/* Track */}
          <View style={styles.track}>
            {/* Zero line */}
            <View style={[styles.zeroLine, { top: neutralY }]} />

            {/* Fill */}
            <View style={[
              styles.fill,
              {
                top: fillTop,
                height: fillHeight,
                backgroundColor: isPositive ? Colors.accent : Colors.accent2,
                opacity: isEnabled ? 0.85 : 0.3,
              },
            ]} />

            {/* Thumb */}
            <View style={[
              styles.thumb,
              { top: thumbY - 10 },
              isZero && styles.thumbNeutral,
              !isZero && isPositive && styles.thumbPositive,
              !isZero && !isPositive && styles.thumbNegative,
            ]} />
          </View>
        </View>
      </GestureDetector>

      {/* Freq label */}
      <Text style={styles.freqLabel}>{label}</Text>
    </View>
  );
}

export function EQBoard() {
  const { bands, isEQEnabled, setBand, setEQEnabled } = useEQStore();

  const handleGainChange = useCallback((index: number, gain: number) => {
    setBand(index, { gain });
  }, [setBand]);

  const handleReset = useCallback((index: number) => {
    setBand(index, { gain: 0 });
  }, [setBand]);

  return (
    <View style={styles.container}>
      {/* ON/OFF toggle */}
      <TouchableOpacity
        style={[styles.toggle, isEQEnabled && styles.toggleActive]}
        onPress={() => setEQEnabled(!isEQEnabled)}
      >
        <Text style={[styles.toggleText, isEQEnabled && styles.toggleTextActive]}>
          EQ {isEQEnabled ? 'ON' : 'OFF'}
        </Text>
      </TouchableOpacity>

      {/* dB scale */}
      <View style={styles.scaleRow}>
        {['+12', '+6', '0', '-6', '-12'].map((v) => (
          <Text key={v} style={styles.scaleLabel}>{v}</Text>
        ))}
      </View>

      {/* Sliders */}
      <View style={styles.sliders}>
        {bands.map((band, i) => (
          <BandSlider
            key={band.id}
            index={i}
            gain={band.gain}
            label={EQ_DISPLAY_LABELS[i]}
            isEnabled={isEQEnabled}
            onGainChange={handleGainChange}
            onReset={handleReset}
          />
        ))}
      </View>

      <Text style={styles.hint}>Drag slider • Double-tap to reset</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  toggle: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  toggleActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  toggleText: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1 },
  toggleTextActive: { color: '#fff' },

  scaleRow: {
    height: BAND_HEIGHT,
    justifyContent: 'space-between',
    position: 'absolute',
    right: 4,
    top: 52,
  },
  scaleLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'right' },

  sliders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    paddingRight: 20,
  },
  bandCol: {
    alignItems: 'center',
    flex: 1,
  },
  bandDisabled: { opacity: 0.4 },

  gainLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
    width: 32,
    textAlign: 'center',
  },

  sliderWrap: {
    width: 28,
    height: BAND_HEIGHT,
    alignItems: 'center',
  },
  track: {
    width: 4,
    height: BAND_HEIGHT,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'visible',
  },
  zeroLine: {
    position: 'absolute',
    width: 12,
    height: 1,
    left: -4,
    backgroundColor: Colors.borderStrong,
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textMuted,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  thumbNeutral: {
    backgroundColor: Colors.textMuted,
    width: 16,
    height: 16,
    borderRadius: 8,
    left: -6,
  },
  thumbPositive: {
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  thumbNegative: {
    backgroundColor: Colors.accent2,
    shadowColor: Colors.accent2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },

  freqLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },

  hint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.5,
  },
});
