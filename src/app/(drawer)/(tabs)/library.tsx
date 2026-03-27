import React, { useState, useCallback, useRef, useEffect } from "react";
import {
<<<<<<< Updated upstream
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
=======
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
>>>>>>> Stashed changes
} from "react-native";
import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
<<<<<<< Updated upstream
=======
import * as MediaLibrary from "expo-media-library";
>>>>>>> Stashed changes

import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOptimizedLibrary } from "@/features/library/hooks/useOptimizedLibrary";
import { useMediaScanner } from "@/features/library/hooks/useMediaScanner";
import * as FileSystem from "expo-file-system";
import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
<<<<<<< Updated upstream
import { FilterModal } from "@/features/library/components/FilterModal";
=======
import { LibraryScanner } from '@/features/library/api/scanner';
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import {
  useLibraryStore,
  selectAlbums,
  selectArtists,
  selectFolders,
} from "@/features/library/store/libraryStore";

>>>>>>> Stashed changes
import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { FolderList } from "@/features/library/components/FolderList";
<<<<<<< Updated upstream
import { FileTypeList } from "@/features/library/components/FileTypeList";
import { PlaylistList } from "@/features/library/components/Playlist";
import SQLiteService from "@/shared/lib/sqlite";
import { LibraryScanner } from "@/features/library/api/scanner";
=======
>>>>>>> Stashed changes
import { Song } from "@/shared/types/audio";
import {
  useLibraryStore,
  selectAlbums,
  selectArtists,
  selectGenres,
  selectFolders,
  selectFileTypes,
} from "@/features/library/store/libraryStore";
import type { LibraryTab } from "@/features/library/store/libraryStore";

<<<<<<< Updated upstream
// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: LibraryTab; label: string; icon: string }[] = [
  { id: "song",     label: "Song",     icon: "musical-note-outline"  },
  { id: "album",    label: "Album",    icon: "albums-outline"         },
  { id: "artist",   label: "Artist",   icon: "person-outline"         },
  { id: "genre",    label: "Genre",    icon: "musical-notes-outline"  },
  { id: "folder",   label: "Folder",   icon: "folder-outline"         },
  { id: "playlist", label: "Playlist", icon: "list-outline"           },
  { id: "filetype", label: "Format",   icon: "document-outline"       },
];

const SAF = (FileSystem as any).StorageAccessFramework;


// ─── Screen ───────────────────────────────────────────────────────────────────

=======
>>>>>>> Stashed changes
export default function LibraryScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { colors, spacing } = theme;
<<<<<<< Updated upstream
  const { playSong, currentSong } = usePlayerStore();

  const { activeTab, setActiveTab, tracks, setTracks, scanStatus } = useLibraryStore();
  
    // 1. Inisialisasi Database saat Screen di-mount
=======

  const { playSong, currentSong } = usePlayerStore();
  const {
    activeTab, setActiveTab,
    tracks, setTracks,
    scanStatus, setScanning,
  } = useLibraryStore();

  const { songs, loading, reload, isFavorite, toggleFavorite } = useOptimizedLibrary({
    searchQuery: "",
    filterBy: "all",
    sortBy: "title-asc",
  });

  // ── 1. Initial Load ──────────────────────────────────────────
>>>>>>> Stashed changes
  useEffect(() => {
    const init = async () => {
      try {
<<<<<<< Updated upstream
        // Panggil dengan pengecekan aman
        if ((LibraryScanner as any).initDatabase) {
           await (LibraryScanner as any).initDatabase();
        }
        
        const existingSongs = await LibraryScanner.getLibrarySongs();
        if (existingSongs.length > 0) {
          // FIX: Map Song[] ke MediaTrack[] dengan menyertakan fileSize default
          const tracks = existingSongs.map(s => ({
            ...s,
            fileSize: (s as any).fileSize || 0 // Pastikan properti wajib ada
          }));
          setTracks(tracks as any);
        }
=======
        const existingSongs = await LibraryScanner.getLibrarySongs() ?? [];
        console.log(`📊 [Library] Found ${existingSongs.length} songs in DB`);
        if (existingSongs.length > 0) setTracks(existingSongs);
>>>>>>> Stashed changes
      } catch (err) {
        console.error("Init DB Error:", err);
      }
    };
    init();
  }, [setTracks]);

