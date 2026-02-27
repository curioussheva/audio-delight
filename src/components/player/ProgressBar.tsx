import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePlayerStore } from '../../store/usePlayerStore';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function ProgressBar() {
  const { position, duration } = usePlayerStore();
  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.container}>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, gap: 6 },
  barBg: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 },
  barFill: { height: '100%', backgroundColor: '#6378ff', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 11, color: '#5a6080' },
});
