import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { usePlayerStore } from '../../store/usePlayerStore';

export function PlayerControls() {
  const { playbackState, togglePlayPause } = usePlayerStore();
  const isPlaying = playbackState === 'playing';

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.sideBtn}>
        <Text style={styles.sideText}>⏮</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause} activeOpacity={0.8}>
        <Text style={styles.playText}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sideBtn}>
        <Text style={styles.sideText}>⏭</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 8 },
  sideBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontSize: 22, color: '#5a6080' },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#6378ff', alignItems: 'center', justifyContent: 'center', elevation: 8 },
  playText: { fontSize: 24, color: '#fff' },
});
