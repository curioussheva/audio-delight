/**
 * ProgressBar — Week 2
 * Seekable progress bar dengan position display
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { usePlayerStore } from '../../store/usePlayerStore';

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function ProgressBar() {
  const { position, duration, seekTo } = usePlayerStore();
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const handleSeek = useCallback((pct: number) => {
    if (duration > 0) seekTo(pct * duration);
  }, [duration, seekTo]);

  const tapGesture = Gesture.Tap()
    .onEnd((e, ctx) => {
      // get bar width from layout — approximate dengan screen width
      // untuk akurasi pakai onLayout, tapi ini cukup untuk MVP
      runOnJS(handleSeek)(Math.max(0, Math.min(1, e.x / 300)));
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={tapGesture}>
        <View style={styles.barBg}>
          {/* Buffer placeholder */}
          <View style={[styles.barBuffer, { width: `${Math.min(100, progress * 100 + 10)}%` }]} />
          {/* Progress */}
          <View style={[styles.barFill, { width: `${progress * 100}%` }]}>
            <View style={styles.thumb} />
          </View>
        </View>
      </GestureDetector>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{fmt(position)}</Text>
        <Text style={styles.time}>{fmt(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, gap: 8 },
  barBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'visible',
  },
  barBuffer: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#6378ff',
    borderRadius: 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginRight: -6,
    shadowColor: '#6378ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 11, color: '#5a6080', fontVariant: ['tabular-nums'] },
});
