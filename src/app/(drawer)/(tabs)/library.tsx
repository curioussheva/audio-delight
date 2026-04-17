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
  AppState,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

// Icons
import {
  Menu,
  ArrowLeft,
  X,
  Search,
  ScanText,
  SearchX,
  Filter,
  Sparkles,
} from "lucide-react-native";

// Context & Stores
import { useTheme } from "@/shared/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOptimizedLibrary } from "@/features/library/hooks/useOptimizedLibrary";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import {
  selectAlbums,
  selectArtists,
  selectFolders,
  selectGenres,
  selectFileTypes,
  selectLibraryStats,
} from "@/features/library/store/selectors";

// Scan System
import { useScanManager } from "@/features/library/hooks/useScanManager";
//import { ScanStatusBar } from "@/features/library/components/ScanStatusBar";
import { EnrichMetadataModal } from "@/features/library/components/EnrichMetadataModal";

// Components
import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
import { LibraryScanner } from "@/features/library/api/scanner";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { GenreList } from "@/features/library/components/GenreList";
import { FolderList } from "@/features/library/components/FolderList";
import { FileTypeList } from "@/features/library/components/FileTypeList";
import { PlaylistList } from "@/features/library/components/PlaylistList";

// Debounce helper
const debounce = (func: Function, delay: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

export default function LibraryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;

  // ── Store States ───────────────────────────────────────────────────────────
  const { activeTab, setActiveTab, tracks, setTracks } = useLibraryStore();

  const {
    isAutoScanning,
    isManualScanning,
    isEnriching,
    manualScanProgress,
    enrichmentProgress,
    unenrichedCount,
    hasPendingEnrichment,
    manualRescan,
    cancelScan,
  } = useScanManager();

  // ── UI States ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "lossless" | "hi-res">(
    "all",
  );

  const searchInputRef = useRef<TextInput>(null);
  const BOTTOM_COMPENSATION = Platform.OS === "ios" ? insets.bottom + 20 : 30;

  // Styles with colors
  const s = useMemo(() => createStyles(colors), [colors]);

  // ── Library Hooks ──────────────────────────────────────────────────────────
  const { loading, reload, isFavorite, toggleFavorite } = useOptimizedLibrary({
    searchQuery: "",
    filterBy:
      filterType === "all"
        ? "all"
        : filterType === "lossless"
          ? "lossless"
          : "hi-res",
  });

  // ── Library Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => selectLibraryStats(tracks), [tracks]);

  // ── CORE LOGIC: Reactive Filtering ─────────────────────────────────────────
  const filteredSource = useMemo(() => {
    let source = tracks ?? [];

    // Apply search filter
    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().split(" ").filter(Boolean);
      source = source.filter((t) =>
        terms.every(
          (term) =>
            t.title?.toLowerCase().includes(term) ||
            t.artist?.toLowerCase().includes(term) ||
            t.album?.toLowerCase().includes(term) ||
            t.folder?.toLowerCase().includes(term) ||
            t.codec?.toLowerCase().includes(term) ||
            t.genre?.toLowerCase().includes(term),
        ),
      );
    }

    // Apply quality filter
    if (filterType === "lossless") {
      const losslessCodecs = ["FLAC", "ALAC", "WAV", "AIFF", "APE", "DSD"];
      source = source.filter((t) => losslessCodecs.includes(t.codec || ""));
    } else if (filterType === "hi-res") {
      source = source.filter((t) => t.isHiRes === true);
    }

    return source;
  }, [tracks, searchQuery, filterType]);

  // Tab data
  const albums = useMemo(() => selectAlbums(filteredSource), [filteredSource]);
  const artists = useMemo(() => selectArtists(filteredSource), [filteredSource]);
  const folders = useMemo(
    () => selectFolders(filteredSource),
    [filteredSource],
  );
  const genres = useMemo(() => selectGenres(filteredSource), [filteredSource]);
  const fileTypes = useMemo(
    () => selectFileTypes(filteredSource),
    [filteredSource],
  );

  // ── CORE LOGIC: Reactive Filtering + URI Safety ───────────────────────────
  const validSongs = useMemo(() => {
    return filteredSource.filter((song) => {
      if (!song.uri) {
        // Throttle warning supaya tidak banjir log
        if (Math.random() < 0.05) {
          console.warn(
            `[Library] Song without URI: "${song.title || "Unknown"}" (ID: ${song.id})`,
          );
        }
        return true; // TETAP TAMPILKAN lagu (jangan sembunyikan)
      }
      return true;
    });
  }, [filteredSource]);

  // ── Lifecycle & Sync ───────────────────────────────────────────────────────
  const refreshLibrary = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) setRefreshing(true);

      try {
        const freshSongs = (await LibraryScanner.getLibrarySongs()) ?? [];
        setTracks(freshSongs as any);
        await reload();
      } catch (err) {
        console.error("Refresh Error:", err);
      } finally {
        if (showRefreshIndicator) setRefreshing(false);
      }
    },
    [setTracks, reload],
  );

  const debouncedRefresh = useCallback(
    debounce(() => refreshLibrary(false), 500),
    [refreshLibrary],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        debouncedRefresh();
      }
    });
    return () => subscription.remove();
  }, [debouncedRefresh]);

  // Close search when tab changes
  useEffect(() => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery("");
    }
  }, [activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleManualRescan = async () => {
    if (isManualScanning || isAutoScanning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await manualRescan((progress) => {
        // Tidak perlu setScanning lagi karena sudah di dalam useScanManager
      });

      await refreshLibrary(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Manual scan failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleEnhanceMetadata = () => {
    if (unenrichedCount === 0) return;
    // setShowEnrichModal(true);  // Uncomment when you add the state
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleSearch = () => {
    if (showSearch) {
      setSearchQuery("");
      setShowSearch(false);
      Keyboard.dismiss();
    } else {
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const clearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  const onRefresh = useCallback(() => {
    refreshLibrary(true);
  }, [refreshLibrary]);

  const isScanning = isManualScanning || isAutoScanning;

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const renderHeader = () => {
    const { totalTracks = 0, artistsCount = 0 } = stats || {};

    if (showSearch) {
      return (
        <View style={s.searchRow}>
          <TouchableOpacity onPress={toggleSearch} hitSlop={8}>
            <ArrowLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View
            style={[
              s.searchBar,
              { backgroundColor: colors.background.secondary },
            ]}
          >
            <Search size={18} color={colors.primary[500]} />
            <TextInput
              ref={searchInputRef}
              style={[s.searchInput, { color: colors.text.primary }]}
              placeholder="Search Artist, Album, Format..."
              placeholderTextColor={colors.text.disabled}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searchQuery !== "" && (
              <TouchableOpacity onPress={clearSearch} hitSlop={8}>
                <X size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return (
      <>
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
        >
          <Menu size={26} color={colors.text.primary} strokeWidth={2} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: colors.text.primary }]}>
            LIBRARY
          </Text>
          <Text style={[s.headerStats, { color: colors.text.tertiary }]}>
            {totalTracks} tracks • {artistsCount} artists
            {unenrichedCount > 0 && ` • ${unenrichedCount} pending`}
          </Text>
        </View>

        <View style={s.headerActions}>
          <TouchableOpacity onPress={toggleSearch} hitSlop={8}>
            <Search size={22} color={colors.text.primary} strokeWidth={2} />
          </TouchableOpacity>

          {!isScanning && hasPendingEnrichment && unenrichedCount > 0 && (
            <TouchableOpacity onPress={handleEnhanceMetadata} hitSlop={8}>
              <View style={s.enhanceBadge}>
                <Sparkles size={18} color={colors.status.success} />
                <Text style={s.enhanceBadgeText}>{unenrichedCount}</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() =>
              setFilterType((f) =>
                f === "all" ? "lossless" : f === "lossless" ? "hi-res" : "all",
              )
            }
            hitSlop={8}
            disabled={isScanning}
          >
            <Filter
              size={20}
              color={
                filterType !== "all"
                  ? colors.primary[500]
                  : colors.text.secondary
              }
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isScanning ? cancelScan : handleManualRescan}
            hitSlop={8}
            style={[s.scanButton, isScanning && s.scanButtonActive]}
          >
            {isScanning ? (
              <View style={s.scanningIndicator}>
                <ActivityIndicator size="small" color={colors.primary[500]} />
                <Text style={s.scanningText}>
                  {isAutoScanning ? "AUTO" : "SCAN"}
                </Text>
              </View>
            ) : (
              <ScanText size={22} color={colors.text.primary} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const renderContent = () => {
    if (loading && tracks.length === 0) {
      return (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={[s.loadingText, { color: colors.text.secondary }]}>
            Loading library...
          </Text>
        </View>
      );
    }

    if (filteredSource.length === 0 && searchQuery.length > 0) {
      return (
        <View style={s.emptySearch}>
          <SearchX size={60} color={colors.text.disabled} strokeWidth={1.5} />
          <Text style={[s.emptyTitle, { color: colors.text.primary }]}>
            No results found
          </Text>
          <Text style={[s.emptySub, { color: colors.text.tertiary }]}>
            Try different keywords or check your spelling
          </Text>
        </View>
      );
    }

    if (tracks.length === 0) {
      return <EmptyLibrary colors={colors} onScan={handleManualRescan} />;
    }

    switch (activeTab) {
      case "song":
        return (
          <FlashList
            data={validSongs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingBottom: BOTTOM_COMPENSATION,
              paddingHorizontal: 12,
            }}
            renderItem={({ item }) => (
              <SongListItem
                item={item as any}
                isNowPlaying={currentSong?.id === item.id && isPlaying}
                isFavorite={isFavorite(item.id)}
                colors={colors}
                // Gunakan handleSongPress agar konsisten
                onPress={() => handleSongPress(item, validSongs)}
                onToggleFavorite={toggleFavorite}
              />
            )}
            // ... (refresh control tetap sama)
          />
        );
      case "album":
        return (
          <AlbumGrid
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "artist":
  return (
    <ArtistList
      artists={artists}           // <--- ADD THIS (Fixes TS2741)
      tracks={filteredSource}
      currentTrackId={currentSong?.id}
      onSongPress={handleSongPress}
      onToggleFavorite={toggleFavorite}
      enableOnlineArtistImage={true}
    />
  );
      case "genre":
        return (
          <GenreList
            genres={genres}
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "folder":
        return (
          <FolderList
            folders={folders}
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "filetype":
        return (
          <FileTypeList
            fileTypes={fileTypes}
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "playlist":
        return (
          <PlaylistList
            playlists={[]}
            favoriteCount={tracks.filter((t) => isFavorite(t.id)).length}
            onPlaylistPress={() => {}}
            onCreateNew={() => {}}
          />
        );
      default:
        return null;
    }
  };

  const { playSong, currentSong, isPlaying } = usePlayerStore();

  // ── BRIDGE: Convert MediaTrack to Song for Player ──────────────────────────
  const handleSongPress = useCallback((track: any, queue: any[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Kita lakukan casting ke 'any' lalu ke 'Song' di dalam store
    // Ini menyelesaikan error TS2322 pada AlbumGrid, GenreList, dll.
    playSong(track, queue);
  }, [playSong]);

  return (
    <View style={[s.container, { backgroundColor: colors.background.primary }]}>
      {/*}    <ScanStatusBar /> */}

      {/* Header */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 8, paddingHorizontal: 20 },
        ]}
      >
        {renderHeader()}
      </View>

      {/* Active Filter Indicator */}
      {filterType !== "all" && !showSearch && (
        <View
          style={[
            s.filterBadge,
            { backgroundColor: colors.primary[500] + "20" },
          ]}
        >
          <Text style={[s.filterBadgeText, { color: colors.primary[500] }]}>
            {filterType === "lossless" ? "📀 Lossless Only" : "🎧 Hi-Res Only"}
          </Text>
        </View>
      )}

      {/* Tab Bar */}
      <LibraryTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        scanProgress={manualScanProgress?.current || 0}
        scanTotal={manualScanProgress?.total || 0}
        isScanning={isScanning}
        isEnriching={isEnriching}
        enrichProgress={enrichmentProgress?.current || 0}
        enrichTotal={enrichmentProgress?.total || 0}
        trackCount={filteredSource.length}
        onRefresh={onRefresh}
      />

      {/* Main Content */}
      <View style={s.content}>{renderContent()}</View>

      {/* Enrich Metadata Modal */}
      {/* <EnrichMetadataModal visible={showEnrichModal} onClose={() => setShowEnrichModal(false)} /> */}
    </View>
  );
}

// ── Styles Definition (Fixed - colors passed as parameter) ─────────────────────
const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 12,
    },
    headerCenter: {
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 4,
      textTransform: "uppercase",
    },
    headerStats: {
      fontSize: 10,
      fontWeight: "500",
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      gap: 16,
      alignItems: "center",
    },
    scanButton: {
      padding: 4,
      borderRadius: 8,
    },
    scanButtonActive: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.primary[500] + "20",
    },
    scanningIndicator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    scanningText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.primary[500],
    },
    enhanceBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
      backgroundColor: colors.status.success + "20",
    },
    enhanceBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.status.success,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    searchBar: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      height: 44,
      borderRadius: 22,
      paddingHorizontal: 16,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
    },
    filterBadge: {
      alignSelf: "center",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 8,
    },
    filterBadgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    content: {
      flex: 1,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: "500",
    },
    emptySearch: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 40,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "800",
      marginTop: 16,
    },
    emptySub: {
      fontSize: 14,
      textAlign: "center",
      marginTop: 8,
      opacity: 0.6,
    },
  }); 