import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from "react-native";
import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";

// Internal Imports
import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOptimizedLibrary } from "@/features/library/hooks/useOptimizedLibrary";
import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
import { LibraryScanner } from '@/features/library/api/scanner';
import { runManualScan } from "@/features/library/services/BackgroundScanTask";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import {
  useLibraryStore,
  selectAlbums,
  selectArtists,
  selectFolders,
} from "@/features/library/store/libraryStore";

import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { FolderList } from "@/features/library/components/FolderList";
import { Song } from "@/shared/types/audio";

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { colors, spacing } = theme;

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
  useEffect(() => {
    const init = async () => {
      console.log("🔍 [Library] Initializing database...");
      try {
        const existingSongs = await LibraryScanner.getLibrarySongs() ?? [];
        console.log(`📊 [Library] Found ${existingSongs.length} songs in DB`);
        if (existingSongs.length > 0) setTracks(existingSongs);
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

  // ── 4. Scan Handler ──────────────────────────────────────────
  const handleScanLibrary = useCallback(async () => {
    if (scanStatus.isScanning) return;
    console.log("📂 [Scan] Manual scan triggered...");

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
      />

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
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  center:     { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  scanLabel: { fontSize: 12, fontWeight: "600" },
});  
