import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/colors';
import { useLibrary } from '../../src/hooks/useLibrary';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { Track } from '../../src/types/audio.types';
import { formatTime, formatFileSize } from '../../src/utils';

function TrackRow({
  track,
  isActive,
  onPress,
}: {
  track: Track;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.trackRow, isActive && styles.trackRowActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.trackNum, isActive && styles.trackNumActive]}>
        {isActive ? (
          <Text style={styles.playingDot}>▶</Text>
        ) : (
          <View style={styles.placeholderArt} />
        )}
      </View>
      <View style={styles.trackMeta}>
        <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
          {track.format && ` · ${track.format}`}
          {track.fileSize && ` · ${formatFileSize(track.fileSize)}`}
        </Text>
      </View>
      <Text style={styles.trackDuration}>
        {track.duration > 0 ? formatTime(track.duration) : '--:--'}
      </Text>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const { tracks, isLoading, error, hasScanned, scan, pickFiles } = useLibrary();
  const { currentTrack, playTrack } = usePlayerStore();

  useEffect(() => {
    if (!hasScanned) scan();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={scan}>
            <Text style={styles.iconBtnText}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={pickFiles}>
            <Text style={styles.addBtnText}>+ Tambah</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.count}>
        {tracks.length} lagu{tracks.length !== 1 ? '' : ''}
      </Text>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Scanning storage...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={scan}>
            <Text style={styles.retryText}>Coba lagi →</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && tracks.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyTitle}>Library kosong</Text>
          <Text style={styles.emptyDesc}>
            Tap "+ Tambah" untuk pilih file audio, atau pastikan ada file di folder Music.
          </Text>
        </View>
      )}

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            isActive={currentTrack?.id === item.id}
            onPress={() => playTrack(item, tracks)}
          />
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, color: Colors.textMuted },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: Colors.accent,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  count: {
    fontSize: 11, color: Colors.textMuted,
    fontFamily: 'monospace', paddingHorizontal: 24, paddingBottom: 12,
  },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 10, gap: 12,
  },
  trackRowActive: { backgroundColor: Colors.accentDim },
  trackNum: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  trackNumActive: {},
  playingDot: { fontSize: 14, color: Colors.accent },
  placeholderArt: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  trackMeta: { flex: 1, gap: 3 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  trackTitleActive: { color: Colors.accent },
  trackArtist: { fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace' },
  trackDuration: { fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace' },
  separator: { height: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },
  errorBox: {
    margin: 24, padding: 16,
    backgroundColor: 'rgba(255,95,122,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,95,122,0.2)',
    borderRadius: 12, gap: 8,
  },
  errorText: { fontSize: 13, color: Colors.error },
  retryText: { fontSize: 12, color: Colors.accent, fontFamily: 'monospace' },
  emptyIcon: { fontSize: 48, opacity: 0.3 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textMuted },
  emptyDesc: { fontSize: 13, color: Colors.textDim, textAlign: 'center', lineHeight: 20 },
});