<<<<<<< Updated upstream
  // Song tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortBy, setSortBy] = useState("title-asc");
  const [filterBy, setFilterBy] = useState("all");
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Existing optimized library (SQLite-backed songs)
  const { songs, loading, reload, isFavorite, toggleFavorite } =
    useOptimizedLibrary({
      searchQuery: showSearch ? searchQuery : "",
      filterBy,
      sortBy,
    });
    

  // Background scanner (expo-media-library)
  const { scan: bgScan } = useMediaScanner();

  const listRef = useRef<any>(null);
  
  // Derived data untuk tab non-song
  const albums    = React.useMemo(() => selectAlbums(tracks),    [tracks]);
  const artists   = React.useMemo(() => selectArtists(tracks),   [tracks]);
  const genres    = React.useMemo(() => selectGenres(tracks),    [tracks]);
  const folders   = React.useMemo(() => selectFolders(tracks),   [tracks]);
  const fileTypes = React.useMemo(() => selectFileTypes(tracks), [tracks]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

const handleScanLibrary = useCallback(async () => {
  // Ambil SAF secara langsung di dalam fungsi untuk memastikan objek terbaru
  const SAF = (FileSystem as any).StorageAccessFramework;

  if (!SAF) {
    // Log ini akan muncul di terminal Metro Anda untuk debugging
    console.error("DEBUG: SAF Object is null. Available FileSystem keys:", Object.keys(FileSystem));
    
    Alert.alert(
      "Module Tidak Ditemukan", 
      "Native module Storage Access Framework tidak terdeteksi. Silakan build ulang APK Development Anda."
    );
    return;
  }

  try {
    // Gunakan SAF yang sudah divalidasi
    const permissions = await SAF.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return;

    Alert.alert("Scan Library", "Mulai memindai folder?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Mulai",
        onPress: async () => {
          try {
            await LibraryScanner.scanDirectory(permissions.directoryUri);
            
            const freshSongs = await LibraryScanner.getLibrarySongs();
            const mappedTracks = freshSongs.map(s => ({
              ...s,
              fileSize: (s as any).fileSize || 0
            }));

            setTracks(mappedTracks as any);
            await reload();
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            console.error("Scan Error:", e);
            Alert.alert("Error", "Gagal memproses lagu.");
          }
        },
      },
    ]);
  } catch (error) {
    console.error("SAF Permission Error:", error);
    Alert.alert("Error", "Gagal meminta izin folder.");
  }
}, [reload, setTracks]);
=======
  // ── 2. Auto-detect file baru via MediaLibrary listener ───────
  useEffect(() => {
    let subscription: MediaLibrary.Subscription | null = null;

    const setupListener = async () => {
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) return;

      subscription = MediaLibrary.addListener(async (event) => {
        // Hanya react jika ada insert/delete audio
        if (event.hasIncrementalChanges && event.insertedAssets?.length > 0) {
          console.log('🔔 [Library] New audio files detected, running diff...');
          await BackgroundScanTask.runManual();
          await reload();
        }
      });
    };

    setupListener();
    return () => { subscription?.remove(); };
  }, [reload]);

  // ── 3. Register background task sekali saat mount ────────────
  useEffect(() => {
    if (scanStatus.autoScanEnabled) {
      BackgroundScanTask.register(30);
    }
  }, []);
