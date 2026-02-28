import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import TrackPlayer from 'react-native-track-player';
import { usePlayerStore, usePlaybackState, rnState } from '../../store/usePlayerStore';

export function PlayerControls() {
  const { repeatMode, setRepeatMode } = usePlayerStore();
  const pbState = usePlaybackState();
  const playState = rnState(pbState.state);
  const isPlaying = playState === 'playing';
  const isLoading = playState === 'loading';

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    isPlaying ? TrackPlayer.pause() : TrackPlayer.play();
  };
  const handleNext = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); TrackPlayer.skipToNext(); };
  const handlePrev = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); TrackPlayer.skipToPrevious(); };
  const handleRepeat = () => {
    Haptics.selectionAsync();
    const modes = ['off','track','queue'] as const;
    setRepeatMode(modes[(modes.indexOf(repeatMode)+1)%3]);
  };

  const repeatColor = repeatMode === 'off' ? '#2a2f45' : '#6378ff';

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.aux} onPress={handleRepeat}>
        <Text style={[styles.auxText, { color: repeatColor }]}>
          {repeatMode === 'off' ? '↺' : repeatMode === 'track' ? '↺¹' : '↺∞'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.side} onPress={handlePrev}>
        <Text style={styles.sideText}>⏮</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.play, isPlaying && styles.playActive]} onPress={handlePlay} activeOpacity={0.85}>
        {isLoading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.playText}>{isPlaying ? '⏸' : '▶'}</Text>
        }
      </TouchableOpacity>
      <TouchableOpacity style={styles.side} onPress={handleNext}>
        <Text style={styles.sideText}>⏭</Text>
      </TouchableOpacity>
      <View style={styles.aux} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:20, paddingVertical:8 },
  aux: { width:36, height:36, alignItems:'center', justifyContent:'center' },
  auxText: { fontSize:18, fontWeight:'600' },
  side: { width:44, height:44, alignItems:'center', justifyContent:'center' },
  sideText: { fontSize:22, color:'#8090b0' },
  play: { width:68, height:68, borderRadius:34, backgroundColor:'#6378ff', alignItems:'center', justifyContent:'center', elevation:10, shadowColor:'#6378ff', shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:16 },
  playActive: { backgroundColor:'#7a8fff' },
  playText: { fontSize:26, color:'#fff' },
});
