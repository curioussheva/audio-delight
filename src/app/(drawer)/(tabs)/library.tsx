import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Keyboard,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

// Icons
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Music2,
  Plus,
  Trash2,
  Search,
  ScanText,
  SearchX,
  Filter,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";

// Context & Stores
import { useTheme } from "@/shared/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibrary } from "@/features/library/hooks/useLibrary";
// [FLING] diagnostik sementara (drawDistance 100) — lihat flingDiag.ts.
import { noteFlingStart, noteFlingEnd } from "@/features/library/api/flingDiag";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import {
  selectArtists,
  selectFolders,
  selectGenres,
  selectFileTypes,
  selectLibraryStats,
} from "@/features/library/store/selectors";

// Scan System
import {
  useScanManager,
  useScanFlags,
  useEnrichmentCounts,
} from "@/features/library/hooks/useScanManager";
import { ScanAlreadyRunningError } from "@/features/library/services/UnifiedScanService";
import { createRefreshCoalescer } from "@/features/library/services/refreshCoalescer";
import {
  isLibraryScanRunning,
  shouldRefreshLibraryOnBump,
} from "@/features/library/services/refreshPolicy";
import { useRefreshStore } from "@/shared/store/refreshStore";
import { EnrichMetadataModal } from "@/features/library/components/EnrichMetadataModal";

// Components
import { DrawerMenuButton } from "@/shared/components/ui/DrawerMenuButton";
import { ScreenLoading } from "@/shared/components/ui/ScreenLoading";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { ErrorState } from "@/shared/components/ui/ErrorState";
import { SearchInput } from "@/shared/components/ui/SearchInput";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { useToastStore } from "@/shared/store/toastStore";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { parseHex } from "@/shared/utils/contrast";
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
import { AddSongsModal } from "@/features/playlist/components/AddSongsModal";
import { parseM3U } from "@/features/library/api/m3u";
import { formatTime } from "@/shared/utils/time";
import type { Song } from "@/shared/types/audio";
import {
  isSmartPlaylistId,
  SmartPlaylistId,
} from "@/features/playlist/utils/smartPlaylists";
import {
  FLOATING_PLAYER_CLEARANCE,
} from "@/features/player/layout";

// Fase 4: satu pekerjaan refresh yang sedang jalan tidak diduplikasi —
// pemicu kedua (bump kedua, atau pull saat subscriber jalan) mendapat
// promise yang sama. Instans level modul: selamat dari remount tab
// (pola yang sama dengan globalLoadingPromise di useLibrary).
const libraryRefreshCoalescer = createRefreshCoalescer();