>>>>>>> Stashed changes

  // ── 4. Scan Handler ──────────────────────────────────────────
  const handleScanLibrary = useCallback(async () => {
    if (scanStatus.isScanning) return;
    console.log("📂 [Scan] Manual scan triggered...");

<<<<<<< Updated upstream
  const handlePlaySong = useCallback(
    (song: Song) => playSong(song, songs),
    [playSong, songs],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => toggleFavorite(id),
    [toggleFavorite],
  );

  const handleTabChange = useCallback((tab: LibraryTab) => {
    setActiveTab(tab);
    if (tab !== "song") {
      setShowSearch(false);
      setSearchQuery("");
    }
  }, [setActiveTab]);

  // ─── FlashList config ──────────────────────────────────────────────────────

  const renderItem: ListRenderItem<Song> = useCallback(
    ({ item }) => (
      <SongListItem
        item={item}
        isNowPlaying={currentSong?.id === item.id}
        isFavorite={isFavorite(item.id)}
        colors={colors}
        onPress={handlePlaySong}
        onToggleFavorite={handleToggleFavorite}
=======
    try {
      await BackgroundScanTask.runManual((current, total) => {
        setScanning(true, current, total);
      });

      await reload();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("❌ [Scan] Error:", err);
      setScanning(false, 0, 0);
    }
  }, [scanStatus.isScanning, setScanning, reload]);

  // ── 5. Derived Data ──────────────────────────────────────────
  const albums  = useMemo(() => selectAlbums(tracks),  [tracks]);
  const artists = useMemo(() => selectArtists(tracks), [tracks]);
  const folders = useMemo(() => selectFolders(tracks), [tracks]);

  // ── 6. Progress label X / Y ──────────────────────────────────
  const scanLabel = useMemo(() => {
    if (!scanStatus.isScanning) return null;
    if (scanStatus.total > 0) {
      return `Memindai ${scanStatus.scanned} / ${scanStatus.total}`;
    }
    return "Mengumpulkan file...";
  }, [scanStatus.isScanning, scanStatus.scanned, scanStatus.total]);

  // ── 7. Render ────────────────────────────────────────────────
  const renderItem: ListRenderItem<Song> = useCallback(({ item }) => (
    <SongListItem
      item={item}
      isNowPlaying={currentSong?.id === item.id}
      isFavorite={isFavorite(item.id)}
      colors={colors}
      onPress={(s) => playSong(s, songs)}
      onToggleFavorite={toggleFavorite}
    />
  ), [currentSong?.id, isFavorite, colors, playSong, songs, toggleFavorite]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>

      {/* HEADER */}
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Ionicons name="menu-outline" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Library</Text>
        <TouchableOpacity
          onPress={handleScanLibrary}
          disabled={scanStatus.isScanning}
        >
          {scanStatus.isScanning
            ? <ActivityIndicator size="small" color={colors.primary[500]} />
            : <Ionicons name="scan-outline" size={24} color={colors.text.primary} />
          }
        </TouchableOpacity>
      </View>

      {/* SCAN PROGRESS LABEL */}
      {scanLabel && (
        <View style={[styles.scanBanner, { backgroundColor: colors.primary[900] }]}>
          <ActivityIndicator size="small" color={colors.primary[400]} />
          <Text style={[styles.scanLabel, { color: colors.primary[300] }]}>
            {scanLabel}
          </Text>
        </View>
      )}

      <LibraryTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isScanning={scanStatus.isScanning}
        scanProgress={scanStatus.scanned}
        scanTotal={scanStatus.total}
        onRefresh={handleScanLibrary}
        trackCount={songs.length}
>>>>>>> Stashed changes
      />
    ),
    [currentSong?.id, isFavorite, colors, handlePlaySong, handleToggleFavorite],
  );

<<<<<<< Updated upstream
  const keyExtractor = useCallback((item: Song) => item.id, []);

  // ─── Sub-renders ───────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        { paddingHorizontal: spacing.md, backgroundColor: colors.background.primary },
      ]}
    >
      <TouchableOpacity
        onPress={() => navigation.getParent()?.dispatch(DrawerActions.openDrawer())}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="menu-outline" size={28} color={colors.text.primary} />
      </TouchableOpacity>

      <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
        Library
      </Text>

      <View style={styles.headerActions}>
        {activeTab === "song" && (
          <TouchableOpacity
            onPress={() => setShowSearch((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: spacing.sm }}
          >
            <Ionicons
              name={showSearch ? "search" : "search-outline"}
              size={22}
              color={showSearch ? colors.primary[500] : colors.text.primary}
            />
          </TouchableOpacity>
=======
      {/* CONTENT */}
      <View style={{ flex: 1 }}>
        {activeTab === "song" ? (
          loading && songs.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <FlashList
              data={songs}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              estimatedItemSize={72}
              ListEmptyComponent={
                <EmptyLibrary colors={colors} onScan={handleScanLibrary} />
              }
            />
          )
        ) : activeTab === "album" ? (
          <AlbumGrid albums={albums} />
        ) : activeTab === "folder" ? (
          <FolderList folders={folders} tracks={tracks} />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: colors.text.tertiary }}>Coming Soon</Text>
          </View>
>>>>>>> Stashed changes
        )}
        <TouchableOpacity
          onPress={activeTab === "song" ? () => setShowFilterModal(true) : handleScanLibrary}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={activeTab === "song" ? "options-outline" : "scan-outline"}
            size={24}
            color={colors.text.primary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTabBar = () => (
    <View style={{ backgroundColor: colors.background.secondary }}>
      {/* Scan progress */}
      {scanStatus.isScanning && (
        <View
          style={[
            styles.scanBar,
            { backgroundColor: colors.background.tertiary, paddingHorizontal: spacing.md },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary[500]} />
          <Text style={[styles.scanText, { color: colors.text.secondary }]}>
            Scanning... {scanStatus.progress}%
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.background.elevated }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary[500],
                  width: `${scanStatus.progress}%` as any,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => handleTabChange(tab.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive
                    ? colors.primary[500]
                    : colors.background.tertiary,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <Ionicons
                name={tab.icon as any}
                size={13}
                color={isActive ? colors.background.primary : colors.text.secondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive
                      ? colors.background.primary
                      : colors.text.secondary,
                    marginLeft: 4,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Track count */}
      <Text
        style={[
          styles.countText,
          {
            color: colors.text.tertiary,
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.xs,
          },
        ]}
      >
        {activeTab === "song"
          ? `${songs.length} track`
          : activeTab === "album"
          ? `${albums.length} album`
          : activeTab === "artist"
          ? `${artists.length} artis`
          : activeTab === "genre"
          ? `${genres.length} genre`
          : activeTab === "folder"
          ? `${folders.length} folder`
          : activeTab === "filetype"
          ? `${fileTypes.length} format`
          : ""}
      </Text>
    </View>
  );

  const renderActiveFilters = () => {
    if (activeTab !== "song") return null;
    if (filterBy === "all" && sortBy === "title-asc") return null;
    return (
      <View style={[styles.filterBadgeRow, { paddingHorizontal: spacing.md }]}>
        <View style={[styles.filterBadge, { borderColor: colors.primary[500] }]}>
          <Text style={[styles.filterBadgeText, { color: colors.primary[500] }]}>
            {sortBy.split("-")[0].toUpperCase()} • {filterBy.toUpperCase()}
          </Text>
          <TouchableOpacity onPress={() => { setFilterBy("all"); setSortBy("title-asc"); }}>
            <Ionicons name="close-circle" size={14} color={colors.primary[500]} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchBar = () => {
    if (activeTab !== "song" || !showSearch) return null;
    return (
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.background.secondary,
            marginHorizontal: spacing.md,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <Ionicons name="search" size={20} color={colors.text.tertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text.primary }]}
          placeholder="Cari lagu, artis, atau album..."
          placeholderTextColor={colors.text.tertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "song":
        if (loading && songs.length === 0) {
          return (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
              <Text style={{ color: colors.text.secondary, marginTop: 10 }}>
                Loading library...
              </Text>
            </View>
          );
        }
        return (
  <FlashList
    ref={listRef}
    data={songs}
    renderItem={renderItem}
    keyExtractor={keyExtractor}
    // @ts-ignore: FlashList types can be finicky with estimatedItemSize
    estimatedItemSize={72}
    contentContainerStyle={styles.listContent}
    ListEmptyComponent={
      <EmptyLibrary colors={colors} onScan={handleScanLibrary} />
    }
    removeClippedSubviews
    initialNumToRender={20}
    maxToRenderPerBatch={20}
    windowSize={10}
  />
);
      case "album":
        return <AlbumGrid albums={albums} />;
      case "artist":
        return <ArtistList artists={artists} />;
      case "genre":
        return <GenreList genres={genres} />;
      case "folder":
        return <FolderList folders={folders} tracks={tracks} />;
      case "playlist":
        return <PlaylistList />;
      case "filetype":
        return <FileTypeList fileTypes={fileTypes} tracks={tracks} />;
    }
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {renderHeader()}
      {renderTabBar()}
      {renderActiveFilters()}
      {renderSearchBar()}
      <View style={{ flex: 1 }}>{renderContent()}</View>

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        sortBy={sortBy}
        filterBy={filterBy}
        onSortChange={setSortBy}
        onFilterChange={setFilterBy}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1 },
  center:     { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 15,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
<<<<<<< Updated upstream
  headerActions: { flexDirection: "row", alignItems: "center" },
  scanBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  scanText: { fontSize: 11 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  tab: { flexDirection: "row", alignItems: "center", borderRadius: 20 },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  countText: { fontSize: 11 },
  filterBadgeRow: {
    flexDirection: "row",
    marginBottom: 10,
    marginTop: 4,
  },
  filterBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,212,170,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
  },
  filterBadgeText: { fontSize: 10, fontWeight: "800" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    height: 45,
    borderRadius: 10,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, height: 45 },
  listContent: { paddingBottom: 120 },
}); 

 
=======
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  scanLabel: { fontSize: 12, fontWeight: "600" },
}); 
>>>>>>> Stashed changes
