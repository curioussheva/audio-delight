import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, TextInput, Keyboard,
} from "react-native";
import { FlashList, ListRenderItem } from "@shopify/flash-list";

// ← Import Lucide Icons
import {
  Menu,
  ArrowLeft,
  X,
  Search,
  Scan,
} from "lucide-react-native";

import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { AppState, AppStateStatus } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOptimizedLibrary } from "@/features/library/hooks/useOptimizedLibrary";
import { useSafePadding } from '@/shared/hooks/useSafePadding';

import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
import { LibraryScanner } from '@/features/library/api/scanner';
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import {
  useLibraryStore,
  selectAlbums,
  selectArtists,
  selectFolders,
  selectGenres,
  selectFileTypes,
} from "@/features/library/store/libraryStore";
import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { GenreList } from "@/features/library/components/GenreList";
import { FolderList } from "@/features/library/components/FolderList";
import { FileTypeList } from "@/features/library/components/FileTypeList";
import { Song } from "@/shared/types/audio";
import type { MediaTrack } from "@/features/library/store/libraryStore";

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const safePadding = useSafePadding();

  const { playSong, currentSong } = usePlayerStore();
  const {
    activeTab, setActiveTab,
    tracks, setTracks,
    scanStatus, setScanning,
  } = useLibraryStore();

  // ── Search state ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const { songs, loading, reload, isFavorite, toggleFavorite } = useOptimizedLibrary({
    searchQuery,
    filterBy: "all",
    sortBy: "title-asc",
  });

  // ── Helper: refresh semua data dari DB ───────────────────────
  const refreshLibrary = useCallback(async () => {
    try {
      const freshSongs = await LibraryScanner.getLibrarySongs() ?? [];
      setTracks(freshSongs as any);
      await reload();
    } catch (err) {
      console.error("❌ [Library] Refresh Error:", err);
    }
  }, [setTracks, reload]);

  // ── 1. Initial Load ──────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      console.log("🔍 [Library] Initializing database...");
      try {
        const existingSongs = await LibraryScanner.getLibrarySongs() ?? [];
        console.log(`📊 [Library] Found ${existingSongs.length} songs in DB`);
        if (existingSongs.length > 0) setTracks(existingSongs as any);
      } catch (err) {
        console.error("❌ [Library] Init Error:", err);
      }
    };
    init();
  }, [setTracks]);

  // ── 2. Auto-detect file baru via MediaLibrary listener ───────
  useEffect(() => {
    let subscription: MediaLibrary.Subscription | null = null;

    const setupListener = async () => {
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) return;

      subscription = MediaLibrary.addListener(async (event) => {
        const hasInsert = event.hasIncrementalChanges && (event.insertedAssets?.length ?? 0) > 0;
        const hasDelete = event.hasIncrementalChanges && (event.deletedAssets?.length ?? 0) > 0;

        if (hasInsert || hasDelete) {
          console.log(`🔔 [Library] Changes detected — insert: ${event.insertedAssets?.length ?? 0}, delete: ${event.deletedAssets?.length ?? 0}`);
          await BackgroundScanTask.runManual();
          await refreshLibrary();
        }
      });
    };

    setupListener();
    return () => { subscription?.remove(); };
  }, [refreshLibrary]);

  useEffect(() => {
    let lastState = AppState.currentState;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (lastState.match(/inactive|background/) && nextState === 'active') {
        console.log('📱 [Library] App foregrounded — checking for changes...');
        await refreshLibrary();
      }
      lastState = nextState;
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [refreshLibrary]);

  // ── 3. Scan Handler ──────────────────────────────────────────
  const handleScanLibrary = useCallback(async () => {
    if (scanStatus.isScanning) return;
    console.log("📂 [Scan] Manual scan triggered...");

    try {
      await BackgroundScanTask.runManual((current, total) => {
        setScanning(true, current, total);
      });

      await refreshLibrary();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("❌ [Scan] Error:", err);
      setScanning(false, 0, 0);
    }
  }, [scanStatus.isScanning, setScanning, refreshLibrary]);

  // ── 4. Search handlers ───────────────────────────────────────
  const handleToggleSearch = useCallback(() => {
    if (showSearch) {
      setSearchQuery("");
      setShowSearch(false);
      Keyboard.dismiss();
    } else {
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearch]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  // ── 5. Derived Data ──────────────────────────────────────────
  const albums = useMemo(() => selectAlbums(tracks ?? []), [tracks]);
  const artists = useMemo(() => selectArtists(tracks ?? []), [tracks]);
  const folders = useMemo(() => selectFolders(tracks ?? []), [tracks]);
  const genres = useMemo(() => selectGenres(tracks ?? []), [tracks]);
  const fileTypes = useMemo(() => selectFileTypes(tracks ?? []), [tracks]);

  // ── 6. Progress label ────────────────────────────────────────
  const scanLabel = useMemo(() => {
    if (!scanStatus.isScanning) return null;
    if (scanStatus.total > 0) return `Memindai ${scanStatus.scanned} / ${scanStatus.total}`;
    return "Mengumpulkan file...";
  }, [scanStatus.isScanning, scanStatus.scanned, scanStatus.total]);

  // ── 7. Render item ───────────────────────────────────────────
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

  // ── 8. Filtered songs untuk search ───────────────────────────
  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const q = searchQuery.toLowerCase();
    return songs.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.artist?.toLowerCase().includes(q) ||
      s.album?.toLowerCase().includes(q) ||
      s.filename?.toLowerCase().includes(q)
    );
  }, [songs, searchQuery]);

  // ── 9. AlbumGrid handlers ────────────────────────────────────
  const handleAlbumSongPress = useCallback(
    (track: MediaTrack, queue: MediaTrack[]) => {
      playSong(track as unknown as Song, queue as unknown as Song[]);
    },
    [playSong]
  );

  return (
    <View style={[
      s.container,
      {
        flex: 1,
        backgroundColor: colors.background.primary,
        paddingTop: safePadding.paddingTop,
        paddingBottom: safePadding.paddingBottom,
        paddingLeft: safePadding.paddingLeft,
        paddingRight: safePadding.paddingRight,
      }
    ]}>

      {/* HEADER */}
      <View style={[s.header, { paddingHorizontal: spacing.md }]}>
        {showSearch ? (
          <>
            <TouchableOpacity onPress={handleToggleSearch} hitSlop={8}>
              <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2.5} />
            </TouchableOpacity>

            <TextInput
              ref={searchInputRef}
              style={[s.searchInput, {
                color: colors.text.primary,
                backgroundColor: colors.background.tertiary,
                borderColor: colors.border.light,
              }]}
              placeholder="Cari lagu, artist, album..."
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              returnKeyType="search"
            />

            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <X size={20} color={colors.text.tertiary} strokeWidth={3} />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
              <Menu size={28} color={colors.text.primary} strokeWidth={2.5} />
            </TouchableOpacity>

            <Text style={[s.headerTitle, { color: colors.text.primary }]}>Library</Text>

            <View style={s.headerActions}>
              <TouchableOpacity onPress={handleToggleSearch} style={s.headerBtn}>
                <Search size={22} color={colors.text.primary} strokeWidth={2.5} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleScanLibrary}
                disabled={scanStatus.isScanning}
                style={s.headerBtn}
              >
                {scanStatus.isScanning ? (
                  <ActivityIndicator size="small" color={colors.primary[500]} />
                ) : (
                  <Scan size={22} color={colors.text.primary} strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* SCAN PROGRESS BANNER */}
      {scanLabel && (
        <View style={[s.scanBanner, { backgroundColor: colors.primary[900] }]}>
          <ActivityIndicator size="small" color={colors.primary[400]} />
          <Text style={[s.scanLabel, { color: colors.primary[300] }]}>{scanLabel}</Text>
        </View>
      )}

      {/* SEARCH RESULT COUNT */}
      {showSearch && searchQuery.length > 0 && (
        <Text style={[s.resultCount, { color: colors.text.tertiary }]}>
          {filteredSongs.length} hasil untuk "{searchQuery}"
        </Text>
      )}

      <LibraryTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isScanning={scanStatus.isScanning}
        scanProgress={scanStatus.scanned}
        scanTotal={scanStatus.total}
        onRefresh={handleScanLibrary}
        trackCount={showSearch ? filteredSongs.length : songs.length}
      />

      {/* CONTENT */}
      <View style={{ flex: 1 }}>
        {activeTab === "song" ? (
          loading && songs.length === 0 ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <FlashList
              data={showSearch && searchQuery ? filteredSongs : songs}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              estimatedItemSize={72}
              contentContainerStyle={{ paddingBottom: 100 }}
              ListEmptyComponent={
                showSearch
                  ? <View style={s.center}>
                      <Search size={48} color={colors.text.tertiary} strokeWidth={1.8} />
                      <Text style={[s.emptyText, { color: colors.text.tertiary }]}>
                        Tidak ada hasil untuk "{searchQuery}"
                      </Text>
                    </View>
                  : <EmptyLibrary colors={colors} onScan={handleScanLibrary} />
              }
            />
          )
        ) : activeTab === "album" ? (
          <AlbumGrid
            albums={albums}
            tracks={tracks ?? []}
            currentTrackId={currentSong?.id}
            onSongPress={handleAlbumSongPress}
            onToggleFavorite={toggleFavorite}
          />
        ) : activeTab === "artist" ? (
          <ArtistList
            artists={artists}
            tracks={tracks ?? []}
            currentTrackId={currentSong?.id}
            onSongPress={handleAlbumSongPress}
            onToggleFavorite={toggleFavorite}
          />
        ) : activeTab === "folder" ? (
          <FolderList
            folders={folders}
            tracks={tracks ?? []}
            currentTrackId={currentSong?.id}
            onSongPress={handleAlbumSongPress}
            onToggleFavorite={toggleFavorite}
          />
        ) : activeTab === "genre" ? (
          <GenreList
            genres={genres}
            tracks={tracks ?? []}
            currentTrackId={currentSong?.id}
            onSongPress={handleAlbumSongPress}
            onToggleFavorite={toggleFavorite}
          />
        ) : activeTab === "filetype" ? (
          <FileTypeList
            fileTypes={fileTypes}
            tracks={tracks ?? []}
            currentTrackId={currentSong?.id}
            onSongPress={handleAlbumSongPress}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          <View style={s.center}>
            <Text style={{ color: colors.text.tertiary }}>Coming Soon</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    paddingBottom: 12,
    gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", flex: 1, textAlign: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerBtn: { padding: 4 },
  searchInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  scanLabel: { fontSize: 12, fontWeight: "600" },
  resultCount: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 4 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: "center" },
}); 