// src/app/playlist.tsx
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ChevronLeft, Trash2, Music2, Plus } from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import { ScreenLoading } from "@/shared/components/ui/ScreenLoading";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { useToastStore } from "@/shared/store/toastStore";
import { usePlaylists } from "@/features/playlist/hooks/usePlaylists";
import {
  isSmartPlaylistId,
  SmartPlaylistId,
} from "@/features/playlist/utils/smartPlaylists";
import { CreatePlaylistModal } from "@/features/playlist/components/CreatePlaylistModal";
import { AddSongsModal } from "@/features/playlist/components/AddSongsModal";
import { PlaylistList, PlaylistItem } from "@/features/library/components/PlaylistList";
import { SongListItem } from "@/features/library/components/SongListItem";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { formatTime } from "@/shared/utils/time";
import type { Song } from "@/shared/types/audio";
import { parseM3U } from "@/features/library/api/m3u";

// Playlist virtual (bukan baris DB): "Lagu Disukai" + smart playlist —
// tidak ada tambah/hapus lagu, tidak bisa dihapus. Dipakai semua guard
// CRUD di detail view (tombol +, tong sampah, × per lagu).
const isReadOnlyPlaylistId = (id: string): boolean =>
  id === "favorites" || isSmartPlaylistId(id);

