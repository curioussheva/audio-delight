/**
 * Library Screen — Week 2
 * Scan + pick audio files, tap to play
 */
import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../../src/hooks/useLibrary';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { Track } from '../../src/types/audio.types';

function formatDur(s: number) {
  if (!s) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${(bytes / 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;
}

function TrackRow({ track, isActive, onPress }: {
  track: Track;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, isActive && styles.rowActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Playing indicator */}
      <View style={[styles.playIndicator, isActive && styles.playIndicatorActive]}>
        <Text style={{ fontSize: 12, color: isActive ? '#6378ff' : '#2a2f45' }}>
          {isActive ? '▶' : '♪'}
        </Text>
      </View>

      {/* Track info */}
      <View style={styles.trackMeta}>
        <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]}
          numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackSub} numberOfLines={1}>
          {track.artist} · {track.format ?? 'AUDIO'} · {formatDur(track.duration)}
          {track.fileSize ? ` · ${formatSize(track.fileSize)}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const { tracks, isLoading, scan, pick } = useLibrary();
  const { currentTrack, playTrack } = usePlayerStore();

  const handlePlay = useCallback((track: Track) => {
    playTrack(track, tracks);
  }, [tracks, playTrack]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Library</Text>
          <Text style={styles.subtitle}>
            {tracks.length > 0 ? `${tracks.length} lagu` : 'Belum ada lagu'}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={scan} disabled={isLoading}>
            {isLoading
              ? <ActivityIndicator size="small" color="#6378ff" />
              : <Text style={styles.btnText}>↺ Scan</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={pick}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>+ Tambah</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Track list */}
      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyTitle}>Library kosong</Text>
          <Text style={styles.emptyText}>
            Tap "↺ Scan" untuk cari file audio di penyimpanan,{'\n'}
            atau "+ Tambah" untuk pilih file manual.
          </Text>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 16 }]} onPress={pick}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>+ Pilih File Audio</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              isActive={currentTrack?.id === item.id}
              onPress={() => handlePlay(item)}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080a0f' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#e8eaf6' },
  subtitle: { fontSize: 12, color: '#5a6080', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 72, alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#6378ff', borderColor: '#6378ff' },
  btnText: { fontSize: 12, color: '#8090b0', fontWeight: '600' },
  btnTextPrimary: { color: '#fff' },

  list: { paddingBottom: 32 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginLeft: 72 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowActive: { backgroundColor: 'rgba(99,120,255,0.06)' },
  playIndicator: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0d1018',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIndicatorActive: {
    borderColor: 'rgba(99,120,255,0.4)',
    backgroundColor: 'rgba(99,120,255,0.08)',
  },
  trackMeta: { flex: 1 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: '#c0c8e0' },
  trackTitleActive: { color: '#6378ff' },
  trackSub: { fontSize: 11, color: '#5a6080', marginTop: 2 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#e8eaf6' },
  emptyText: { fontSize: 13, color: '#5a6080', textAlign: 'center', lineHeight: 20 },
});
