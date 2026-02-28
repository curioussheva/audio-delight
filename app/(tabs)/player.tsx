import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  usePlayerStore, usePlaybackState, useProgress,
  useActiveTrack, rnState,
} from '../../src/store/usePlayerStore';
import { PlayerControls } from '../../src/components/player/PlayerControls';
import { SpectrumBars } from '../../src/components/visualizer/SpectrumBars';
import { useVisualizer } from '../../src/hooks/useVisualizer';

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

export default function PlayerScreen() {
  const { currentTrack, init, isInitialized, seekTo } = usePlayerStore();
  const pbState = usePlaybackState();
  const progress = useProgress();
  const activeTrack = useActiveTrack();
  const { fftData, start, stop } = useVisualizer();
  const { width } = useWindowDimensions();

  const playState = rnState(pbState.state);
  const isPlaying = playState === 'playing';

  const track = activeTrack
    ? { title: activeTrack.title ?? '', artist: activeTrack.artist ?? '' }
    : currentTrack;

  useEffect(() => { if (!isInitialized) init(); }, []);
  useEffect(() => { isPlaying ? start() : stop(); }, [isPlaying]);

  const dur = progress.duration ?? 0;
  const pos = progress.position ?? 0;
  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.nowPlaying}>NOW PLAYING</Text>
        {currentTrack?.format && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{currentTrack.format}</Text>
          </View>
        )}
      </View>

      {/* Album Art */}
      <View style={styles.artWrap}>
        <View style={[styles.art, isPlaying && styles.artGlow]}>
          <Text style={track?.title ? styles.artInitial : styles.artEmoji}>
            {track?.title ? track.title.charAt(0).toUpperCase() : '♪'}
          </Text>
        </View>
        {isPlaying && <View style={styles.artRing} />}
      </View>

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track?.title ?? 'Pilih lagu dari Library'}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track?.artist ?? '—'}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressWrap}>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${pct * 100}%` as any }]}>
            <View style={styles.thumb} />
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{fmt(pos)}</Text>
          <Text style={styles.time}>{fmt(dur)}</Text>
        </View>
      </View>

      <PlayerControls />

      <View style={styles.spectrumWrap}>
        <SpectrumBars fftData={fftData} width={width - 48} height={64} barCount={48} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080a0f' },
  header: { flexDirection:'row', justifyContent:'center', alignItems:'center', paddingTop:8, gap:12 },
  nowPlaying: { fontSize:10, color:'#6378ff', letterSpacing:3, fontWeight:'600' },
  badge: { paddingHorizontal:8, paddingVertical:2, borderRadius:4, backgroundColor:'rgba(99,120,255,0.12)', borderWidth:1, borderColor:'rgba(99,120,255,0.3)' },
  badgeText: { fontSize:9, color:'#6378ff', letterSpacing:1 },
  artWrap: { alignItems:'center', justifyContent:'center', marginVertical:20 },
  art: { width:220, height:220, borderRadius:24, backgroundColor:'#111520', borderWidth:1, borderColor:'rgba(99,120,255,0.1)', alignItems:'center', justifyContent:'center' },
  artGlow: { borderColor:'rgba(99,120,255,0.3)', shadowColor:'#6378ff', shadowOffset:{width:0,height:0}, shadowOpacity:0.4, shadowRadius:24, elevation:10 },
  artRing: { position:'absolute', width:240, height:240, borderRadius:34, borderWidth:1, borderColor:'rgba(99,120,255,0.15)' },
  artInitial: { fontSize:72, color:'#6378ff', fontWeight:'800', opacity:0.7 },
  artEmoji: { fontSize:72, opacity:0.2 },
  trackInfo: { alignItems:'center', paddingHorizontal:32, gap:4, marginBottom:16 },
  trackTitle: { fontSize:20, fontWeight:'700', color:'#e8eaf6', textAlign:'center' },
  trackArtist: { fontSize:13, color:'#5a6080', textAlign:'center' },
  progressWrap: { paddingHorizontal:32, gap:8, marginBottom:8 },
  barBg: { height:4, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:2 },
  barFill: { height:'100%', backgroundColor:'#6378ff', borderRadius:2, alignItems:'flex-end', justifyContent:'center' },
  thumb: { width:12, height:12, borderRadius:6, backgroundColor:'#fff', marginRight:-6, elevation:4 },
  timeRow: { flexDirection:'row', justifyContent:'space-between' },
  time: { fontSize:11, color:'#5a6080' },
  spectrumWrap: { flex:1, justifyContent:'flex-end', paddingHorizontal:24, paddingBottom:12 },
});
