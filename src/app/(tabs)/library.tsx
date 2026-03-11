import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { Song } from '@/types/audio';

export default function LibraryScreen() {
  const { songs, loading, error, reload } = useMediaLibrary();
  const { setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer(); // ← FIX: ganti loadAndPlay dengan loadSong

  const handlePlaySong = async (song: Song) => {
    setQueue(songs);
    await loadSong(song); // ← FIX: panggil loadSong
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Error: {error}</Text>
        <TouchableOpacity onPress={reload} style={styles.retry}>
          <Text style={styles.retryText}>Coba lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.songItem}
            onPress={() => handlePlaySong(item)}
          >
            <Text style={styles.songTitle}>{item.title}</Text>
            <Text style={styles.songArtist}>{item.artist}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A1628' },
  error: { color: '#FF6B6B', fontSize: 16, marginBottom: 16 },
  retry: { backgroundColor: '#00D4AA', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#0A1628', fontWeight: 'bold' },
  songItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  songTitle: { color: '#F0F4F8', fontSize: 16, fontWeight: '500' },
  songArtist: { color: '#C8D4E0', fontSize: 14, marginTop: 4 },
});