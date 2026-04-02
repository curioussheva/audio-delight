import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  Keyboard,
} from "react-native";
import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { AppState } from "react-native";

// ── Icons ────────────────────────────────────────────────────────────────────
import {
  Menu,
  ArrowLeft,
  X,
  Search,
  ScanText,
  SearchX,
} from "lucide-react-native";

// ── Context & Stores ─────────────────────────────────────────────────────────
import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOptimizedLibrary } from "@/features/library/hooks/useOptimizedLibrary";
import {
  useLibraryStore,
  selectAlbums,
  selectArtists,
  selectFolders,
  selectGenres,
  selectFileTypes,
} from "@/features/library/store/libraryStore";

// ── Components & Services ────────────────────────────────────────────────────
import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
import { LibraryScanner } from "@/features/library/api/scanner";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { GenreList } from "@/features/library/components/GenreList";
import { FolderList } from "@/features/library/components/FolderList";
import { FileTypeList } from "@/features/library/components/FileTypeList";
import { PlaylistList } from "@/features/library/components/PlaylistList";

// ── Types ────────────────────────────────────────────────────────────────────
import { Song } from "@/shared/types/audio";
import type { MediaTrack } from "@/features/library/store/libraryStore";

export default function LibraryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;

  // ── Player & Library Store ─────────────────────────────────────────────────
  const { playSong, currentSong } = usePlayerStore();
  const {
    activeTab,
    setActiveTab,
    tracks,
    setTracks,
    scanStatus,
    setScanning,
  } = useLibraryStore();

  // ── Layout Constants ───────────────────────────────────────────────────────
  // Menghitung kompensasi agar list tidak tertutup Floating Player & TabBar
  const BOTTOM_COMPENSATION = Platform.OS === "ios" ? insets.bottom + 15 : 25;

  // ── Search State ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const { songs, loading, reload, isFavorite, toggleFavorite } =
    useOptimizedLibrary({
      searchQuery: "",
      filterBy: "all",
      sortBy: "title-asc",
    });

  // ── Smart Multi-Term Filter ────────────────────────────────────────────────
  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const terms = searchQuery.toLowerCase().split(" ").filter(Boolean);
    return songs.filter((s) =>
      terms.every(
        (term) =>
          s.title?.toLowerCase().includes(term) ||
          s.artist?.toLowerCase().includes(term) ||
          s.album?.toLowerCase().includes(term) ||
          s.codec?.toLowerCase().includes(term) ||
          s.filename?.toLowerCase().includes(term),
      ),
    );
  }, [songs, searchQuery]);

  const refreshLibrary = useCallback(async () => {
    try {
      const freshSongs = (await LibraryScanner.getLibrarySongs()) ?? [];
      setTracks(freshSongs as any);
      await reload();
    } catch (err) {
      console.error(err);
    }
  }, [setTracks, reload]);
  // Tambah setelah deklarasi hooks, sebelum handlers
  useEffect(() => {
    const init = async () => {
      const existingSongs = (await LibraryScanner.getLibrarySongs()) ?? [];
      if (existingSongs.length > 0) setTracks(existingSongs as any);
    };
    init();
  }, [setTracks]);

  // AppState listener untuk refresh saat foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active") await refreshLibrary();
    });
    return () => sub.remove();
  }, [refreshLibrary]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleScanLibrary = useCallback(async () => {
    if (scanStatus.isScanning) return;
    try {
      await BackgroundScanTask.runManual((current, total) => {
        setScanning(true, current, total);
      });
      await refreshLibrary();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setScanning(false, 0, 0);
    }
  }, [scanStatus.isScanning, setScanning, refreshLibrary]);

  const handleToggleSearch = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (showSearch) {
      setSearchQuery("");
      setShowSearch(false);
      Keyboard.dismiss();
    } else {
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearch]);

  const handleSongPress = useCallback(
    (song: Song, list: Song[]) => {
      playSong(song, list);
    },
    [playSong],
  );

  // ── Derived Data ───────────────────────────────────────────────────────────
  const albums = useMemo(() => selectAlbums(tracks ?? []), [tracks]);
  const artists = useMemo(() => selectArtists(tracks ?? []), [tracks]);
  const folders = useMemo(() => selectFolders(tracks ?? []), [tracks]);
  const genres = useMemo(() => selectGenres(tracks ?? []), [tracks]);
  const fileTypes = useMemo(() => selectFileTypes(tracks ?? []), [tracks]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderSongItem: ListRenderItem<Song> = useCallback(
    ({ item }) => (
      <SongListItem
        item={item}
        isNowPlaying={currentSong?.id === item.id}
        isFavorite={isFavorite(item.id)}
        colors={colors}
        onPress={(s) => handleSongPress(s, showSearch ? filteredSongs : songs)}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [
      currentSong?.id,
      isFavorite,
      colors,
      showSearch,
      filteredSongs,
      songs,
      toggleFavorite,
      handleSongPress,
    ],
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background.primary }]}>
      {/* ── Header ── */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 8, paddingHorizontal: 20 },
        ]}
      >
        {showSearch ? (
          <View style={s.searchRow}>
            <TouchableOpacity onPress={handleToggleSearch} hitSlop={15}>
              <ArrowLeft
                size={24}
                color={colors.text.primary}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
            <View
              style={[
                s.searchBar,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.light,
                },
              ]}
            >
              <Search size={18} color={colors.primary[500]} />
              <TextInput
                ref={searchInputRef}
                style={[s.searchInput, { color: colors.text.primary }]}
                placeholder="Search High-Res Audio..."
                placeholderTextColor={colors.text.disabled}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  hitSlop={10}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={3} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              style={s.headerSide}
            >
              <Menu size={26} color={colors.text.primary} strokeWidth={2.2} />
            </TouchableOpacity>

            <Text style={[s.headerTitle, { color: colors.text.primary }]}>
              LIBRARY
            </Text>

            <View style={[s.headerSide, s.headerTrailing]}>
              <TouchableOpacity onPress={handleToggleSearch} style={s.iconBtn}>
                <Search
                  size={22}
                  color={colors.text.primary}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleScanLibrary} style={s.iconBtn}>
                {scanStatus.isScanning ? (
                  <ActivityIndicator size="small" color={colors.primary[500]} />
                ) : (
                  <ScanText
                    size={22}
                    color={colors.text.primary}
                    strokeWidth={2.2}
                  />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Search Info ── */}
      {showSearch && searchQuery.length > 0 && (
        <View style={s.searchMeta}>
          <Text style={[s.resultText, { color: colors.primary[500] }]}>
            {filteredSongs.length} TRACKS FOUND
          </Text>
        </View>
      )}

      {/* ── Tab Bar ── */}
      <LibraryTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isScanning={scanStatus.isScanning}
        scanProgress={scanStatus.scanned}
        scanTotal={scanStatus.total}
        onRefresh={handleScanLibrary}
        trackCount={showSearch ? filteredSongs.length : songs.length}
      />

      {/* ── Content Area ── */}
      <View style={s.content}>
        {activeTab === "song" ? (
          loading && songs.length === 0 ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
          ) : (
            <FlashList
              data={showSearch ? filteredSongs : songs}
              renderItem={renderSongItem}
              keyExtractor={(item) => item.id}
              estimatedListSize={{ height: 72, width: "100%" }}
              contentContainerStyle={{
                paddingBottom: BOTTOM_COMPENSATION,
                paddingHorizontal: 12,
              }}
              ListEmptyComponent={
                showSearch ? (
                  <View style={s.emptySearch}>
                    <SearchX
                      size={56}
                      color={colors.text.disabled}
                      strokeWidth={1.5}
                    />
                    <Text
                      style={[
                        s.emptySearchTitle,
                        { color: colors.text.primary },
                      ]}
                    >
                      No matches found
                    </Text>
                    <Text
                      style={[
                        s.emptySearchSub,
                        { color: colors.text.tertiary },
                      ]}
                    >
                      Try adjusting your keywords, e.g. "FLAC" or "24bit".
                    </Text>
                  </View>
                ) : (
                  <EmptyLibrary colors={colors} onScan={handleScanLibrary} />
                )
              }
            />
          )
        ) : (
          <View style={{ flex: 1, paddingBottom: BOTTOM_COMPENSATION }}>
            {activeTab === "album" && (
              <AlbumGrid
                albums={albums}
                tracks={tracks ?? []}
                currentTrackId={currentSong?.id}
                onSongPress={handleSongPress as any}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {activeTab === "artist" && (
              <ArtistList
                artists={artists}
                tracks={tracks ?? []}
                currentTrackId={currentSong?.id}
                onSongPress={handleSongPress as any}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {activeTab === "folder" && (
              <FolderList
                folders={folders}
                tracks={tracks ?? []}
                currentTrackId={currentSong?.id}
                onSongPress={handleSongPress as any}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {activeTab === "genre" && (
              <GenreList
                genres={genres}
                tracks={tracks ?? []}
                currentTrackId={currentSong?.id}
                onSongPress={handleSongPress as any}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {activeTab === "filetype" && (
              <FileTypeList
                fileTypes={fileTypes}
                tracks={tracks ?? []}
                currentTrackId={currentSong?.id}
                onSongPress={handleSongPress as any}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {activeTab === "playlist" && (
              <PlaylistList
                playlists={[]}
                favoriteCount={songs.filter((s) => isFavorite(s.id)).length}
                onPlaylistPress={() => {}}
                onCreateNew={() => {}}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header Symmetris
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  headerSide: {
    width: 44, // Fixed width agar title benar-benar di tengah
    justifyContent: "center",
  },
  headerTrailing: {
    flexDirection: "row",
    width: 80, // Penyeimbang lebar ikon di kanan
    justifyContent: "flex-end",
    gap: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 4,
    textAlign: "center",
    flex: 1,
    textTransform: "uppercase",
  },

  // Search Bar
  searchRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: 16 },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 8,
  },
  iconBtn: { padding: 4 },

  // Search Meta
  searchMeta: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    marginTop: -4,
  },
  resultText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  // Empty State
  emptySearch: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    marginTop: 60,
  },
  emptySearchTitle: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  emptySearchSub: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});
