import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet,
  RefreshControl 
} from 'react-native';
import { useAudioStore } from '@store/audioStore';
import { useMusicLibrary } from '@hooks/useMusicLibrary';
import { useAudioPlayer } from '@hooks/useAudioPlayer';
import { useAudioPermissions } from '@hooks/useAudioPermissions';
import { Song } from '@/types/audio';

export default function LibraryScreen() {
  const { hasPermission, requestPermission } = useAudioPermissions();
  const { scanLibrary } = useMusicLibrary();
  const { loadSong } = useAudioPlayer();
  const songs = useAudioStore((state) => state.songs);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (hasPermission) {
      scanLibrary();
    }
  }, [hasPermission]);

  const onRefresh = async () => {
    setRefreshing(true);
    await scanLibrary();
    setRefreshing(false);
  };

  const renderSong = ({ item }: { item: Song }) => (
    <TouchableOpacity 
      style={styles.songItem}
      onPress={() => loadSong(item)}
    >
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {item.artist} • {item.format.codec.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.duration}>
        {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
      </Text>
    </TouchableOpacity>
  );

  if (!hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>Permission Required</Text>
        <Text style={styles.permissionSubtext}>
          PristineAudio needs access to your music library
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Library ({songs.length} songs)</Text>
      <FlatList
        data={songs}
        renderItem={renderSong}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1628',
    padding: 24,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0F4F8',
    padding: 24,
    paddingBottom: 16,
  },
  list: {
    paddingHorizontal: 16,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#141E33',
    marginBottom: 8,
    borderRadius: 8,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0F4F8',
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 13,
    color: '#C8D4E0',
  },
  duration: {
    fontSize: 13,
    color: '#00D4AA',
    fontVariant: ['tabular-nums'],
  },
  permissionText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0F4F8',
    marginBottom: 8,
  },
  permissionSubtext: {
    fontSize: 14,
    color: '#C8D4E0',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#0A1628',
    fontWeight: '700',
    fontSize: 16,
  },
});