// Fase 3 Library: helper yang sama seperti Player (disc ON/OFF) —
// parseHex mengembalikan null untuk hex yang tidak terbaca → fallback
// ke warna asli, bukan hitam buta.
const hexToRGBA = (hex: string, opacity: number): string => {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

// Playlist virtual (bukan baris DB): "Lagu Disukai" + smart playlist —
// tidak ada tambah/hapus lagu, tidak bisa dihapus. Dipakai semua guard
// CRUD di detail view (tombol +, tong sampah, × per lagu).
const isReadOnlyPlaylistId = (id: string): boolean =>
  id === "favorites" || isSmartPlaylistId(id);

// Lazyload-fix (butir 2): keyExtractor stabil level modul — dulu inline di
// JSX tiap FlashList, jadi identitasnya baru tiap render layar dan FlashList
// (PureComponent) melihat prop baru.
const songKeyExtractor = (item: Song) => item.id;

// ── FlashList drawDistance (fling-blank fix 2026-11-20) ────────────────────
// @shopify/flash-list v2 (2.0.2) TIDAK PUNYA estimatedItemSize — prop itu
// hanya ada di v1; di v2 tiap baris diukur otomatis saat mount, dan
// overrideItemLayout hanya mengubah span kolom, bukan ukuran. Satu-satunya
// tuas overscan adalah drawDistance: buffer (dp) di TIAP sisi viewport
// (total buffer = 2× drawDistance); default vendor 250.
//
// ANGKA TERVERIFIKASI (bukan tebakan):
// - Baris SongListItem ±77dp — dari styles: konten tertinggi ±53dp
//   (artwork 48 + marginTop 2, atau 3 baris teks ±19+15+13 + gap 3×2)
//   + paddingVertical 20 + marginVertical 4.
// - Viewport daftar ±560dp — layar POCO M6 360×800dp dikurangi header,
//   tab bar, dan floating player.
// - Jendela render total = (viewport + 2×drawDistance) / 77.
//
// RIWAYAT: 500 → total (560+1000)/77 ≈ 20 baris (fling cepat masih bisa
// "ompong"); 2026-11-20 14:54 user minta 50/100 baris — untuk offline
// player, daftar 1000++ lagu itu wajar, dan 15–20 baris terasa sangat
// kurang. Dipilih 50: drawDistance = (50×77 − 560)/2 = 1645 → 1650,
// total (560+3300)/77 ≈ 50 baris. 2026-11-20 15:24 user minta naik ke 100
// baris + periksa perbedaan kinerjanya nanti: drawDistance =
// (100×77 − 560)/2 = 3570, total (560+7140)/77 ≈ 100 baris. Perbandingan
// kinerja (50 vs 100) terjadi di device, sesudah ronde ini — catat saat
// tes: kehalusan fling, baris kosong, berat saat fling + playback, dan
// freeze (lihat laporan library-draw-distance-100-report.md).
//
// TRADE-OFF (baca sebelum menaikkan lagi): tiap baris ekstra = artwork +
// teks yang harus di-mount thread JS; app ini sudah melawan stall thread
// JS (freeze: fling + playback; 2 lag terbesar logcat-6 dari drag slider;
// logcat-7 kembali ≥10 dtk di tengah badai fling). 100 baris = 100
// SongListItem + fetch artwork sekaligus di thread JS — ini eksperimen,
// bukan nilai aman. Kalau HP terasa lebih berat atau freeze memburuk,
// tersangka pertama adalah nilai ini — TANGGA FALLBACK: 1650 (≈50 baris)
// → 500 (≈20 baris) → 350.
const LIBRARY_DRAW_DISTANCE_DP = 3570;

// ── LibraryHeader (per-node render, 2026-11-22 — pola opsi 2 EQ) ───────────
// Dulu `renderHeader()` adalah fungsi polos DI DALAM LibraryScreen: tiap
// render layar (termasuk tiap tick progres scan) membangun ulang header.
// Sekarang komponen `memo` sendiri yang melanggan potongannya sendiri:
// - `tracks` → hitungan "N tracks • N artists" (selectLibraryStats);
// - `unenrichedCount` + `enrichmentQueueSize` (via useEnrichmentCounts,
//   hanya hitungan — tanpa objek progres) → "N pending" + badge
//   Enhance — berubah saat enrichment maju, dan HANYA header yang
//   bangun karenanya (tick `enrichmentProgress` tidak membangunkan
//   header);
// - flag scan (via useScanFlags) → tombol scan AUTO/SCAN, badge
//   disembunyikan + filter dimatikan saat scan jalan.
// Prop dari layar hanya state lokal pencarian/filter (berubah saat user
// mengetik/mengganti filter — saat itulah header memang harus bangun) +
// handler yang stabil (useCallback). JSX dipindah verbatim dari
// renderHeader lama; perilaku identik.
interface LibraryHeaderProps {
  showSearch: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onToggleSearch: () => void;
  filterType: "all" | "lossless" | "hi-res";
  setFilterType: React.Dispatch<
    React.SetStateAction<"all" | "lossless" | "hi-res">
  >;
  onEnhanceMetadata: () => void;
  onManualRescan: () => void;
  onCancelScan: () => void;
}

const LibraryHeader = memo(function LibraryHeader({
  showSearch,
  searchQuery,
  setSearchQuery,
  onToggleSearch,
  filterType,
  setFilterType,
  onEnhanceMetadata,
  onManualRescan,
  onCancelScan,
}: LibraryHeaderProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const s = useMemo(() => createStyles(colors), [colors]);

  const tracks = useLibraryStore((st) => st.tracks);
  const stats = useMemo(() => selectLibraryStats(tracks), [tracks]);
  const { isManualScanning, isAutoScanning } = useScanFlags();
  const { unenrichedCount, hasPendingEnrichment } = useEnrichmentCounts();
  const isScanning = isManualScanning || isAutoScanning;
  const { totalTracks = 0, artistsCount = 0 } = stats || {};

  if (showSearch) {
    return (
      <View style={s.searchRow}>
        <TouchableOpacity
          onPress={onToggleSearch}
          hitSlop={12}
          style={s.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Tutup pencarian"
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        {/* Fase 3 Library: bar pencarian bersama (SearchInput) —
            ikon search + tombol hapus sudah di dalamnya. */}
        <View style={{ flex: 1 }}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Artist, Album, Format..."
            autoFocus
          />
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
          onPress={onToggleSearch}
          hitSlop={12}
          style={s.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Cari"
        >
          <Search size={22} color={colors.text.primary} strokeWidth={2} />
        </TouchableOpacity>

        {!isScanning && hasPendingEnrichment && unenrichedCount > 0 && (
          <TouchableOpacity
            onPress={onEnhanceMetadata}
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

        {/* Fase 3 Library: tombol filter memakai mekanisme ON/OFF
            yang sama dengan shuffle/repeat Player (d0ddf23d) — ON =
            disc tint primary 15% + stroke 2.5, OFF = polos. Dulu
            bedanya hanya warna ikon. */}
        <TouchableOpacity
          onPress={() =>
            setFilterType((f) =>
              f === "all" ? "lossless" : f === "lossless" ? "hi-res" : "all",
            )
          }
          hitSlop={12}
          style={[
            s.headerIconBtn,
            filterType !== "all" && {
              backgroundColor: hexToRGBA(colors.primary[500], 0.15),
              borderRadius: 22,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filter lagu"
          accessibilityState={{ selected: filterType !== "all" }}
          disabled={isScanning}
        >
          <Filter
            size={20}
            color={
              filterType !== "all"
                ? colors.primary[500]
                : colors.text.secondary
            }
            strokeWidth={filterType !== "all" ? 2.5 : 2}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={isScanning ? onCancelScan : onManualRescan}
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
              {/* 2026-11-23: ikon tombol AUTO/SCAN STATIS selama scan —
                  dulu ActivityIndicator (spinner ke-3 saat scan awal,
                  bareng bar "Discovering files…" + chip "Scanning
                  library…"). Target maks 2 animasi: yang beranimasi
                  tinggal bar + chip. Tombol tetap berfungsi: tap =
                  batalkan scan (onCancelScan). */}
              <ScanText size={16} color={colors.primary[500]} strokeWidth={2} />
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
});

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const router = useRouter();

  // ── Store States (per-node render, 2026-11-22 — pola opsi 2 EQ) ────────
  // Dulu: `const { activeTab, setActiveTab, tracks, setTracks } =
  // useLibraryStore()` TANPA selector — satu langganan ke seluruh store —
  // plus `useScanManager()` yang juga melanggan store utuh. Tiap tick
  // progres scan/enrichment (tiap `set()` store) mengeksekusi ulang
  // fungsi layar ~1500 baris + membangun ulang semua JSX (termasuk
  // FlashList) hanya untuk memperbarui satu angka.
  //
  // Sekarang layar hanya melanggan potongan yang mengubah STRUKTUR-nya:
  // tab aktif, daftar lagu, dan flag boolean scan (berubah hanya saat
  // scan mulai/selesai — bukan tiap tick). Angka progres TIDAK ada di
  // sini: bar/pill progres dilanggan LibraryTabBar sendiri, badge
  // pending + hitungan header dilanggan LibraryHeader sendiri, chip
  // status dilanggan ScanStatusBar sendiri. Tick progres tidak lagi
  // menyentuh layar ini.
  const activeTab = useLibraryStore((s) => s.activeTab);
  const setActiveTab = useLibraryStore((s) => s.setActiveTab);
  const tracks = useLibraryStore((s) => s.tracks);
  const setTracks = useLibraryStore((s) => s.setTracks);

  // Hanya flag + aksi (useScanManager tidak lagi mengembalikan objek
  // progres — lihat useScanManager.ts). `isEnriching` tidak dipakai
  // layar ini lagi (dulu hanya diteruskan ke LibraryTabBar).
  const { isAutoScanning, isManualScanning, manualRescan, cancelScan } =
    useScanManager();

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

  // (Fase 3 Library: ref input pencarian dihapus — fokus ditangani
  // SearchInput lewat autoFocus saat baris pencarian tampil.)
  // FASE 4: penjaga refresh foreground (cooldown + durasi background
  // J3-1) SUDAH PINDAH ke useForegroundRefreshCoordinator di root —
  // listener AppState ganda di sini dihapus; efek ini hanya berlangganan
  // refreshKey (lihat efek subscriber di bawah).
  const BOTTOM_COMPENSATION = Platform.OS === "ios" ? insets.bottom + 20 : 30;

  // Lazyload-fix (butir 2): dulu `const { playSong, currentSong } = usePlayerStore()`
  // berlangganan SELURUH store — tick posisi 500ms (`__positionWatcher` di
  // playerStore, set({ position }) tiap tick) me-render ulang layar ~2×/dtk
  // selama lagu diputar, tepat saat fling-scroll. Sekarang hanya id lagu yang
  // diputar (primitif — stabil selama posisi/durasi berubah) + aksi playSong
  // (stabil, aksi zustand). Layar tetap me-render ulang saat lagu berganti.
  const playSong = usePlayerStore((s) => s.playSong);
  const currentSongId = usePlayerStore((s) => s.currentSong?.id);
  const showToast = useToastStore((s) => s.showToast);

  // 🔥 FIX: list harus punya ruang untuk FloatingPlayer + tab bar.
  // Sebelumnya padding bawah cuma 30 (Android), tapi FloatingPlayer sendiri
  // sudah 72 + margin, jadi item terakhir tertutupi.
  const FLOATING_BOTTOM =
    BOTTOM_COMPENSATION + FLOATING_PLAYER_CLEARANCE * (currentSongId ? 1 : 0);

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
  const { loading, error: libraryError, reload, loadMore } = useLibrary();
  const { isFavorite, toggleFavorite, favoriteIds, favoriteSongs } =
    useFavorites();

  // ── Playlist (tab playlist) ──────────────────────────────────────────────
  // Wiring F: tab playlist dulu stub (playlists={[]}, handler no-op).
  // Data + aksi dari usePlaylists — hook/service yang sama dengan layar
  // drawer Playlist (src/app/(drawer)/playlist.tsx).
  const {
    playlists,
    smartPlaylists,
    loadSmartPlaylist,
    refreshSmartPlaylists,
    createPlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    importM3UPaths,
  } = usePlaylists();
  const [selectedPlaylist, setSelectedPlaylist] =
    useState<PlaylistItem | null>(null);
  // B2 (ronde 9): dialog nama playlist lintas-platform — dulu
  // Alert.prompt (iOS-only, no-op di Android).
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Fase 3 Library: hapus playlist lewat ConfirmDialog (satu-satunya
  // mekanisme konfirmasi), bukan Alert.alert.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Item CRUD playlist di detail view: modal tambah lagu (pola B1 yang
  // sama dengan layar drawer Playlist).
  const [showAddModal, setShowAddModal] = useState(false);
  // Smart playlist: lagunya dibaca dari SQLite saat baris ditekan
  // (bukan dari daftar playlist manual) — lihat efek di bawah.
  const [smartSongs, setSmartSongs] = useState<Song[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);

  // U-P1-18: detail view (Album/Artist/Genre/Folder/Format) menerima
  // favoriteIds sebagai Set — dulu tidak pernah dioper, jadi semua hati
  // jatuh ke default kosong. Set dibuat ulang hanya saat daftar berubah.
  const favoriteIdSet = useMemo(
    () => new Set(favoriteIds),
    [favoriteIds],
  );

  // ── Library Stats ──────────────────────────────────────────────────────────
  // Hitungan header ("N tracks • N artists") DULU dihitung di sini dari
  // `tracks` — pindah ke LibraryHeader (komponen memo di bawah), yang
  // melanggan `tracks` sendiri. Layar tidak lagi membangun ulang stats
  // tiap render.

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

  // Smart playlist (virtual) untuk seksi "Playlist Otomatis".
  const smartItems: PlaylistItem[] = useMemo(
    () =>
      smartPlaylists.map((p) => ({
        id: p.id,
        name: p.name,
        count: p.count,
        isSmart: true,
      })),
    [smartPlaylists],
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
        : isSmartPlaylistId(selectedPlaylist?.id)
          ? smartSongs
          : (selectedFull?.songs ?? []),
    [selectedPlaylist, favoriteSongs, selectedFull, smartSongs],
  );
  // Durasi detail: playlist manual dari selectedFull; smart playlist
  // dihitung dari lagunya (selectedFull undefined untuk virtual).
  const selectedDuration = useMemo(
    () =>
      selectedPlaylist && isSmartPlaylistId(selectedPlaylist.id)
        ? smartSongs.reduce((sum, s) => sum + (s.duration || 0), 0)
        : (selectedFull?.duration ?? 0),
    [selectedPlaylist, selectedFull, smartSongs],
  );

  // Smart playlist: baca ulang hitungan saat tab playlist dibuka —
  // playCount berubah saat lagu diputar tanpa bump refreshKey, jadi
  // masuk tab = momen yang tepat untuk membaca angka terbaru dari DB.
  // (Isi detail selalu segar: dibaca saat baris ditekan, efek bawah.)
  useEffect(() => {
    if (activeTab !== "playlist") return;
    void refreshSmartPlaylists();
  }, [activeTab, refreshSmartPlaylists]);

  // Smart playlist: isi dibaca dari SQLite saat baris ditekan.
  // Cancel guard supaya tap cepat berurutan tidak menimpa hasil tap
  // terakhir dengan hasil tap sebelumnya yang datang belakangan.
  useEffect(() => {
    if (!selectedPlaylist || !isSmartPlaylistId(selectedPlaylist.id)) {
      setSmartSongs([]);
      setSmartLoading(false);
      return;
    }
    let cancelled = false;
    setSmartLoading(true);
    void loadSmartPlaylist(selectedPlaylist.id as SmartPlaylistId)
      .then((pl) => {
        if (!cancelled) setSmartSongs(pl.songs);
      })
      .catch((err) => {
        console.error("[Library] Gagal memuat smart playlist:", err);
        if (!cancelled) setSmartSongs([]);
      })
      .finally(() => {
        if (!cancelled) setSmartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlaylist, loadSmartPlaylist]);

  // ── CORE LOGIC: Reactive Filtering + URI Safety ───────────────────────────
  // U-P2-03: dulu ada memo `validSongs` yang mem-filter filteredSource
  // tapi kedua cabangnya `return true` — no-op. Lagu tanpa URI tetap
  // ditampilkan (keputusan lama), jadi filter-nya dihapus dan pemakai
  // memakai filteredSource langsung.

  // ── Lifecycle & Sync ───────────────────────────────────────────────────────
  // U-P2-06: kembalikan boolean supaya pemanggil tahu refresh berhasil
  // atau gagal — LibraryTabBar menembak haptic sukses hanya bila true.
  // FASE 4: dibungkus coalescer — pemanggil kedua saat refresh jalan
  // mendapat promise yang sama (bukan pekerjaan ganda).
  // N25: spinner milik PEMANGGIL, bukan pekerjaan coalescer — dulu
  // setRefreshing(true) ada di DALAM task, jadi pull-to-refresh yang
  // "nebeng" refresh subscriber (refreshKey) mendapat promise yang sama
  // tanpa pernah menjalankan task-nya dan spinner tidak tampil. Sekarang
  // tiap pemanggil dengan showRefreshIndicator menyalakan spinnernya
  // sendiri selama menunggu promise itu (penunggu yang sama-sama
  // menunggu pekerjaan yang sama selesai di saat yang sama, jadi tidak
  // ada spinner yang mati prematur).
  const refreshLibrary = useCallback(
    async (showRefreshIndicator = false): Promise<boolean> => {
      if (showRefreshIndicator) setRefreshing(true);
      try {
        return await libraryRefreshCoalescer.run(async () => {
          // N3: getLibrarySongs kini MELEMPAR saat query gagal (bukan []
          // lagi) — catch di bawah mengembalikan false TANPA setTracks,
          // jadi satu galat DB sesaat tidak lagi mengosongkan tampilan
          // library. `?? []` lama dihapus: null tidak pernah dikembalikan.
          const freshSongs = await LibraryScanner.getLibrarySongs();
          setTracks(freshSongs as any);
          await reload();
          return true;
        });
      } catch (err) {
        console.error("Refresh Error:", err);
        return false;
      } finally {
        if (showRefreshIndicator) setRefreshing(false);
      }
    },
    [setTracks, reload],
  );

  // FASE 4 — refreshKey global: SATU jalur refresh terkoordinasi.
  // Dulu: listener AppState di sini (debounce 500ms) + quickDiff di
  // useScanManager (debounce 800ms) jalan sendiri-sendiri — refresh
  // Library bisa baca DB SEBELUM diff ditulis (UI ketinggalan satu
  // resume), dan bisa baca DI TENGAH scan (daftar sebagian/kosong).
  // Sekarang koordinator foreground (ter-mount di root) menjalankan
  // diff DULU lalu bump; efek ini hanya menjalankan refreshLibrary.
  // Refresh ini tetap dibutuhkan walau diff sudah jalan: quickDiff
  // TIDAK PERNAH setTracks (return kosong saat auto-scan mati, default
  // OFF) — tanpa refresh ini UI tidak menampilkan lagu baru/hilang.
  // - dilewat bila alasan bump bukan untuk daftar lagu (mis.
  //   "playlist-change" — lagu tidak berubah);
  // - dilewat bila scan sedang jalan — bump penutup scan yang akan
  //   me-refresh (baca DB saat tulis diff berjalan = daftar sebagian).
  // Ref dipakai supaya efek hanya bergantung pada refreshKey: identitas
  // refreshLibrary berubah saat reload berubah (offset useLibrary),
  // dan efek tidak boleh jalan ulang hanya karena itu.
  const refreshLibraryRef = useRef(refreshLibrary);
  refreshLibraryRef.current = refreshLibrary;
  const refreshKey = useRefreshStore((s) => s.refreshKey);
  useEffect(() => {
    if (refreshKey === 0) return;
    const { lastReason } = useRefreshStore.getState();
    if (!shouldRefreshLibraryOnBump(lastReason)) return;
    if (isLibraryScanRunning(useLibraryStore.getState())) {
      console.log("[Library] Refresh dilewat: scan sedang berjalan");
      return;
    }
    void refreshLibraryRef.current(false);
  }, [refreshKey]);

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
  // useCallback (bukan fungsi polos): diteruskan ke LibraryHeader +
  // EmptyLibrary yang di-memo — identitas stabil supaya memo tidak
  // batal tiap render layar. Guard baca flag dari closure (boolean,
  // berubah jarang); progres diteruskan ke store lewat getState().
  const handleManualRescan = useCallback(async () => {
    if (isManualScanning || isAutoScanning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await manualRescan((progress) => {
        useLibraryStore.getState().updateManualScanProgress(progress);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      // N27: rescan kedua yang dimulai hampir bersamaan dengan rescan
      // dari Settings (atau tap ganda) — bukan kegagalan dan jangan diam
      // saja (dulu hanya console.error + haptic). Rescan pertama tetap
      // jalan; beri tahu user lewat toast info.
      if (error instanceof ScanAlreadyRunningError) {
        showToast("Rescan sedang berjalan.", "info");
      } else {
        console.error("Manual scan failed:", error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      // FASE 4: jangan refresh langsung — bump, biar subscriber yang
      // refresh lewat SATU jalur (dengan guard scan + dedup). Bump juga
      // saat scan GAGAL: DB bisa tertulis sebagian, UI harus menampilkan
      // keadaan sebenarnya, bukan daftar lama. finishManualScan sudah
      // jalan di finally UnifiedScanService.manualScan, jadi guard scan
      // di subscriber tidak akan melewatkan bump ini.
      useRefreshStore.getState().bumpRefreshKey("manual-scan", "library");
    }
  }, [isManualScanning, isAutoScanning, manualRescan, showToast]);

  // Guard baca hitungan lewat getState() (bukan langganan): layar tidak
  // boleh bangun tiap unenrichedCount berubah — badge-nya hidup di
  // LibraryHeader, yang melanggan hitungan itu sendiri.
  const handleEnhanceMetadata = useCallback(() => {
    if (useLibraryStore.getState().unenrichedCount === 0) return;
    setShowEnrichModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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
      // FASE 4: "Playlist dibuat" kini punya rumah — toast sukses.
      // Gagal buat (mis. nama duplikat di service) tetap di modal
      // supaya user bisa perbaiki namanya, bukan ditutup diam-diam.
      try {
        await createPlaylist({ name, songIds: [] });
        setShowCreateModal(false);
        showToast(`Playlist "${name}" dibuat.`, "success");
      } catch (error) {
        console.error("[Library] Gagal membuat playlist:", error);
        showToast("Gagal membuat playlist. Coba lagi.", "error");
      }
    },
    [createPlaylist, showToast],
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

        // Fase 3 Library: umpan balik sukses lewat toast global,
        // bukan Alert.alert (pola yang sama dengan layar Playlist).
        showToast(
          skippedCount > 0
            ? `Playlist "${originalName}" ditambahkan (${matchedCount} track cocok, ${skippedCount} track dilewati karena tidak ditemukan di library).`
            : `Playlist "${originalName}" berhasil ditambahkan (${matchedCount} track).`,
          "success",
        );
      } else {
        showToast("File M3U/M3U8 kosong atau format tidak valid.", "error");
      }
    } catch (error) {
      console.error("[M3U Import Error]:", error);
      showToast("Gagal membaca file M3U/M3U8.", "error");
    }
  }, [importM3UPaths, showToast]);

  const handlePlaylistPress = useCallback((playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist);
  }, []);

  const handleDeletePlaylist = useCallback(() => {
    if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
      return;
    setShowDeleteDialog(true);
  }, [selectedPlaylist]);

  const handleConfirmDeletePlaylist = useCallback(async () => {
    if (!selectedPlaylist) return;
    // FASE 4: hapus tetap lewat ConfirmDialog (destruktif tidak boleh
    // toast saja) — toast ini hanya umpan balik SESUDAH konfirmasi.
    // N7: deletePlaylist kini melempar bila tulis DB gagal — jangan tutup
    // detail + jangan toast "dihapus" saat playlist sebenarnya masih ada.
    const name = selectedPlaylist.name;
    try {
      await deletePlaylist(selectedPlaylist.id);
    } catch (error) {
      console.error("[Library] Gagal menghapus playlist:", error);
      showToast("Gagal menghapus playlist. Coba lagi.", "error");
      return;
    }
    setSelectedPlaylist(null);
    setShowDeleteDialog(false);
    showToast(`Playlist "${name}" dihapus.`, "info");
  }, [selectedPlaylist, deletePlaylist, showToast]);

  // Item CRUD playlist di detail view (pola yang sama dengan layar drawer
  // Playlist): hapus lagu dari playlist — LANGSUNG + toast, tanpa dialog
  // konfirmasi. Lagunya tetap ada di Library, jadi ini bukan destruktif
  // permanen (aturan Fase 2: dialog hanya untuk destruktif). "Lagu
  // Disukai" bukan playlist DB — tidak ada hapus item di sana (onRemove
  // tidak diteruskan, lihat renderPlaylistSongItem).
  const handleRemoveSong = useCallback(
    async (song: Song) => {
      if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
        return;
      // N7: removeFromPlaylist kini melempar bila tulis DB gagal.
      try {
        await removeFromPlaylist(selectedPlaylist.id, song.id);
      } catch (error) {
        console.error("[Library] Gagal menghapus lagu dari playlist:", error);
        showToast("Gagal menghapus lagu dari playlist.", "error");
        return;
      }
      showToast(`"${song.title}" dihapus dari playlist.`, "info");
    },
    [selectedPlaylist, removeFromPlaylist, showToast],
  );

  // Item CRUD playlist di detail view (entry B1): tiap lagu yang ditekan
  // di modal langsung ditambahkan + toast; modal tetap terbuka sampai
  // "Selesai" supaya bisa tambah beberapa lagu sekaligus. Hook me-reload
  // daftar setelah tulis, jadi barisnya langsung berubah jadi centang.
  const handleAddSong = useCallback(
    async (song: Song) => {
      if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
        return;
      // N7: addToPlaylist kini melempar bila tulis DB gagal.
      try {
        await addToPlaylist(selectedPlaylist.id, [song]);
      } catch (error) {
        console.error("[Library] Gagal menambah lagu ke playlist:", error);
        showToast("Gagal menambah lagu ke playlist.", "error");
        return;
      }
      showToast(`"${song.title}" ditambahkan ke playlist.`, "success");
    },
    [selectedPlaylist, addToPlaylist, showToast],
  );

  // useCallback: diteruskan ke LibraryHeader (memo) — identitas hanya
  // berubah saat showSearch berubah (saat itulah header memang harus
  // ganti mode pencarian/tidak).
  const toggleSearch = useCallback(() => {
    if (showSearch) {
      setSearchQuery("");
      setShowSearch(false);
      Keyboard.dismiss();
    } else {
      // Fase 3 Library: fokus ditangani SearchInput (autoFocus saat
      // baris pencarian tampil), bukan ref + setTimeout.
      setShowSearch(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [showSearch]);

  const onRefresh = useCallback(() => {
    return refreshLibrary(true);
  }, [refreshLibrary]);

  // ── Render Helpers ─────────────────────────────────────────────────────────
  // Header DULU fungsi polos di sini (renderHeader) — pindah ke
  // LibraryHeader (memo, di atas) yang melanggan potongannya sendiri.

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
                {selectedDuration
                  ? ` • ${formatTime(selectedDuration)}`
                  : ""}
                {selectedPlaylist &&
                isSmartPlaylistId(selectedPlaylist.id)
                  ? " • Otomatis"
                  : ""}
              </Text>
            </View>
            {/* Ronde 9 (fix 3): sembunyikan tombol hapus untuk
                "Lagu Disukai" — pola yang sama dengan layar drawer
                Playlist. Tombol "+" (tambah lagu, entry B1) ikut
                disembunyikan: "Lagu Disukai" bukan playlist DB.
                Smart playlist ikut disembunyikan (virtual, read-only). */}
            {!isReadOnlyPlaylistId(selectedPlaylist.id) && (
              <>
                <TouchableOpacity
                  onPress={() => setShowAddModal(true)}
                  style={s.backBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Tambah lagu ke playlist"
                >
                  <Plus size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeletePlaylist}
                  style={s.backBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Hapus playlist"
                >
                  <Trash2 size={20} color={colors.status.error} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {selectedPlaylist &&
          isSmartPlaylistId(selectedPlaylist.id) &&
          smartLoading ? (
            <View style={s.center}>
              <ScreenLoading message="Memuat playlist otomatis..." />
            </View>
          ) : selectedSongs.length === 0 ? (
            <View style={s.center}>
              <EmptyState
                title="Belum ada lagu di playlist ini."
                icon={<Music2 size={40} color={colors.text.tertiary} />}
              />
            </View>
          ) : (
            <FlashList
              data={selectedSongs}
              keyExtractor={songKeyExtractor}
              contentContainerStyle={listContentStyle}
              renderItem={renderPlaylistSongItem}
              extraData={currentSongId}
              // Fling-blank fix: buffer render tiap sisi viewport
              // (lihat LIBRARY_DRAW_DISTANCE_DP).
              drawDistance={LIBRARY_DRAW_DISTANCE_DP}
              // [FLING] diagnostik sementara (drawDistance 100): satu
              // baris per fling (mulai/selesai momentum), bukan per scroll.
              onMomentumScrollBegin={(e) =>
                noteFlingStart("playlist", e.nativeEvent.contentOffset.y)
              }
              onMomentumScrollEnd={(e) =>
                noteFlingEnd("playlist", e.nativeEvent.contentOffset.y)
              }
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
          {/* Fase 3 Library: keadaan galat bersama (ErrorState),
              bukan cabang inline dengan tombol retry sendiri. */}
          <ErrorState
            title="Gagal memuat library"
            message={libraryError}
            actionLabel="Coba lagi"
            onActionPress={onRefresh}
          />
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
        // Batas 2 animasi notif: EmptyLibrary hanya terima flag scan —
        // statusnya statis ("Memindai library…"); angka progres hidup
        // di bar LibraryTabBar.
        <EmptyLibrary
          colors={colors}
          onScan={handleManualRescan}
          isScanning={isManualScanning || isAutoScanning}
        />
      );
    }
 
    switch (activeTab) {
      case "song":
        return (
          <FlashList
            data={filteredSource}
            keyExtractor={songKeyExtractor}
            contentContainerStyle={listContentStyle}
            renderItem={renderSongItem}
            extraData={currentSongId}
            // Fling-blank fix: buffer render tiap sisi viewport
            // (lihat LIBRARY_DRAW_DISTANCE_DP).
            drawDistance={LIBRARY_DRAW_DISTANCE_DP}
            // U-P1-39: pull-to-refresh — RefreshControl diimpor tapi dulu
            // tidak pernah dipakai.
            refreshControl={songsRefreshControl}
            // N2: library terpotong diam-diam di 1000 lagu — `loadMore`
            // dulu tidak pernah dipanggil siapa pun. Tab Songs kini
            // memuat halaman berikut saat mendekati ujung daftar.
            // Tab lain (album/artis/...) membaca filteredSource yang
            // sama, jadi ikut membesar tanpa onEndReached sendiri.
            // Guard di loadMore (hasMore / loading / promise in-flight)
            // menahan pemanggilan ganda; habisnya halaman ditandai
            // hasMore=false saat satu halaman kembali < limit.
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            // [FLING] diagnostik sementara (drawDistance 100): satu
            // baris per fling (mulai/selesai momentum), bukan per scroll.
            onMomentumScrollBegin={(e) =>
              noteFlingStart("songs", e.nativeEvent.contentOffset.y)
            }
            onMomentumScrollEnd={(e) =>
              noteFlingEnd("songs", e.nativeEvent.contentOffset.y)
            }
          />
        );
      case "album":
        return (
          <AlbumGrid
            tracks={filteredSource}
            currentTrackId={currentSongId}
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
      currentTrackId={currentSongId}
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
            currentTrackId={currentSongId}
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
            currentTrackId={currentSongId}
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
            currentTrackId={currentSongId}
            favoriteIds={favoriteIdSet}
            onSongPress={handleSongPress} // Pakai bridge
            onToggleFavorite={toggleFavorite}
          />
        );
      case "playlist":
        return (
          <PlaylistList
            playlists={playlistItems}
            smartPlaylists={smartItems}
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

  // ── Stabilisasi FlashList (lazyload-fix butir 2) ─────────────────────────
  // Dulu renderItem/keyExtractor/contentContainerStyle/refreshControl dibuat
  // ulang (inline) tiap render layar — FlashList (PureComponent) melihat
  // prop baru dan me-render ulang list, tepat saat fling. Sekarang semuanya
  // referensi stabil: renderItem hanya berubah bila lagu yang diputar /
  // favorit / warna / antrean berubah. `extraData={currentSongId}` memberi
  // tahu FlashList untuk me-render ulang baris saat lagu yang diputar
  // berganti, walau `data` tidak berubah. Semua dep di bawah stabil selama
  // playback (isFavorite: useCallback atas favoriteIds; toggleFavorite:
  // aksi store; handleSongPress: useCallback atas playSong; filteredSource /
  // selectedSongs: useMemo).
  const listContentStyle = useMemo(
    () => ({ paddingBottom: FLOATING_BOTTOM, paddingHorizontal: 12 }),
    [FLOATING_BOTTOM],
  );

  const renderSongItem = useCallback(
    ({ item }: { item: Song }) => (
      <SongListItem
        item={item as any}
        isNowPlaying={currentSongId === item.id}
        isFavorite={isFavorite(item.id)}
        colors={colors}
        // Gunakan handleSongPress agar konsisten
        onPress={() => {
          handleSongPress(item, filteredSource);
        }}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [
      currentSongId,
      isFavorite,
      colors,
      handleSongPress,
      toggleFavorite,
      filteredSource,
    ],
  );

  const renderPlaylistSongItem = useCallback(
    ({ item }: { item: Song }) => (
      <SongListItem
        item={item as any}
        isNowPlaying={currentSongId === item.id}
        isFavorite={isFavorite(item.id)}
        colors={colors}
        onPress={() => {
          handleSongPress(item, selectedSongs);
        }}
        onToggleFavorite={toggleFavorite}
        // Item CRUD playlist: tombol × hanya untuk playlist DB —
        // "Lagu Disukai" + smart playlist bukan playlist, jadi tidak
        // ada hapus item. `handleRemoveSong` (useCallback) diteruskan
        // LANGSUNG, bukan arrow inline: identitasnya stabil selama
        // playlist tidak berganti, jadi komparator kustom SongListItem
        // tidak batal — dulu `() => void handleRemoveSong(item)` baru
        // tiap render dan selalu menggagalkan komparator. Pola yang
        // sama sudah dipakai layar drawer Playlist. (Alternatif yang
        // TIDAK dipakai: mengeluarkan onRemove dari komparator —
        // closure lama akan tertinggal saat ganti playlist dengan lagu
        // yang sama, tombol × menghapus dari playlist yang salah.)
        onRemove={
          selectedPlaylist && !isReadOnlyPlaylistId(selectedPlaylist.id)
            ? handleRemoveSong
            : undefined
        }
      />
    ),
    [
      currentSongId,
      isFavorite,
      colors,
      handleSongPress,
      toggleFavorite,
      selectedSongs,
      selectedPlaylist,
      handleRemoveSong,
    ],
  );

  const songsRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.primary[500]}
        colors={[colors.primary[500]]}
      />
    ),
    [refreshing, onRefresh, colors],
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 8, paddingHorizontal: 20 },
        ]}
      >
        <LibraryHeader
          showSearch={showSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onToggleSearch={toggleSearch}
          filterType={filterType}
          setFilterType={setFilterType}
          onEnhanceMetadata={handleEnhanceMetadata}
          onManualRescan={handleManualRescan}
          onCancelScan={cancelScan}
        />
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

      {/* Tab Bar — per-node render: angka progres dilanggan TabBar
          sendiri (hook per kelompok pemakai), bukan dioper dari layar. */}
      <LibraryTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={onRefresh}
      />

      {/* Statistik Mendengarkan (item 10): kartu ringkas → layar
          statistik. Satu baris tetap di atas konten semua tab supaya
          mudah ditemukan tanpa memakan tempat daftar. */}
      <TouchableOpacity
        style={[
          s.statsCard,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
          },
        ]}
        onPress={() => router.push("/(drawer)/stats")}
        accessibilityRole="button"
        accessibilityLabel="Buka Statistik Mendengarkan"
      >
        <TrendingUp size={20} color={colors.primary[500]} />
        <View style={s.statsCardText}>
          <Text
            style={[s.statsCardTitle, { color: colors.text.primary }]}
          >
            Statistik Mendengarkan
          </Text>
          <Text style={[s.statsCardSub, { color: colors.text.tertiary }]}>
            Artis & lagu teratas, jam dengar, streak
          </Text>
        </View>
        <ChevronRight size={18} color={colors.text.secondary} />
      </TouchableOpacity>

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

      {/* Fase 3 Library: hapus playlist lewat ConfirmDialog. */}
      <ConfirmDialog
        visible={showDeleteDialog}
        title="Hapus Playlist"
        message={
          selectedPlaylist
            ? `Hapus playlist "${selectedPlaylist.name}"?`
            : undefined
        }
        confirmLabel="Hapus"
        onConfirm={handleConfirmDeletePlaylist}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* Item CRUD playlist di detail view (entry B1): modal pilih lagu
          dari Library — komponen yang sama dengan layar drawer Playlist. */}
      {selectedPlaylist && (
        <AddSongsModal
          visible={showAddModal}
          playlistName={selectedPlaylist.name}
          existingSongIds={selectedFull?.songIds ?? []}
          onAdd={(song) => void handleAddSong(song)}
          onClose={() => setShowAddModal(false)}
        />
      )}
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
      fontSize: 16,
      // FASE 3 (1): judul layar Playfair Display lewat token (seperti
      // judul lagu Player) — keluarga Bold sudah membawa bobotnya.
      fontFamily: FONT_FAMILY.displayBold,
      letterSpacing: 3,
      textTransform: "uppercase",
    },
    headerStats: {
      fontSize: 10,
      fontFamily: FONT_FAMILY.medium,
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
      borderRadius: BASE_RADIUS.sm,
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
      fontFamily: FONT_FAMILY.bold,
      color: colors.primary[500],
    },
    enhanceBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BASE_RADIUS.md,
      gap: 4,
      backgroundColor: colors.status.success + "20",
    },
    enhanceBadgeText: {
      fontSize: 12,
      fontFamily: FONT_FAMILY.bold,
      color: colors.status.success,
    },
    // (Fase 3 Library: searchBar/searchInput dihapus — SearchInput
    // bersama yang dipakai, gayanya dari buildSearchInputStyles.)
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    filterBadge: {
      alignSelf: "center",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BASE_RADIUS.md,
      marginBottom: 8,
    },
    filterBadgeText: {
      fontSize: 10,
      fontFamily: FONT_FAMILY.bold,
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
    // (Fase 3 Library: emptyTitle/emptySub/retryBtn dihapus —
    // cabang galat kini memakai ErrorState bersama.)
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: BASE_RADIUS.md,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 13,
      fontFamily: FONT_FAMILY.medium,
    },
    retryBtnText: {
      fontSize: 14,
      fontFamily: FONT_FAMILY.bold,
    },
    // Statistik Mendengarkan (item 10): kartu ringkas di atas konten —
    // satu baris, ikon + judul + subjudul + chevron.
    statsCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: BASE_RADIUS.md,
      borderWidth: 1,
    },
    statsCardText: { flex: 1 },
    statsCardTitle: {
      fontSize: 15,
      fontFamily: FONT_FAMILY.semiBold,
    },
    statsCardSub: {
      fontSize: 12,
      fontFamily: FONT_FAMILY.regular,
      marginTop: 1,
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
      // FASE 3 (1): judul detail playlist = heading display (Playfair),
      // peran h4 (20/28).
      fontFamily: FONT_FAMILY.displayBold,
      lineHeight: 28,
    },
    detailSubtitle: {
      fontSize: 13,
      fontFamily: FONT_FAMILY.regular,
      marginTop: 2,
    },
  }); 