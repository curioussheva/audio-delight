import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, ScrollView, ActivityIndicator, Platform
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';

// Hooks & Store
import { useTheme } from '@/context/ThemeContext';
import { usePlayerStore } from '@/store/playerStore';
import { useLibrary } from '@/hooks/useLibrary';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useFavorites } from '@/hooks/useFavorites';

// Components & Utils
import QualityBadge from '@/components/ui/QualityBadge';
import { formatTime } from '@/utils/time';
import { Song } from '@/types/audio';
import { LibraryScanner } from '@/services/library/LibraryScanner';

// Constants
import { SORT_GROUPS, FILTER_GROUPS } from '@/constants/libraryOptions'; 

/**
 * FIX: Masalah TS2322 pada FlashList sering terjadi karena definisi tipe library 
 * yang konflik. Kita bypass dengan membuat alias 'any'.
 */
const OptimizedList = FlashList as any;

const ListEmptyComponent = ({ colors, onScan }: { colors: any; onScan: () => void }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="musical-notes-outline" size={64} color={colors.text.tertiary} />
    <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
      Library Anda masih kosong
    </Text>
    <TouchableOpacity 
      style={[styles.scanBtn, { borderColor: colors.primary[500] }]}
      onPress={onScan}
    >
      <Text style={{ color: colors.primary[500], fontWeight: '700' }}>SCAN PERANGKAT</Text>
    </TouchableOpacity>
  </View>
);

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  // ===== STATE =====
  const [mode, setMode] = useState<'songs' | 'playlists' | 'search'>('songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title-asc');
  const [filterBy, setFilterBy] = useState('all');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // ===== DATA HOOKS =====
  const { songs, loading, reload } = useLibrary();
  const { isFavorite, toggleFavorite } = useFavorites(songs);
  const { playSong, currentSong } = usePlayerStore();

  // ===== HANDLERS =====

  const handleScanLibrary = async () => {
    try {
      await LibraryScanner.initDatabase();
      
      // Gunakan documentDirectory atau fallback ke folder publik jika di Android
      const targetDir = (FileSystem as any).documentDirectory || '';
      
      if (!targetDir && Platform.OS === 'ios') {
        Alert.alert("Error", "Storage tidak dapat diakses");
        return;
      }

      Alert.alert(
        "Scan Library", 
        "Mulai memindai file audio di direktori aplikasi?",
        [
          { text: "Batal", style: "cancel" },
          { 
            text: "Mulai", 
            onPress: async () => {
              await LibraryScanner.scanDirectory(targetDir, (current, total) => {
                console.log(`Progress: ${current}/${total}`);
              });
              reload();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        ]
      );
    } catch (e) {
      Alert.alert("Error", "Gagal memindai folder musik.");
    }
  };

  const handleFilterChange = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilterBy(id);
  };

  // ===== LOGIKA FILTER & SORT =====
  const processedSongs = useMemo(() => {
    let result = [...songs];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.title.toLowerCase().includes(q) || 
        s.artist.toLowerCase().includes(q)
      );
    }

    if (filterBy === 'format-flac') result = result.filter(s => s.codec?.toUpperCase() === 'FLAC');
    if (filterBy === 'sample-rate-hi-res') result = result.filter(s => (s.sampleRate || 0) > 44100);
    if (filterBy === 'favorites') result = result.filter(s => isFavorite(s.id));

    result.sort((a, b) => {
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'duration-desc') return (b.duration || 0) - (a.duration || 0);
      if (sortBy === 'bitrate-desc') return (b.bitrate || 0) - (a.bitrate || 0);
      return 0;
    });

    return result;
  }, [songs, searchQuery, sortBy, filterBy, isFavorite]);

  const renderSongItem = ({ item }: { item: Song }) => {
    const isNowPlaying = currentSong?.id === item.id;
    const favorite = isFavorite(item.id);

    return (
      <TouchableOpacity 
        style={[styles.songCard, isNowPlaying && { backgroundColor: colors.background.tertiary }]} 
        onPress={() => playSong(item, processedSongs)}
      >
        <View style={[styles.artworkPlaceholder, { backgroundColor: isNowPlaying ? colors.primary[500] : colors.background.secondary }]}>
          <Ionicons name={isNowPlaying ? "stats-chart" : "musical-note"} size={22} color={isNowPlaying ? "#000" : colors.text.tertiary} />
        </View>
        
        <View style={styles.songInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.songTitle, { color: isNowPlaying ? colors.primary[500] : colors.text.primary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <QualityBadge sampleRate={item.sampleRate} codec={item.codec} />
          </View>
          <Text style={[styles.songArtist, { color: colors.text.secondary }]} numberOfLines={1}>
            {item.artist} • {item.album || 'Unknown Album'}
          </Text>
        </View>

        <View style={styles.rightActions}>
           <TouchableOpacity onPress={() => toggleFavorite(item.id)} style={{ padding: 5 }}>
              <Ionicons name={favorite ? "heart" : "heart-outline"} size={20} color={favorite ? colors.status.error : colors.text.tertiary} />
           </TouchableOpacity>
           <Text style={[styles.durationText, { color: colors.text.tertiary }]}>{formatTime(item.duration || 0)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary[500]} /></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Ionicons name="menu-outline" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Library</Text>
        <TouchableOpacity onPress={() => setShowFilterModal(true)}>
          <Ionicons name="options-outline" size={26} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* SEGMENTED CONTROL */}
      <View style={styles.tabBar}>
        {(['songs', 'playlists', 'search'] as const).map((t) => (
          <TouchableOpacity 
            key={t} 
            onPress={() => setMode(t)}
            style={[styles.tabButton, mode === t && { borderBottomColor: colors.primary[500] }]}
          >
            <Text style={[styles.tabText, { color: mode === t ? colors.primary[500] : colors.text.secondary }]}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* ACTIVE FILTERS BADGE */}
      {(filterBy !== 'all' || sortBy !== 'title-asc') && (
        <View style={styles.activeFilterContainer}>
          <View style={styles.activeFilterBadge}>
            <Text style={styles.activeFilterText}>
              {sortBy.split('-')[0].toUpperCase()} • {filterBy.toUpperCase()}
            </Text>
            <TouchableOpacity onPress={() => {setFilterBy('all'); setSortBy('title-asc');}}>
              <Ionicons name="close-circle" size={14} color={colors.primary[500]} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* SEARCH BAR */}
      {mode === 'search' && (
        <View style={[styles.searchBox, { backgroundColor: colors.background.secondary }]}>
          <Ionicons name="search" size={20} color={colors.text.tertiary} />
          <TextInput 
            style={[styles.searchInput, { color: colors.text.primary }]}
            placeholder="Search library..."
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {/* LIST UTAMA */}
      <OptimizedList
        data={processedSongs}
        renderItem={renderSongItem}
        estimatedItemSize={72}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <ListEmptyComponent colors={colors} onScan={handleScanLibrary} />
        }
      />

      {/* MODAL FILTER */}
      <Modal visible={showFilterModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: colors.background.secondary }]}>
                  <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Sort & Filter</Text>
                  <ScrollView style={{ maxHeight: 400 }}>
                    <Text style={styles.sectionLabel}>SORT BY</Text>
                    {SORT_GROUPS.map((opt) => (
                      <TouchableOpacity 
                        key={opt.id} 
                        style={styles.optionRow} 
                        onPress={() => setSortBy(opt.id)}
                      >
                        <Text style={[styles.optionText, { color: sortBy === opt.id ? colors.primary[500] : colors.text.primary }]}>
                          {opt.label}
                        </Text>
                        {sortBy === opt.id && <Ionicons name="checkmark" size={20} color={colors.primary[500]} />}
                      </TouchableOpacity>
                    ))}

                    <View style={[styles.divider, { backgroundColor: colors.background.tertiary }]} />

                    <Text style={styles.sectionLabel}>FILTER BY</Text>
                    {FILTER_GROUPS.map((opt) => (
                      <TouchableOpacity 
                        key={opt.id} 
                        style={styles.optionRow} 
                        onPress={() => handleFilterChange(opt.id)}
                      >
                        <Text style={[styles.optionText, { color: filterBy === opt.id ? colors.primary[500] : colors.text.primary }]}>
                          {opt.label}
                        </Text>
                        {filterBy === opt.id && <Ionicons name="checkmark" size={20} color={colors.primary[500]} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity 
                    style={[styles.closeBtn, { backgroundColor: colors.primary[500] }]}
                    onPress={() => setShowFilterModal(false)}
                  >
                      <Text style={[styles.closeBtnText, { color: '#000' }]}>APPLY</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 50, 
    paddingBottom: 15 
  },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  tabBar: { flexDirection: 'row', marginBottom: 15 },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 15, height: 45, borderRadius: 10, marginBottom: 15 },
  searchInput: { flex: 1, marginLeft: 10 },
  songCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  artworkPlaceholder: { width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  songInfo: { flex: 1, marginLeft: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  songTitle: { fontSize: 16, fontWeight: '700' },
  songArtist: { fontSize: 13, marginTop: 2 },
  rightActions: { alignItems: 'flex-end', gap: 5 },
  durationText: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { textAlign: 'center', marginTop: 10, opacity: 0.5 },
  scanBtn: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  closeBtn: { height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  closeBtnText: { fontWeight: '800', fontSize: 16 },
  activeFilterContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, gap: 8 },
  activeFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
  },
  activeFilterText: { color: '#00D4AA', fontSize: 10, fontWeight: '800' },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#666', marginBottom: 10, marginTop: 15, letterSpacing: 1 },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  optionText: { fontSize: 16 },
  divider: { height: 1, marginVertical: 10 }
});
