import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useSearch } from '@/hooks/useSearch';
import { usePlayerStore } from '@/store/playerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

export default function SearchScreen() {
  const { songs } = useMediaLibrary();
  const {
    searchQuery,
    setSearchQuery,
    filterBy,
    setFilterBy,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    results,
  } = useSearch(songs);
  
  const { setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer();

  const handlePlaySong = (song: any) => {
    setQueue(results);
    loadSong(song);
  };

  const toggleSort = (field: 'title' | 'artist' | 'duration') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#C8D4E0" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari lagu..."
          placeholderTextColor="#C8D4E0"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter & Sort */}
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Filter:</Text>
          {(['title', 'artist', 'album'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                filterBy === filter && styles.filterChipActive,
              ]}
              onPress={() => setFilterBy(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterBy === filter && styles.filterChipTextActive,
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sortRow}>
          <Text style={styles.filterLabel}>Urut:</Text>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => toggleSort('title')}
          >
            <Text style={styles.sortButtonText}>Judul</Text>
            {sortBy === 'title' && (
              <Ionicons
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color="#00D4AA"
              />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => toggleSort('artist')}
          >
            <Text style={styles.sortButtonText}>Artis</Text>
            {sortBy === 'artist' && (
              <Ionicons
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color="#00D4AA"
              />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => toggleSort('duration')}
          >
            <Text style={styles.sortButtonText}>Durasi</Text>
            {sortBy === 'duration' && (
              <Ionicons
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color="#00D4AA"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.songItem}
            onPress={() => handlePlaySong(item)}
          >
            <View style={styles.songInfo}>
              <Text style={styles.songTitle}>{item.title}</Text>
              <Text style={styles.songArtist}>{item.artist}</Text>
            </View>
            <Text style={styles.songDuration}>
              {Math.floor(item.duration / 60)}:{Math.floor(item.duration % 60).toString().padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#1F2A3A" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Tidak ada hasil' : 'Cari lagu favorit Anda'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2A3A',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#F0F4F8',
    fontSize: 16,
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  filterLabel: {
    color: '#C8D4E0',
    fontSize: 14,
    marginRight: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#1F2A3A',
  },
  filterChipActive: {
    backgroundColor: '#00D4AA',
  },
  filterChipText: {
    color: '#C8D4E0',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#0A1628',
    fontWeight: 'bold',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortButtonText: {
    color: '#F0F4F8',
    fontSize: 14,
  },
  songItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#F0F4F8',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  songArtist: {
    color: '#C8D4E0',
    fontSize: 14,
  },
  songDuration: {
    color: '#C8D4E0',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: '#C8D4E0',
    fontSize: 16,
    marginTop: 16,
  },
});