export default function PlaylistsScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  const {
    playlists,
    smartPlaylists,
    loadSmartPlaylist,
    createPlaylist,
    deletePlaylist,
    importM3UPaths,
    addToPlaylist,
    removeFromPlaylist,
  } = usePlaylists();
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistItem | null>(null);
  // B2 (ronde 9): dialog nama playlist lintas-platform — dulu
  // Alert.prompt (iOS-only, no-op di Android).
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Per-node render (2026-11-22): dulu `usePlayerStore()` TANPA selector —
  // SELURUH store dilanggan (tick posisi ~2/dtk me-render ulang layar
  // playlist + daftarnya selama playback). Sekarang hanya aksi playSong
  // + id lagu yang diputar (untuk isNowPlaying di baris detail).
  const playSong = usePlayerStore((state) => state.playSong);
  const currentSongId = usePlayerStore((state) => state.currentSong?.id);
  const showToast = useToastStore((s) => s.showToast);

  // Fase 2 redesign: hapus playlist lewat ConfirmDialog (satu-satunya
  // mekanisme konfirmasi), bukan Alert.alert.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Item CRUD playlist (entry B1): modal pilih lagu dari Library.
  const [showAddModal, setShowAddModal] = useState(false);
  // Smart playlist: lagunya dibaca dari SQLite saat baris ditekan
  // (bukan dari daftar playlist manual) — lihat efek di bawah.
  const [smartSongs, setSmartSongs] = useState<Song[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);

  // Playlist lengkap (dengan `songs`) untuk detail view — dicari di sini
  // (top-level) supaya hook di bawah tidak dipanggil kondisional.
  const selectedFull = useMemo(
    () =>
      selectedPlaylist
        ? playlists.find((p) => p.id === selectedPlaylist.id)
        : undefined,
    [playlists, selectedPlaylist],
  );
  // U-P1-17: favorit dibaca dari sumber kebenaran tunggal (kolom
  // songs.isFavorite via libraryStore). favoriteCount dulu placeholder 0.
  const { isFavorite, toggleFavorite, favoriteSongs } = useFavorites();
  const favoriteCount = favoriteSongs.length;

  // Ronde 9 (fix 3): "favorites" bukan playlist DB — lagunya dari
  // favoriteSongs, pola yang sama dengan tab library
  // (src/app/(drawer)/(tabs)/library.tsx). Dulu dicari di daftar
  // playlist DB → tidak ketemu → detail kosong (0 lagu).
  // Smart playlist: lagunya dari smartSongs (dibaca dari SQLite saat
  // ditekan, efek di bawah) — bukan dari daftar playlist manual.
  const selectedSongs: Song[] = useMemo(
    () =>
      selectedPlaylist?.id === "favorites"
        ? favoriteSongs
        : isSmartPlaylistId(selectedPlaylist?.id)
          ? smartSongs
          : (selectedFull?.songs ?? []),
    [selectedPlaylist, favoriteSongs, selectedFull, smartSongs],
  );
  const selectedDuration = useMemo(
    () =>
      selectedPlaylist && isSmartPlaylistId(selectedPlaylist.id)
        ? smartSongs.reduce((sum, s) => sum + (s.duration || 0), 0)
        : (selectedFull?.duration ?? 0),
    [selectedPlaylist, selectedFull, smartSongs],
  );

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
        console.error("[Playlist] Gagal memuat smart playlist:", err);
        if (!cancelled) setSmartSongs([]);
      })
      .finally(() => {
        if (!cancelled) setSmartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlaylist, loadSmartPlaylist]);

  const handleSongPress = useCallback(
    (song: Song) => {
      playSong(song, selectedSongs);
    },
    [playSong, selectedSongs],
  );

  const handleDeletePlaylist = useCallback(() => {
    // Ronde 9 (fix 3): "Lagu Disukai" bukan playlist DB — tidak bisa
    // dihapus; tombol hapusnya juga disembunyikan (lihat detail view).
    // Smart playlist ikut: virtual, read-only.
    if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
      return;
    setShowDeleteDialog(true);
  }, [selectedPlaylist]);

  const handleConfirmDeletePlaylist = useCallback(async () => {
    if (!selectedPlaylist) return;
    // FASE 4: hapus tetap lewat ConfirmDialog — toast ini hanya umpan
    // balik SESUDAH konfirmasi.
    // N7: deletePlaylist kini melempar bila tulis DB gagal — jangan tutup
    // detail + jangan toast "dihapus" saat playlist sebenarnya masih ada.
    const name = selectedPlaylist.name;
    try {
      await deletePlaylist(selectedPlaylist.id);
    } catch (error) {
      console.error("[Playlist] Gagal menghapus playlist:", error);
      showToast("Gagal menghapus playlist. Coba lagi.", "error");
      return;
    }
    setSelectedPlaylist(null);
    setShowDeleteDialog(false);
    showToast(`Playlist "${name}" dihapus.`, "info");
  }, [selectedPlaylist, deletePlaylist, showToast]);

  // Item CRUD playlist (Opsi A): hapus lagu dari playlist — LANGSUNG +
  // toast, tanpa dialog konfirmasi. Lagunya tetap ada di Library, jadi
  // ini bukan destruktif permanen (aturan Fase 2: dialog hanya untuk
  // destruktif). "Lagu Disukai" bukan playlist DB — tidak ada hapus item
  // di sana (onRemove tidak diteruskan, lihat renderItem).
  const handleRemoveSong = useCallback(
    async (song: Song) => {
      if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
        return;
      // N7: removeFromPlaylist kini melempar bila tulis DB gagal.
      try {
        await removeFromPlaylist(selectedPlaylist.id, song.id);
      } catch (error) {
        console.error("[Playlist] Gagal menghapus lagu dari playlist:", error);
        showToast("Gagal menghapus lagu dari playlist.", "error");
        return;
      }
      showToast(`"${song.title}" dihapus dari playlist.`, "info");
    },
    [selectedPlaylist, removeFromPlaylist, showToast],
  );

  // Item CRUD playlist (entry B1): tiap lagu yang ditekan di modal
  // langsung ditambahkan + toast; modal tetap terbuka sampai "Selesai"
  // supaya bisa tambah beberapa lagu sekaligus. Hook me-reload daftar
  // setelah tulis, jadi barisnya langsung berubah jadi centang.
  const handleAddSong = useCallback(
    async (song: Song) => {
      if (!selectedPlaylist || isReadOnlyPlaylistId(selectedPlaylist.id))
        return;
      // N7: addToPlaylist kini melempar bila tulis DB gagal.
      try {
        await addToPlaylist(selectedPlaylist.id, [song]);
      } catch (error) {
        console.error("[Playlist] Gagal menambah lagu ke playlist:", error);
        showToast("Gagal menambah lagu ke playlist.", "error");
        return;
      }
      showToast(`"${song.title}" ditambahkan ke playlist.`, "success");
    },
    [selectedPlaylist, addToPlaylist, showToast],
  );

  // Playlist (dari usePlaylists) pakai field `songCount`, sementara
  // PlaylistList/PlaylistRow mengharapkan `count` — mapping di sini
  // supaya "X tracks" di tiap row tidak selalu menampilkan 0.
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

  // ── Handler: Buat Playlist Baru ──────────────────────────────────────────
  // B2 (ronde 9): tap "Buat Playlist Baru" → buka modal; submit nama →
  // createPlaylist → tutup modal. Alert.prompt dihapus — iOS-only,
  // di Android no-op tanpa warning.
  const handleCreateNew = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleCreatePlaylistSubmit = useCallback(
    async (name: string) => {
      // FASE 4: "Playlist dibuat" kini punya rumah — toast sukses.
      // Gagal buat tetap di modal supaya user bisa perbaiki namanya.
      try {
        await createPlaylist({ name, songIds: [] });
        setShowCreateModal(false);
        showToast(`Playlist "${name}" dibuat.`, "success");
      } catch (error) {
        console.error("[Playlist] Gagal membuat playlist:", error);
        showToast("Gagal membuat playlist. Coba lagi.", "error");
      }
    },
    [createPlaylist, showToast],
  );

  // ── Handler: Import File M3U / M3U8 ──────────────────────────────────────
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
        file.name?.replace(/\.(m3u|m3u8)$/i, "") || parsedData?.name || "Imported Playlist";

      if (parsedData && parsedData.paths.length > 0) {
        // Simpan playlist baru dari hasil parse M3U/M3U8 — tiap path
        // lagu di-resolve ke songId di database lewat importM3UPaths
        const newPlaylist = await importM3UPaths(
          originalName,
          parsedData.paths,
        );

        const matchedCount = newPlaylist.songIds.length;
        const skippedCount = parsedData.paths.length - matchedCount;

        // Fase 2 redesign: umpan balik sukses lewat toast global,
        // bukan Alert.alert.
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

  // ── Handler: Klik Row Playlist ───────────────────────────────────────────
  const handlePlaylistPress = useCallback((playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist);
  }, []);

  // Per-node render (2026-11-22): onClose/onCancel modal dulu arrow inline
  // baru tiap render — memo AddSongsModal/CreatePlaylistModal/
  // ConfirmDialog (di bawah) batal karenanya. Sekarang useCallback [].
  const handleCloseAddModal = useCallback(() => setShowAddModal(false), []);
  const handleCloseCreateModal = useCallback(
    () => setShowCreateModal(false),
    [],
  );
  const handleCancelDelete = useCallback(
    () => setShowDeleteDialog(false),
    [],
  );

  // ── Render Detail View ────────────────────────────────────────────────────
  if (selectedPlaylist) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background.primary },
        ]}
      >
        {/* Header: kembali + nama + info + hapus */}
        <View style={styles.detailHeader}>
          <TouchableOpacity
            onPress={() => setSelectedPlaylist(null)}
            style={styles.backBtn}
            hitSlop={8}
          >
            <ChevronLeft size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.detailTitleWrap}>
            <Text
              style={[styles.detailTitle, { color: colors.text.primary }]}
              numberOfLines={1}
            >
              {selectedPlaylist.name}
            </Text>
            <Text
              style={[styles.detailSubtitle, { color: colors.text.secondary }]}
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
              "Lagu Disukai" — pola yang sama dengan tab library.
              Tombol "+" (tambah lagu, entry B1) ikut disembunyikan:
              "Lagu Disukai" bukan playlist DB. Smart playlist ikut
              disembunyikan (virtual, read-only). */}
          {!isReadOnlyPlaylistId(selectedPlaylist.id) && (
            <>
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={styles.backBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Tambah lagu ke playlist"
              >
                <Plus size={22} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeletePlaylist}
                style={styles.backBtn}
                hitSlop={8}
              >
                <Trash2 size={20} color={colors.status.error} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* U-P2-53: isi playlist lewat pola daftar bersama — jalur
            FlashList (daftar vertikal panjang, bukan bersarang). */}
        {selectedPlaylist &&
        isSmartPlaylistId(selectedPlaylist.id) &&
        smartLoading ? (
          <View style={styles.emptyDetail}>
            <ScreenLoading message="Memuat playlist otomatis..." />
          </View>
        ) : selectedSongs.length === 0 ? (
          <View style={styles.emptyDetail}>
            {/* U-P2-53: empty state bersama. */}
            <EmptyState
              title="Belum ada lagu di playlist ini."
              icon={<Music2 size={40} color={colors.text.tertiary} />}
            />
          </View>
        ) : (
          <ScreenList
            data={selectedSongs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SongListItem
                item={item}
                isNowPlaying={currentSongId === item.id}
                isFavorite={isFavorite(item.id)}
                colors={colors}
                onPress={handleSongPress}
                onToggleFavorite={toggleFavorite}
                onRemove={
                  isReadOnlyPlaylistId(selectedPlaylist.id)
                    ? undefined
                    : handleRemoveSong
                }
              />
            )}
          />
        )}

        {/* Fase 2 redesign: hapus playlist lewat ConfirmDialog. */}
        <ConfirmDialog
          visible={showDeleteDialog}
          title="Hapus Playlist"
          message={`Hapus playlist "${selectedPlaylist.name}"?`}
          confirmLabel="Hapus"
          onConfirm={handleConfirmDeletePlaylist}
          onCancel={handleCancelDelete}
        />

        {/* Item CRUD playlist (entry B1): modal pilih lagu dari Library. */}
        <AddSongsModal
          visible={showAddModal}
          playlistName={selectedPlaylist.name}
          existingSongIds={selectedFull?.songIds ?? []}
          onAdd={handleAddSong}
          onClose={handleCloseAddModal}
        />
      </View>
    );
  }

  // ── Render Playlist List ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* U-P2-53: header bersama. Detail playlist tetap memakai header
          kembali-nya sendiri (bukan header layar). */}
      <ScreenHeader title="Playlist" />
      <PlaylistList
        playlists={playlistItems}
        smartPlaylists={smartItems}
        favoriteCount={favoriteCount || 0}
        onPlaylistPress={handlePlaylistPress}
        onCreateNew={handleCreateNew}
        onImportM3U={handleImportM3U}
      />

      {/* B2 (ronde 9): dialog buat playlist lintas-platform. */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreatePlaylistSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  emptyDetail: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
 