import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '@/context/ThemeContext';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useFavorites } from '@/hooks/useFavorites';
import { Song } from '@/types/audio';
import { Playlist } from '@/types/playlist';
import { formatTime } from '@/utils/time';

// ==================== TIPE DATA ====================

type LibraryMode = 'songs' | 'playlists' | 'search';

type SortOption = 
  | 'title-asc' | 'title-desc'
  | 'artist-asc' | 'artist-desc'
  | 'album-asc' | 'album-desc'
  | 'year-desc' | 'year-asc'
  | 'duration-desc' | 'duration-asc'
  | 'date-added-desc' | 'date-added-asc'
  | 'date-modified-desc' | 'date-modified-asc'
  | 'track-number'
  | 'bitrate-desc' | 'bitrate-asc'
  | 'sample-rate-desc' | 'sample-rate-asc'
  | 'genre'
  | 'rating';

type FilterOption = 
  | 'all'
  | 'favorites'
  | 'recently-added-7'
  | 'recently-added-30'
  | 'most-played'
  | 'least-played'
  | 'unplayed'
  | 'format-mp3'
  | 'format-flac'
  | 'format-m4a'
  | 'format-other'
  | 'bitrate-high'
  | 'bitrate-lossless'
  | 'sample-rate-hi-res'
  | 'folder';

type FilterTab = 'sort' | 'filter';

// ==================== KONSTANTA SORT & FILTER ====================

const SORT_GROUPS = [
  {
    name: 'Judul',
    options: [
      { value: 'title-asc', label: 'Judul (A-Z)' },
      { value: 'title-desc', label: 'Judul (Z-A)' },
    ]
  },
  {
    name: 'Artis',
    options: [
      { value: 'artist-asc', label: 'Artis (A-Z)' },
      { value: 'artist-desc', label: 'Artis (Z-A)' },
    ]
  },
  {
    name: 'Album',
    options: [
      { value: 'album-asc', label: 'Album (A-Z)' },
      { value: 'album-desc', label: 'Album (Z-A)' },
    ]
  },
  {
    name: 'Tahun',
    options: [
      { value: 'year-desc', label: 'Tahun (Terbaru)' },
      { value: 'year-asc', label: 'Tahun (Terlama)' },
    ]
  },
  {
    name: 'Durasi',
    options: [
      { value: 'duration-desc', label: 'Durasi (Terpanjang)' },
      { value: 'duration-asc', label: 'Durasi (Terpendek)' },
    ]
  },
  {
    name: 'Tanggal',
    options: [
      { value: 'date-added-desc', label: 'Baru Ditambahkan' },
      { value: 'date-added-asc', label: 'Lama Ditambahkan' },
      { value: 'date-modified-desc', label: 'Baru Dimodifikasi' },
    ]
  },
  {
    name: 'Teknis',
    options: [
      { value: 'bitrate-desc', label: 'Bitrate Tertinggi' },
      { value: 'bitrate-asc', label: 'Bitrate Terendah' },
      { value: 'sample-rate-desc', label: 'Sample Rate Tertinggi' },
      { value: 'sample-rate-asc', label: 'Sample Rate Terendah' },
    ]
  },
  {
    name: 'Lainnya',
    options: [
      { value: 'track-number', label: 'Track Number' },
      { value: 'genre', label: 'Genre' },
      { value: 'rating', label: 'Rating' },
    ]
  }
];

const FILTER_GROUPS = [
  {
    name: 'Semua',
    options: [
      { value: 'all', label: 'Semua Lagu' },
    ]
  },
  {
    name: 'Status',
    options: [
      { value: 'favorites', label: 'Favorit' },
      { value: 'recently-added-7', label: 'Baru (7 hari)' },
      { value: 'recently-added-30', label: 'Baru (30 hari)' },
      { value: 'most-played', label: 'Paling Sering' },
      { value: 'least-played', label: 'Jarang Diputar' },
      { value: 'unplayed', label: 'Belum Diputar' },
    ]
  },
  {
    name: 'Format',
    options: [
      { value: 'format-mp3', label: 'MP3' },
      { value: 'format-flac', label: 'FLAC' },
      { value: 'format-m4a', label: 'M4A/AAC' },
      { value: 'format-other', label: 'Format Lain' },
    ]
  },
  {
    name: 'Kualitas',
    options: [
      { value: 'bitrate-high', label: 'High Bitrate (>320kbps)' },
      { value: 'bitrate-lossless', label: 'Lossless (>800kbps)' },
      { value: 'sample-rate-hi-res', label: 'Hi-Res (>44.1kHz)' },
    ]
  }
];

