import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

export default function PlaylistsScreen() {
  const { playlists, loading, createPlaylist, deletePlaylist } = usePlaylists();
  const { queue, setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    await createPlaylist({
      name: newPlaylistName,
      description: newPlaylistDesc,
    });
    
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setModalVisible(false);
  };

  const handlePlayPlaylist = (songs: any[]) => {
    setQueue(songs);
    if (songs.length > 0) {
      loadSong(songs[0]);
    }
  };

  const handleDeletePlaylist = (id: string, name: string) => {
    Alert.alert(
      'Hapus Playlist',
      `Yakin ingin menghapus "${name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', onPress: () => deletePlaylist(id), style: 'destructive' },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Playlists</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Ionicons name="add-circle" size={32} color="#00D4AA" />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.playlistItem}>
            <TouchableOpacity
              style={styles.playlistInfo}
              onPress={() => handlePlayPlaylist(item.songs)}
            >
              <View style={styles.playlistIcon}>
                <Ionicons name="musical-notes" size={32} color="#00D4AA" />
              </View>
              <View style={styles.playlistDetails}>
                <Text style={styles.playlistName}>{item.name}</Text>
                <Text style={styles.playlistMeta}>
                  {item.songCount} lagu • {Math.floor(item.duration / 60)} menit
                </Text>
                {item.description ? (
                  <Text style={styles.playlistDesc}>{item.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => handleDeletePlaylist(item.id, item.name)}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={64} color="#1F2A3A" />
            <Text style={styles.emptyText}>Belum ada playlist</Text>
            <Text style={styles.emptySubtext}>
              Buat playlist pertama Anda dengan menekan tombol +
            </Text>
          </View>
        }
      />

      {/* Modal Create Playlist */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Buat Playlist Baru</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Nama playlist"
              placeholderTextColor="#C8D4E0"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Deskripsi (opsional)"
              placeholderTextColor="#C8D4E0"
              value={newPlaylistDesc}
              onChangeText={setNewPlaylistDesc}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Batal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreatePlaylist}
              >
                <Text style={styles.createButtonText}>Buat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F0F4F8',
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  playlistInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1F2A3A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playlistDetails: {
    flex: 1,
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0F4F8',
    marginBottom: 4,
  },
  playlistMeta: {
    fontSize: 12,
    color: '#C8D4E0',
    marginBottom: 4,
  },
  playlistDesc: {
    fontSize: 12,
    color: '#00D4AA',
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#F0F4F8',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#C8D4E0',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#0A1628',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2A3A',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F0F4F8',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1F2A3A',
    borderRadius: 8,
    padding: 12,
    color: '#F0F4F8',
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#1F2A3A',
  },
  cancelButtonText: {
    color: '#C8D4E0',
    fontSize: 16,
  },
  createButton: {
    backgroundColor: '#00D4AA',
  },
  createButtonText: {
    color: '#0A1628',
    fontSize: 16,
    fontWeight: 'bold',
  },
});