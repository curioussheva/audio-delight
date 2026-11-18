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
  Alert,
  Platform,
  TextInput,
  Keyboard,
  AppState,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";

// Icons
import {
  ArrowLeft,
  ChevronLeft,
  Music2,
  Trash2,
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
import { useLibrary } from "@/features/library/hooks/useLibrary";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
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
import { shouldRunResumeRefresh } from "@/features/library/services/resumeRefreshGuard";
import { EnrichMetadataModal } from "@/features/library/components/EnrichMetadataModal";

// Components
import { DrawerMenuButton } from "@/shared/components/ui/DrawerMenuButton";
import { ScreenLoading } from "@/shared/components/ui/ScreenLoading";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { SongListItem } from "@/features/library/components/SongListItem";
import { EmptyLibrary } from "@/features/library/components/EmptyLibrary";
import { LibraryScanner } from "@/features/library/api/scanner";
import { LibraryTabBar } from "@/features/library/components/LibraryTabBar";
import { AlbumGrid } from "@/features/library/components/AlbumGrid";
import { ArtistList } from "@/features/library/components/ArtistList";
import { GenreList } from "@/features/library/components/GenreList";
import { FolderList } from "@/features/library/components/FolderList";
import { FileTypeList } from "@/features/library/components/FileTypeList";
import { PlaylistList, PlaylistItem } from "@/features/library/components/PlaylistList";
import { usePlaylists } from "@/features/playlist/hooks/usePlaylists";
import { CreatePlaylistModal } from "@/features/playlist/components/CreatePlaylistModal";
import { parseM3U } from "@/features/library/api/m3u";
import { formatTime } from "@/shared/utils/time";
import type { Song } from "@/shared/types/audio";
import {
  FLOATING_PLAYER_CLEARANCE,
  FLOATING_PLAYER_HEIGHT,
} from "@/features/player/layout";

// Debounce helper
const debounce = (func: Function, delay: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

export default function LibraryScreen() {
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
  // U-P1-30: state pengendali EnrichMetadataModal (dulu tidak ada — tombol
  // Enhance + render modal sama-sama dikomentari).
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "lossless" | "hi-res">(
    "all",
  );

  const searchInputRef = useRef<TextInput>(null);
  // J3-1: penjaga refresh foreground — cooldown + durasi background yang
  // SAMA seperti quickDiff di useScanManager. quickDiff TIDAK bisa
  // menggantikan refresh ini: ia return kosong saat auto-scan mati
  // (default OFF, libraryStore.ts) dan tidak pernah setTracks, jadi tanpa
  // refresh ini UI tidak menampilkan lagu baru/hilang. Yang diperbaiki di
  // sini hanya penjaganya: dulu tiap kembali foreground = refresh penuh
  // tanpa cooldown dan tanpa cek durasi background.
  const lastForegroundRefreshRef = useRef(0);
  const backgroundedAtRef = useRef(0);
  const BOTTOM_COMPENSATION = Platform.OS === "ios" ? insets.bottom + 20 : 30;

  const { playSong, currentSong, isPlaying } = usePlayerStore();

  // 🔥 FIX: list harus punya ruang untuk FloatingPlayer + tab bar.
  // Sebelumnya padding bawah cuma 30 (Android), tapi FloatingPlayer sendiri
  // sudah 72 + margin, jadi item terakhir tertutupi.
  const FLOATING_BOTTOM =
    BOTTOM_COMPENSATION + FLOATING_PLAYER_CLEARANCE * (currentSong ? 1 : 0);

  // Styles with colors
  const s = useMemo(() => createStyles(colors), [colors]);

  // ── Library Hooks ──────────────────────────────────────────────────────────
  // U-P1-39: error dari useLibrary dibaca langsung — dulu dibuang, jadi
  // gagal muat hanya masuk console.
  // U-P2-03: dulu lewat useOptimizedLibrary, tapi nilai yang dipakai dari
  // hook itu hanya loading/error/reload + favorit — processedSongs-nya
  // (return `songs`) tidak pernah dipakai, dan filterBy yang dikirim
  // ("all"/"lossless"/"hi-res") tidak cocok dengan nilai yang dipahami
  // hook itu ("favorites"/"format-flac"/"sample-rate-hi-res"/...).
  // Panggil useLibrary + useFavorites langsung supaya tidak ada komputasi
  // filter/sort yang hasilnya dibuang.
  const { loading, error: libraryError, reload } = useLibrary();
  const { isFavorite, toggleFavorite, favoriteIds, favoriteSongs } =
    useFavorites();

  // ── Playlist (tab playlist) ──────────────────────────────────────────────
  // Wiring F: tab playlist dulu stub (playlists={[]}, handler no-op).
  // Data + aksi dari usePlaylists — hook/service yang sama dengan layar
  // drawer Playlist (src/app/(drawer)/playlist.tsx).
  const { playlists, createPlaylist, deletePlaylist, importM3UPaths } =
    usePlaylists();
  const [selectedPlaylist, setSelectedPlaylist] =
    useState<PlaylistItem | null>(null);
  // B2 (ronde 9): dialog nama playlist lintas-platform — dulu
  // Alert.prompt (iOS-only, no-op di Android).
  const [showCreateModal, setShowCreateModal] = useState(false);

  // U-P1-18: detail view (Album/Artist/Genre/Folder/Format) menerima
  // favoriteIds sebagai Set — dulu tidak pernah dioper, jadi semua hati
  // jatuh ke default kosong. Set dibuat ulang hanya saat daftar berubah.
  const favoriteIdSet = useMemo(
    () => new Set(favoriteIds),
    [favoriteIds],
  );

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

  // F: PlaylistList mengharapkan `count`, Playlist pakai `songCount`.
  const playlistItems: PlaylistItem[] = useMemo(
    () =>
      playlists.map((p) => ({
        id: p.id,
        name: p.name,
        count: p.songCount,
      })),
    [playlists],
  );

  // F: playlist lengkap (dengan `songs`) untuk detail view; "favorites"
  // bukan playlist DB — lagunya dari favoriteSongs.
  const selectedFull = useMemo(
    () =>
      selectedPlaylist && selectedPlaylist.id !== "favorites"
        ? playlists.find((p) => p.id === selectedPlaylist.id)
        : undefined,
    [playlists, selectedPlaylist],
  );
  const selectedSongs: Song[] = useMemo(
    () =>
      selectedPlaylist?.id === "favorites"
        ? favoriteSongs
        : (selectedFull?.songs ?? []),
    [selectedPlaylist, favoriteSongs, selectedFull],
  );

  // ── CORE LOGIC: Reactive Filtering + URI Safety ───────────────────────────
  // U-P2-03: dulu ada memo `validSongs` yang mem-filter filteredSource
  // tapi kedua cabangnya `return true` — no-op. Lagu tanpa URI tetap
  // ditampilkan (keputusan lama), jadi filter-nya dihapus dan pemakai
  // memakai filteredSource langsung.

  // ── Lifecycle & Sync ───────────────────────────────────────────────────────
  // U-P2-06: kembalikan boolean supaya pemanggil tahu refresh berhasil
  // atau gagal — LibraryTabBar menembak haptic sukses hanya bila true.
  const refreshLibrary = useCallback(
    async (showRefreshIndicator = false): Promise<boolean> => {
      if (showRefreshIndicator) setRefreshing(true);

      try {
        const freshSongs = (await LibraryScanner.getLibrarySongs()) ?? [];
        setTracks(freshSongs as any);
        await reload();
        return true;
      } catch (err) {
        console.error("Refresh Error:", err);
        return false;
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

  // J3-1: SATU predikat penjaga bersama quickDiff (useScanManager) —
  // resumeRefreshGuard.shouldRunResumeRefresh: skip kalau baru <3 dtk di
  // background, cooldown 60 dtk antar refresh foreground. syncFromNative
  // (J1-3 fix 1, playerStore) punya listener AppState sendiri dan tidak
  // disentuh di sini.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (state !== "active") return;
      const now = Date.now();
      if (
        shouldRunResumeRefresh({
          backgroundedAt: backgroundedAtRef.current,
          lastRunAt: lastForegroundRefreshRef.current,
          now,
        }) !== "ok"
      ) {
        return;
      }
      lastForegroundRefreshRef.current = now;
      debouncedRefresh();
    });
    return () => subscription.remove();
  }, [debouncedRefresh]);

  // Close search when tab changes
  useEffect(() => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery("");
    }
    // F: tutup detail playlist saat pindah tab.
    setSelectedPlaylist(null);
  }, [activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleManualRescan = async () => {
    if (isManualScanning || isAutoScanning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await manualRescan((progress) => {
        useLibraryStore.getState().updateManualScanProgress(progress);
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
    setShowEnrichModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Playlist handlers (F) ────────────────────────────────────────────────
  // Pola yang sama dengan layar drawer Playlist
  // (src/app/(drawer)/playlist.tsx): modal lintas-platform untuk nama,
  // DocumentPicker + parseM3U untuk import, Alert konfirmasi untuk hapus.
  // B2 (ronde 9): tap "Buat Playlist Baru" → buka modal; submit nama →
  // createPlaylist → tutup modal. Alert.prompt dihapus — iOS-only,
  // di Android no-op tanpa warning.
  const handleCreatePlaylist = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleCreatePlaylistSubmit = useCallback(
    async (name: string) => {
      await createPlaylist({ name, songIds: [] });
      setShowCreateModal(false);
    },
    [createPlaylist],
  );

  const handleImportM3U = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/x-mpegurl", "application/x-mpegurl", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const parsedData = await parseM3U(file.uri);

      // PENTING: jangan pakai parsedData.name untuk nama playlist.
      // Dengan copyToCacheDirectory: true, DocumentPicker meng-copy
      // file terpilih ke cache app dengan nama file yang di-generate
      // ulang (biasanya UUID) — parseM3U() menebak nama dari path
      // hasil copy itu, bukan nama asli. Nama asli file tersimpan di
      // file.name (metadata dari picker), pakai itu.
      const originalName =
        file.name?.replace(/\.(m3u|m3u8)$/i, "") ||
        parsedData?.name ||
        "Imported Playlist";

      if (parsedData && parsedData.paths.length > 0) {
        // Simpan playlist baru dari hasil parse M3U/M3U8 — tiap path
        // lagu di-resolve ke songId di database lewat importM3UPaths.
        const newPlaylist = await importM3UPaths(
          originalName,
          parsedData.paths,
        );

        const matchedCount = newPlaylist.songIds.length;
        const skippedCount = parsedData.paths.length - matchedCount;

        Alert.alert(
          "Import Berhasil",
          skippedCount > 0
            ? `Playlist "${originalName}" ditambahkan (${matchedCount} track cocok, ${skippedCount} track dilewati karena tidak ditemukan di library).`
            : `Playlist "${originalName}" berhasil ditambahkan (${matchedCount} track).`,
        );
      } else {
        Alert.alert(
          "Import Gagal",
          "File M3U/M3U8 kosong atau format tidak valid.",
        );
      }
    } catch (error) {
      console.error("[M3U Import Error]:", error);
      Alert.alert("Error", "Gagal membaca file M3U/M3U8.");
    }
  }, [importM3UPaths]);

  const handlePlaylistPress = useCallback((playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist);
  }, []);

  const handleDeletePlaylist = useCallback(() => {
    if (!selectedPlaylist || selectedPlaylist.id === "favorites") return;
    Alert.alert(
      "Hapus Playlist",
      `Hapus playlist "${selectedPlaylist.name}"?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            await deletePlaylist(selectedPlaylist.id);
            setSelectedPlaylist(null);
          },
        },
      ],
    );
  }, [selectedPlaylist, deletePlaylist]);

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
    return refreshLibrary(true);
  }, [refreshLibrary]);

  const isScanning = isManualScanning || isAutoScanning;

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const renderHeader = () => {
    const { totalTracks = 0, artistsCount = 0 } = stats || {};

    if (showSearch) {
      return (
        <View style={s.searchRow}>
          <TouchableOpacity
            onPress={toggleSearch}
            hitSlop={12}
            style={s.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Tutup pencarian"
          >
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
              <TouchableOpacity
                onPress={clearSearch}
                hitSlop={12}
                style={s.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Hapus pencarian"
              >
                <X size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return (
      <>
        {/* U-P2-49: tombol drawer sekarang komponen bersama
            DrawerMenuButton — perilaku sama (Menu 26, buka drawer), hanya
            target sentuh + label aksesibilitas yang diseragamkan. */}
        <DrawerMenuButton />

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
          <TouchableOpacity
            onPress={toggleSearch}
            hitSlop={12}
            style={s.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Cari"
          >
            <Search size={22} color={colors.text.primary} strokeWidth={2} />
          </TouchableOpacity>

          {!isScanning && hasPendingEnrichment && unenrichedCount > 0 && (
            <TouchableOpacity
              onPress={handleEnhanceMetadata}
              hitSlop={12}
              style={s.headerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Enhance metadata"
            >
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
            hitSlop={12}
            style={s.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Filter lagu"
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
            hitSlop={12}
            style={[
              s.headerIconBtn,
              s.scanButton,
              isScanning && s.scanButtonActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              isScanning ? "Batalkan pemindaian" : "Pindai ulang library"
            }
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
    // F: detail playlist — tap row playlist di tab playlist membuka
    // daftar lagunya di dalam tab (pola yang sama dengan layar drawer
    // Playlist); "favorites" menampilkan lagu favorit. Dicek paling
    // dulu supaya detail tetap tampil walau ada teks pencarian.
    if (selectedPlaylist) {
      return (
        <View style={{ flex: 1 }}>
          <View style={s.detailHeader}>
            <TouchableOpacity
              onPress={() => setSelectedPlaylist(null)}
              style={s.backBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke daftar playlist"
            >
              <ChevronLeft size={28} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={s.detailTitleWrap}>
              <Text
                style={[s.detailTitle, { color: colors.text.primary }]}
                numberOfLines={1}
              >
                {selectedPlaylist.name}
              </Text>
              <Text
                style={[s.detailSubtitle, { color: colors.text.secondary }]}
              >
                {selectedSongs.length} track
                {selectedFull?.duration
                  ? ` • ${formatTime(selectedFull.duration)}`
                  : ""}
              </Text>
            </View>
            {selectedPlaylist.id !== "favorites" && (
              <TouchableOpacity
                onPress={handleDeletePlaylist}
                style={s.backBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Hapus playlist"
              >
                <Trash2 size={20} color={colors.status.error} />
              </TouchableOpacity>
            )}
          </View>

          {selectedSongs.length === 0 ? (
            <View style={s.center}>
              <EmptyState
                title="Belum ada lagu di playlist ini."
                icon={<Music2 size={40} color={colors.text.tertiary} />}
              />
            </View>
          ) : (
            <FlashList
              data={selectedSongs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingBottom: FLOATING_BOTTOM,
                paddingHorizontal: 12,
              }}
              renderItem={({ item }) => (
                <SongListItem
                  item={item as any}
                  isNowPlaying={currentSong?.id === item.id && isPlaying}
                  isFavorite={isFavorite(item.id)}
                  colors={colors}
                  onPress={() => {
                    handleSongPress(item, selectedSongs);
                  }}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            />
          )}
        </View>
      );
    }

    if (loading && tracks.length === 0) {
      return (
        <View style={s.center}>
          {/* U-P2-53: pola loading bersama. */}
          <ScreenLoading message="Loading library..." />
        </View>
      );
    }

    // U-P1-39: gagal muat tampil jujur + bisa coba lagi — dulu hanya
    // console.error dan layar jatuh ke EmptyLibrary seolah tidak ada lagu.
    if (libraryError && tracks.length === 0) {
      return (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: colors.text.primary }]}>
            Gagal memuat library
          </Text>
          <Text style={[s.emptySub, { color: colors.text.tertiary }]}>
            {libraryError}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={[s.retryBtn, { borderColor: colors.primary[500] }]}
            accessibilityRole="button"
            accessibilityLabel="Coba lagi memuat library"
          >
            <Text
              style={[s.retryBtnText, { color: colors.primary[500] }]}
            >
              Coba lagi
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (filteredSource.length === 0 && searchQuery.length > 0) {
      return (
        <View style={s.emptySearch}>
          {/* U-P2-53: empty state bersama. State error (di atas) dan
              EmptyLibrary (di bawah) sengaja tidak dimigrasikan — lihat
              EmptyState.tsx. */}
          <EmptyState
            title="No results found"
            message="Try different keywords or check your spelling"
            icon={
              <SearchX
                size={60}
                color={colors.text.disabled}
                strokeWidth={1.5}
              />
            }
          />
        </View>
      );
    }

    if (tracks.length === 0) {
      return (
        <EmptyLibrary
          colors={colors}
          onScan={handleManualRescan}
          isScanning={isManualScanning || isAutoScanning}
          scanProgress={manualScanProgress?.current ?? 0}
          scanTotal={manualScanProgress?.total ?? 0}
        />
      );
    }
 
    switch (activeTab) {
      case "song":
        return (
          <FlashList
            data={filteredSource}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingBottom: FLOATING_BOTTOM,
              paddingHorizontal: 12,
            }}
            renderItem={({ item }) => (
              <SongListItem
                item={item as any}
                isNowPlaying={currentSong?.id === item.id && isPlaying}
                isFavorite={isFavorite(item.id)}
                colors={colors}
                // Gunakan handleSongPress agar konsisten
                onPress={() => {
                  handleSongPress(item, filteredSource);
                }}
                onToggleFavorite={toggleFavorite}
              />
            )}
            // U-P1-39: pull-to-refresh — RefreshControl diimpor tapi dulu
            // tidak pernah dipakai.
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary[500]}
                colors={[colors.primary[500]]}
              />
            }
          />
        );
      case "album":
        return (
          <AlbumGrid
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />
        );
      case "artist":
  return (
    <ArtistList
      artists={artists}           // <--- ADD THIS (Fixes TS2741)
      tracks={filteredSource}
      currentTrackId={currentSong?.id}
      favoriteIds={favoriteIdSet}
      onSongPress={handleSongPress}
      onToggleFavorite={toggleFavorite}
    />
  );
      case "genre":
        return (
          <GenreList
            genres={genres}
            tracks={filteredSource}
            currentTrackId={currentSong?.id}
            favoriteIds={favoriteIdSet}
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
            favoriteIds={favoriteIdSet}
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
            favoriteIds={favoriteIdSet}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "playlist":
        return (
          <PlaylistList
            playlists={playlistItems}
            favoriteCount={tracks.filter((t) => isFavorite(t.id)).length}
            onPlaylistPress={handlePlaylistPress}
            onCreateNew={handleCreatePlaylist}
            onImportM3U={handleImportM3U}
          />
        );
      default:
        return null;
    }
  };


  // ── BRIDGE: Convert MediaTrack to Song for Player ──────────────────────────
  const handleSongPress = useCallback((track: any, queue: any[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Kita lakukan casting ke 'any' lalu ke 'Song' di dalam store
    // Ini menyelesaikan error TS2322 pada AlbumGrid, GenreList, dll.
    playSong(track, queue);
  }, [playSong]);

  return (
    <View style={[s.container, { backgroundColor: colors.background.primary }]}>
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

      {/* U-P1-39: daftar lama tetap tampil, tapi error refresh tidak lagi
          sunyi — banner jujur + tombol coba lagi. */}
      {libraryError && tracks.length > 0 && (
        <View
          style={[
            s.errorBanner,
            { backgroundColor: colors.status.error + "1A" },
          ]}
        >
          <Text
            style={[s.errorBannerText, { color: colors.status.error }]}
            numberOfLines={2}
          >
            Gagal memperbarui library: {libraryError}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Coba lagi memuat library"
          >
            <Text
              style={[s.retryBtnText, { color: colors.status.error }]}
            >
              Coba lagi
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content */}
      <View style={s.content}>{renderContent()}</View>

      {/* Enrich Metadata Modal — U-P1-30: hanya wiring (tombol → modal
          buka/tutup). Isi/klaim modal adalah U-P1-10, sengaja tidak diubah. */}
      <EnrichMetadataModal
        visible={showEnrichModal}
        onClose={() => setShowEnrichModal(false)}
      />

      {/* B2 (ronde 9): dialog buat playlist lintas-platform. */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePlaylistSubmit}
      />
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
    // U-P2-01: tombol ikon header ≥44dp — ikon 18–26 + hitSlop 8 lama
    // cuma ~34–42dp. Pola yang sama dengan DrawerMenuButton (min 44×44
    // + hitSlop 12 → efektif ~50dp).
    headerIconBtn: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: "center",
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
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: "500",
    },
    retryBtn: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: 8,
    },
    retryBtnText: {
      fontSize: 14,
      fontWeight: "700",
    },
    // F: header detail playlist (pola yang sama dengan layar drawer
    // Playlist) — tombol kembali + judul + hapus.
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backBtn: {
      padding: 8,
    },
    detailTitleWrap: {
      flex: 1,
      marginLeft: 4,
    },
    detailTitle: {
      fontSize: 20,
      fontWeight: "800",
    },
    detailSubtitle: {
      fontSize: 13,
      marginTop: 2,
    },
  }); 