// ==================== KOMPONEN UTAMA ====================

export default function LibraryScreen() {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;

  // ===== STATE =====
  const [mode, setMode] = useState<LibraryMode>('songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('title-asc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('sort');
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  // ===== HOOKS =====
  const { songs, loading, error, reload } = useMediaLibrary();
  const { 
    playlists, 
    createPlaylist, 
    addToPlaylist, 
    removeFromPlaylist, 
    deletePlaylist,
    importM3U,
    exportM3U,
  } = usePlaylists();
  const { favoriteIds, toggleFavorite, isFavorite } = useFavorites(songs);
  const { setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer();
  const currentSong = usePlayerStore((state) => state.currentSong);

  // ===== DERIVED STATE =====
  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    songs.forEach(song => {
      const path = song.uri.split('/');
      path.pop();
      const folder = path.join('/');
      folderSet.add(folder);
    });
    return Array.from(folderSet).sort();
  }, [songs]);

  // ===== FILTER & SORT LOGIC =====
  const filteredAndSortedSongs = useMemo(() => {
    let filtered = [...songs];

    // Filter by folder
    if (filterBy === 'folder' && selectedFolder) {
      filtered = filtered.filter(song => 
        song.uri.startsWith(selectedFolder)
      );
    }

    // Filter by favorites
    if (filterBy === 'favorites') {
      filtered = filtered.filter(song => favoriteIds.includes(song.id));
    }

    // Filter by recently added
    if (filterBy === 'recently-added-7') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(song => (song.dateAdded || 0) > cutoff);
    }
    
    if (filterBy === 'recently-added-30') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(song => (song.dateAdded || 0) > cutoff);
    }

    // Filter by most played
    if (filterBy === 'most-played') {
      filtered = filtered.filter(song => (song.playCount || 0) > 5);
      filtered.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
    }

    // Filter by least played
    if (filterBy === 'least-played') {
      filtered = filtered.filter(song => (song.playCount || 0) < 3);
    }

    // Filter by unplayed
    if (filterBy === 'unplayed') {
      filtered = filtered.filter(song => !song.playCount);
    }

    // Filter by format
    if (filterBy === 'format-mp3') {
      filtered = filtered.filter(song => song.format?.codec === 'MP3');
    }
    
    if (filterBy === 'format-flac') {
      filtered = filtered.filter(song => song.format?.codec === 'FLAC');
    }
    
    if (filterBy === 'format-m4a') {
      filtered = filtered.filter(song => ['M4A', 'AAC'].includes(song.format?.codec || ''));
    }

    // Filter by bitrate
    if (filterBy === 'bitrate-high') {
      filtered = filtered.filter(song => (song.format?.bitrate || 0) > 320);
    }
    
    if (filterBy === 'bitrate-lossless') {
      filtered = filtered.filter(song => (song.format?.bitrate || 0) > 800);
    }

    // Filter by sample rate
    if (filterBy === 'sample-rate-hi-res') {
      filtered = filtered.filter(song => (song.format?.sampleRate || 0) > 44100);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(song => 
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query) ||
        song.uri.toLowerCase().includes(query)
      );
    }

    // ===== SORTING =====
    const sorted = [...filtered];
    
    switch (sortBy) {
      case 'title-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'artist-asc':
        sorted.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case 'artist-desc':
        sorted.sort((a, b) => b.artist.localeCompare(a.artist));
        break;
      case 'album-asc':
        sorted.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
        break;
      case 'album-desc':
        sorted.sort((a, b) => (b.album || '').localeCompare(a.album || ''));
        break;
      case 'year-desc':
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'year-asc':
        sorted.sort((a, b) => (a.year || 0) - (b.year || 0));
        break;
      case 'duration-desc':
        sorted.sort((a, b) => b.duration - a.duration);
        break;
      case 'duration-asc':
        sorted.sort((a, b) => a.duration - b.duration);
        break;
      case 'date-added-desc':
        sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
        break;
      case 'date-added-asc':
        sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
        break;
      case 'date-modified-desc':
        sorted.sort((a, b) => (b.dateModified || 0) - (a.dateModified || 0));
        break;
      case 'date-modified-asc':
        sorted.sort((a, b) => (a.dateModified || 0) - (b.dateModified || 0));
        break;
      case 'track-number':
        sorted.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
        break;
      case 'bitrate-desc':
        sorted.sort((a, b) => (b.format?.bitrate || 0) - (a.format?.bitrate || 0));
        break;
      case 'bitrate-asc':
        sorted.sort((a, b) => (a.format?.bitrate || 0) - (b.format?.bitrate || 0));
        break;
      case 'sample-rate-desc':
        sorted.sort((a, b) => (b.format?.sampleRate || 0) - (a.format?.sampleRate || 0));
        break;
      case 'sample-rate-asc':
        sorted.sort((a, b) => (a.format?.sampleRate || 0) - (b.format?.sampleRate || 0));
        break;
      case 'genre':
        sorted.sort((a, b) => (a.genre || '').localeCompare(b.genre || ''));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
    }
    
    return sorted;
  }, [songs, searchQuery, sortBy, filterBy, selectedFolder, favoriteIds]);

  // ===== HANDLER FUNCTIONS =====
  
  const handlePlaySong = async (song: Song) => {
    setQueue(songs);
    await loadSong(song);
  };

  const handleAddToPlaylist = (song: Song) => {
  Alert.alert(
  'Add to Playlist',
  'Pilih playlist',
  [
    ...playlists.map(playlist => ({
      text: playlist.name,
      onPress: () => addToPlaylist(playlist.id, [song]),
    })),
    { text: 'Cancel', style: 'cancel' },
  ]
);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    await createPlaylist({
      name: newPlaylistName,
      description: newPlaylistDesc,
    });
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setShowCreatePlaylistModal(false);
  };

  const handleImportM3U = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/x-mpegurl',
        copyToCacheDirectory: true,
      });
      
      if (result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        const content = await FileSystem.readAsStringAsync(uri);
        await importM3U(content);
        Alert.alert('Sukses', 'Playlist berhasil diimport');
      }
    } catch (error) {
      Alert.alert('Error', 'Gagal import playlist');
    }
  };

  const handleExportM3U = async (playlist: Playlist) => {
    try {
      const m3uContent = await exportM3U(playlist);
      // Simpan file (implementasi sesuai kebutuhan)
      Alert.alert('Sukses', 'Playlist diekspor');
    } catch (error) {
      Alert.alert('Error', 'Gagal ekspor playlist');
    }
  };

  // ===== RENDER FUNCTIONS =====
  
  const renderSongItem = ({ item, index }: { item: Song; index: number }) => {
    const isNowPlaying = currentSong?.id === item.id;
    const favorite = isFavorite(item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.songItem,
          { 
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            backgroundColor: isNowPlaying ? colors.background.tertiary : 'transparent',
            borderRadius: 8,
            marginBottom: spacing.xs,
          }
        ]}
        onPress={() => handlePlaySong(item)}
        onLongPress={() => handleAddToPlaylist(item)}
      >
        <View style={[styles.songNumber, { width: 30 }]}>
          <Text style={[styles.numberText, { color: colors.text.tertiary }]}>
            {index + 1}
          </Text>
        </View>
        
        <View style={[styles.songInfo, { flex: 1, marginLeft: spacing.sm }]}>
          <Text 
            style={[
              styles.songTitle, 
              { 
                color: isNowPlaying ? colors.primary[500] : colors.text.primary,
                marginBottom: spacing.xxs,
              }
            ]} 
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.songArtist, { color: colors.text.secondary }]} numberOfLines={1}>
            {item.artist} • {item.album || 'Unknown Album'}
          </Text>
          <Text style={[styles.songPath, { color: colors.text.tertiary }]} numberOfLines={1}>
            {item.format?.codec} • {item.format?.sampleRate / 1000}kHz
            {item.format?.bitrate ? ` • ${item.format.bitrate}kbps` : ''}
          </Text>
        </View>
        
        <View style={[styles.songMeta, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }]}>
          <TouchableOpacity onPress={() => toggleFavorite(item.id)}>
            <Ionicons 
              name={favorite ? 'heart' : 'heart-outline'} 
              size={20} 
              color={favorite ? colors.status.error : colors.text.secondary} 
            />
          </TouchableOpacity>
          <Text style={[styles.songDuration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>
          {isNowPlaying && (
            <Ionicons name="volume-high" size={16} color={colors.primary[500]} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={[
        styles.playlistItem,
        { 
          padding: spacing.md,
          backgroundColor: colors.background.secondary,
          borderRadius: 12,
          marginBottom: spacing.sm,
        }
      ]}
      onPress={() => {
        // Navigasi ke detail playlist
      }}
    >
      <View style={[styles.playlistHeader, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.playlistIcon, { 
          width: 48, height: 48, 
          backgroundColor: colors.primary[500],
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: spacing.md,
        }]}>
          <Ionicons name="list" size={24} color={colors.background.primary} />
        </View>
        <View style={[styles.playlistInfo, { flex: 1 }]}>
          <Text style={[styles.playlistName, { 
            color: colors.text.primary,
            fontSize: 16,
            fontWeight: '600',
            marginBottom: spacing.xs,
          }]}>
            {item.name}
          </Text>
          <Text style={[styles.playlistMeta, { 
            color: colors.text.secondary,
            fontSize: 12,
          }]}>
            {item.songCount} lagu • {Math.floor(item.duration / 60)} menit
          </Text>
        </View>
      </View>
      
      <View style={[styles.playlistActions, { 
        flexDirection: 'row',
        marginTop: spacing.sm,
        gap: spacing.lg,
      }]}>
        <TouchableOpacity style={[styles.playlistAction, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]}>
          <Ionicons name="play" size={20} color={colors.primary[500]} />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.playlistAction, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]}>
          <Ionicons name="shuffle" size={20} color={colors.primary[500]} />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>Shuffle</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.playlistAction, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]}
          onPress={() => handleExportM3U(item)}
        >
          <Ionicons name="download-outline" size={20} color={colors.primary[500]} />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>Export</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

