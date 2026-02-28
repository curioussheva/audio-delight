/**
 * PlayerControls — Week 2
 * Play/Pause/Skip dengan haptic feedback + repeat mode
 */
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePlayerStore } from '../../store/usePlayerStore';

export function PlayerControls() {
  const {
    playbackState, repeatMode,
    togglePlayPause, skipToNext, skipToPrevious, setRepeatMode,
  } = usePlayerStore();

  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';

  const handlePlay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await togglePlayPause();
  };

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await skipToNext();
  };

  const handlePrev = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await skipToPrevious();
  };

  const handleRepeat = () => {
    Haptics.selectionAsync();
    const modes: Array<'off' | 'track' | 'queue'> = ['off', 'track', 'queue'];
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(next);
  };

  const repeatIcon = repeatMode === 'off' ? '↺' : repeatMode === 'track' ? '↺¹' : '↺∞';
  const repeatColor = repeatMode === 'off' ? '#2a2f45' : '#6378ff';

  return (
    <View style={styles.container}>
      {/* Repeat */}
      <TouchableOpacity style={styles.auxBtn} onPress={handleRepeat}>
        <Text style={[styles.auxText, { color: repeatColor }]}>{repeatIcon}</Text>
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity style={styles.sideBtn} onPress={handlePrev}>
        <Text style={styles.sideText}>⏮</Text>
      </TouchableOpacity>

      {/* Play/Pause */}
      <TouchableOpacity
        style={[styles.playBtn, isPlaying && styles.playBtnActive]}
        onPress={handlePlay}
        activeOpacity={0.85}
      >
        {isLoading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.playText}>{isPlaying ? '⏸' : '▶'}</Text>
        }
      </TouchableOpacity>

      {/* Next */}
      <TouchableOpacity style={styles.sideBtn} onPress={handleNext}>
        <Text style={styles.sideText}>⏭</Text>
      </TouchableOpacity>

      {/* Placeholder (shuffle later) */}
      <View style={styles.auxBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  auxBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  auxText: { fontSize: 18, fontWeight: '600' },
  sideBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontSize: 22, color: '#8090b0' },
  playBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#6378ff',
    alignItems: 'center', justifyContent: 'center',
    elevation: 10,
    shadowColor: '#6378ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  playBtnActive: {
    backgroundColor: '#7a8fff',
  },
  playText: { fontSize: 26, color: '#fff' },
});