// ===== LOADING & ERROR STATES =====
if (loading) {
  return (
    <View style={[styles.centerContainer, { 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: colors.background.primary 
    }]}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
    </View>
  );
}

if (error) {
  return (
    <View style={[styles.centerContainer, { backgroundColor: colors.background.primary }]}>
      <Ionicons name="alert-circle" size={48} color={colors.status.error} />
      <Text style={[styles.errorMessage, { 
        color: colors.status.error,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        textAlign: 'center',
      }]}>
        Error: {error}
      </Text>
      <TouchableOpacity 
        onPress={reload} 
        style={[styles.retryBtn, { 
          backgroundColor: colors.primary[500],
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: 8,
        }]}
      >
        <Text style={[styles.retryBtnText, { color: colors.background.primary }]}>
          Coba lagi
        </Text>
      </TouchableOpacity>
    </View>
  );
}

  // ===== MAIN RENDER =====
  return (
    <View style={[styles.container, { flex: 1, backgroundColor: colors.background.primary }]}>
      
      {/* Header */}
      <View style={[styles.header, { 
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.background.tertiary,
      }]}>
        <Text style={[styles.headerTitle, { 
          color: colors.text.primary,
          fontSize: 28,
          fontWeight: '700',
        }]}>
          Library
        </Text>
        <TouchableOpacity onPress={() => setShowFilterModal(true)}>
          <Ionicons name="options-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View style={[styles.segmentedControl, { 
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }]}>
        {(['songs', 'playlists', 'search'] as LibraryMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={[
              styles.segmentButton,
              {
                flex: 1,
                paddingVertical: spacing.sm,
                alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: mode === m ? colors.primary[500] : 'transparent',
              }
            ]}
          >
            <Text style={{ 
              color: mode === m ? colors.primary[500] : colors.text.secondary,
              fontWeight: mode === m ? '600' : '400',
            }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar (untuk mode search) */}
      {mode === 'search' && (
        <View style={[styles.searchContainer, { 
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
        }]}>
          <View style={[styles.searchInputContainer, { 
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background.secondary,
            borderRadius: 8,
            paddingHorizontal: spacing.md,
          }]}>
            <Ionicons name="search" size={20} color={colors.text.secondary} />
            <TextInput
              style={[styles.searchInput, { 
                flex: 1,
                paddingVertical: spacing.sm,
                marginLeft: spacing.sm,
                color: colors.text.primary,
              }]}
              placeholder="Cari lagu, artis, album..."
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {/* Konten Utama - Songs */}
      {mode === 'songs' && (
        <FlatList
          data={filteredAndSortedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderSongItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl,
          }}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { 
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 100,
            }]}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.text.tertiary} />
              <Text style={[styles.emptyText, { 
                color: colors.text.secondary,
                fontSize: 16,
                marginTop: spacing.lg,
              }]}>
                Tidak ada lagu
              </Text>
            </View>
          }
        />
      )}

      {/* Konten Utama - Playlists */}
      {mode === 'playlists' && (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          renderItem={renderPlaylistItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl,
          }}
          ListHeaderComponent={
            <View style={[styles.playlistHeader, { marginBottom: spacing.md }]}>
              <TouchableOpacity
                style={[styles.createPlaylistButton, { 
                  backgroundColor: colors.primary[500],
                  padding: spacing.md,
                  borderRadius: 12,
                  alignItems: 'center',
                }]}
                onPress={() => setShowCreatePlaylistModal(true)}
              >
                <Ionicons name="add-circle" size={24} color={colors.background.primary} />
                <Text style={[styles.createPlaylistText, { 
                  color: colors.background.primary,
                  marginTop: spacing.xs,
                }]}>
                  Buat Playlist Baru
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.importButton, { 
                  backgroundColor: colors.background.secondary,
                  padding: spacing.md,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginTop: spacing.sm,
                }]}
                onPress={handleImportM3U}
              >
                <Ionicons name="cloud-upload-outline" size={24} color={colors.text.primary} />
                <Text style={[styles.importText, { 
                  color: colors.text.primary,
                  marginTop: spacing.xs,
                }]}>
                  Import M3U
                </Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { 
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 100,
            }]}>
              <Ionicons name="list-outline" size={48} color={colors.text.tertiary} />
              <Text style={[styles.emptyText, { 
                color: colors.text.secondary,
                fontSize: 16,
                marginTop: spacing.lg,
              }]}>
                Belum ada playlist
              </Text>
            </View>
          }
        />
      )}

      {/* Konten Utama - Search */}
      {mode === 'search' && (
        <FlatList
          data={filteredAndSortedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderSongItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl,
          }}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { 
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 100,
            }]}>
              <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
              <Text style={[styles.emptyText, { 
                color: colors.text.secondary,
                fontSize: 16,
                marginTop: spacing.lg,
              }]}>
                {searchQuery ? 'Tidak ada hasil' : 'Cari lagu...'}
              </Text>
            </View>
          }
        />
      )}

      {/* ===== MODAL FILTER & SORT ===== */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={[styles.modalOverlay, { 
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }]}>
          <View style={[styles.modalContent, { 
            width: '90%',
            maxHeight: '80%',
            backgroundColor: colors.background.primary,
            borderRadius: 16,
            padding: spacing.lg,
          }]}>
            
            {/* Modal Tabs */}
            <View style={[styles.modalTabs, { 
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: colors.background.tertiary,
              marginBottom: spacing.md,
            }]}>
              <TouchableOpacity
                style={[styles.modalTab, { 
                  flex: 1,
                  paddingVertical: spacing.sm,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: filterTab === 'sort' ? colors.primary[500] : 'transparent',
                }]}
                onPress={() => setFilterTab('sort')}
              >
                <Text style={{ 
                  color: filterTab === 'sort' ? colors.primary[500] : colors.text.secondary,
                  fontWeight: filterTab === 'sort' ? '600' : '400',
                }}>
                  Urutkan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, { 
                  flex: 1,
                  paddingVertical: spacing.sm,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: filterTab === 'filter' ? colors.primary[500] : 'transparent',
                }]}
                onPress={() => setFilterTab('filter')}
              >
                <Text style={{ 
                  color: filterTab === 'filter' ? colors.primary[500] : colors.text.secondary,
                  fontWeight: filterTab === 'filter' ? '600' : '400',
                }}>
                  Filter
                </Text>
              </TouchableOpacity>
            </View>

            {/* Konten Sort */}
            {filterTab === 'sort' && (
              <ScrollView>
                {SORT_GROUPS.map((group) => (
                  <View key={group.name} style={{ marginBottom: spacing.lg }}>
                    <Text style={[styles.groupTitle, { 
                      color: colors.text.secondary,
                      fontSize: 12,
                      fontWeight: '600',
                      marginBottom: spacing.sm,
                    }]}>
                      {group.name}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      {group.options.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.sortOption, {
                            paddingVertical: spacing.sm,
                            paddingHorizontal: spacing.md,
                            backgroundColor: sortBy === option.value ? colors.primary[500] : colors.background.secondary,
                            borderRadius: 20,
                          }]}
                          onPress={() => setSortBy(option.value as SortOption)}
                        >
                          <Text style={{ 
                            color: sortBy === option.value ? colors.background.primary : colors.text.primary,
                            fontSize: 13,
                          }}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Konten Filter */}
            {filterTab === 'filter' && (
              <ScrollView>
                {FILTER_GROUPS.map((group) => (
                  <View key={group.name} style={{ marginBottom: spacing.lg }}>
                    <Text style={[styles.groupTitle, { 
                      color: colors.text.secondary,
                      fontSize: 12,
                      fontWeight: '600',
                      marginBottom: spacing.sm,
                    }]}>
                      {group.name}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      {group.options.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.filterOption, {
                            paddingVertical: spacing.sm,
                            paddingHorizontal: spacing.md,
                            backgroundColor: filterBy === option.value ? colors.primary[500] : colors.background.secondary,
                            borderRadius: 20,
                          }]}
                          onPress={() => setFilterBy(option.value as FilterOption)}
                        >
                          <Text style={{ 
                            color: filterBy === option.value ? colors.background.primary : colors.text.primary,
                            fontSize: 13,
                          }}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Folder Selection */}
                {filterBy === 'folder' && (
                  <View style={{ marginBottom: spacing.lg }}>
                    <Text style={[styles.groupTitle, { 
                      color: colors.text.secondary,
                      fontSize: 12,
                      fontWeight: '600',
                      marginBottom: spacing.sm,
                    }]}>
                      Pilih Folder
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {folders.map((folder) => (
                        <TouchableOpacity
                          key={folder}
                          style={[styles.folderItem, {
                            paddingVertical: spacing.sm,
                            paddingHorizontal: spacing.md,
                            backgroundColor: selectedFolder === folder ? colors.primary[500] : colors.background.secondary,
                            borderRadius: 8,
                            marginBottom: spacing.xs,
                          }]}
                          onPress={() => setSelectedFolder(folder)}
                        >
                          <Text style={{ 
                            color: selectedFolder === folder ? colors.background.primary : colors.text.primary,
                          }} numberOfLines={1}>
                            {folder.split('/').pop()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Modal Footer */}
            <View style={[styles.modalFooter, { 
              flexDirection: 'row',
              gap: spacing.md,
              marginTop: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.background.tertiary,
              paddingTop: spacing.md,
            }]}>
              <TouchableOpacity
                style={[styles.resetButton, { 
                  flex: 1,
                  backgroundColor: colors.background.secondary,
                  padding: spacing.md,
                  borderRadius: 8,
                  alignItems: 'center',
                }]}
                onPress={() => {
                  setSortBy('title-asc');
                  setFilterBy('all');
                  setSelectedFolder(null);
                }}
              >
                <Text style={{ color: colors.text.primary }}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyButton, { 
                  flex: 1,
                  backgroundColor: colors.primary[500],
                  padding: spacing.md,
                  borderRadius: 8,
                  alignItems: 'center',
                }]}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={{ color: colors.background.primary }}>Terapkan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Create Playlist */}
      <Modal
        visible={showCreatePlaylistModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreatePlaylistModal(false)}
      >
        <View style={[styles.modalOverlay, { 
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }]}>
          <View style={[styles.modalContent, { 
            width: '90%',
            backgroundColor: colors.background.primary,
            borderRadius: 16,
            padding: spacing.lg,
          }]}>
            <Text style={[styles.modalTitle, { 
              color: colors.text.primary,
              fontSize: 20,
              fontWeight: '700',
              marginBottom: spacing.lg,
            }]}>
              Buat Playlist Baru
            </Text>

            <TextInput
              style={[styles.input, { 
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                padding: spacing.md,
                borderRadius: 8,
                marginBottom: spacing.md,
              }]}
              placeholder="Nama playlist"
              placeholderTextColor={colors.text.tertiary}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
            />

            <TextInput
              style={[styles.input, { 
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                padding: spacing.md,
                borderRadius: 8,
                marginBottom: spacing.lg,
                height: 80,
                textAlignVertical: 'top',
              }]}
              placeholder="Deskripsi (opsional)"
              placeholderTextColor={colors.text.tertiary}
              value={newPlaylistDesc}
              onChangeText={setNewPlaylistDesc}
              multiline
            />

            <View style={[styles.modalButtons, { flexDirection: 'row', gap: spacing.md }]}>
              <TouchableOpacity
                style={[styles.modalButton, { 
                  flex: 1,
                  backgroundColor: colors.background.secondary,
                  padding: spacing.md,
                  borderRadius: 8,
                  alignItems: 'center',
                }]}
                onPress={() => setShowCreatePlaylistModal(false)}
              >
                <Text style={{ color: colors.text.secondary }}>Batal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { 
                  flex: 1,
                  backgroundColor: colors.primary[500],
                  padding: spacing.md,
                  borderRadius: 8,
                  alignItems: 'center',
                }]}
                onPress={handleCreatePlaylist}
              >
                <Text style={{ color: colors.background.primary }}>Buat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  segmentedControl: {
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
  },
  searchContainer: {},
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  songNumber: {
    width: 30,
    alignItems: 'center',
  },
  numberText: {
    fontSize: 14,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  songArtist: {
    fontSize: 12,
  },
  songPath: {
    fontSize: 10,
    marginTop: 2,
  },
  songMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  songDuration: {
    fontSize: 12,
  },
  playlistItem: {},
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
  },
  playlistMeta: {
    fontSize: 12,
  },
  playlistActions: {
    flexDirection: 'row',
  },
  playlistAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 12,
  },
  createPlaylistButton: {
    alignItems: 'center',
  },
  createPlaylistText: {
    fontSize: 14,
    fontWeight: '600',
  },
  importButton: {
    alignItems: 'center',
  },
  importText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryBtn: {
    borderRadius: 8,
    alignItems: 'center',
  },
  retryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
  },
  modalTabs: {
    flexDirection: 'row',
  },
  modalTab: {
    flex: 1,
    alignItems: 'center',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  sortOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  filterOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  folderItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalFooter: {
    flexDirection: 'row',
  },
  resetButton: {
    flex: 1,
    alignItems: 'center',
  },
  applyButton: {
    flex: 1,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  input: {},
  modalButtons: {
    flexDirection: 'row',
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
  },
});
