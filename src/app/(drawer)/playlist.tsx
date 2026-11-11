// src/app/playlist.tsx
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  FlatList,
  TouchableOpacity,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ChevronLeft, Trash2, Music2 } from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { DrawerMenuButton } from "@/shared/components/ui/DrawerMenuButton";
import { usePlaylists } from "@/features/playlist/hooks/usePlaylists";
import { PlaylistList, PlaylistItem } from "@/features/library/components/PlaylistList";
import { SongListItem } from "@/features/library/components/SongListItem";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { formatTime } from "@/shared/utils/time";
import type { Song } from "@/shared/types/audio";
import { parseM3U } from "@/features/library/api/m3u";

export default function PlaylistsScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  const { playlists, createPlaylist, deletePlaylist, importM3UPaths } =
    usePlaylists();
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistItem | null>(null);

  const { playSong, currentSong } = usePlayerStore();

  // Playlist lengkap (dengan `songs`) untuk detail view — dicari di sini
  // (top-level) supaya hook di bawah tidak dipanggil kondisional.
  const selectedFull = useMemo(
    () =>
      selectedPlaylist
        ? playlists.find((p) => p.id === selectedPlaylist.id)
        : undefined,
    [playlists, selectedPlaylist],
  );
  const selectedSongs: Song[] = selectedFull?.songs ?? [];
  // U-P1-17: favorit dibaca dari sumber kebenaran tunggal (kolom
  // songs.isFavorite via libraryStore). favoriteCount dulu placeholder 0.
  const { isFavorite, toggleFavorite, favoriteSongs } = useFavorites();
  const favoriteCount = favoriteSongs.length;

  const handleSongPress = useCallback(
    (song: Song) => {
      playSong(song, selectedSongs);
    },
    [playSong, selectedSongs],
  );

  const handleDeletePlaylist = useCallback(() => {
    if (!selectedPlaylist) return;
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

  // ── Handler: Buat Playlist Baru ──────────────────────────────────────────
  const handleCreateNew = useCallback(() => {
    Alert.prompt(
      "Buat Playlist Baru",
      "Masukkan nama playlist",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Buat",
          onPress: (name?: string) => {
            if (name && name.trim()) {
              createPlaylist({ name: name.trim(), songIds: [] });
            }
          },
        },
      ],
      "plain-text"
    );
  }, [createPlaylist]);

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

        Alert.alert(
          "Import Berhasil",
          skippedCount > 0
            ? `Playlist "${originalName}" ditambahkan (${matchedCount} track cocok, ${skippedCount} track dilewati karena tidak ditemukan di library).`
            : `Playlist "${originalName}" berhasil ditambahkan (${matchedCount} track).`
        );
      } else {
        Alert.alert("Import Gagal", "File M3U/M3U8 kosong atau format tidak valid.");
      }
    } catch (error) {
      console.error("[M3U Import Error]:", error);
      Alert.alert("Error", "Gagal membaca file M3U/M3U8.");
    }
  }, [importM3UPaths]);

  // ── Handler: Klik Row Playlist ───────────────────────────────────────────
  const handlePlaylistPress = useCallback((playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist);
  }, []);

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
              {selectedFull?.duration
                ? ` • ${formatTime(selectedFull.duration)}`
                : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDeletePlaylist}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Trash2 size={20} color={colors.status.error} />
          </TouchableOpacity>
        </View>

        {selectedSongs.length === 0 ? (
          <View style={styles.emptyDetail}>
            <Music2 size={40} color={colors.text.tertiary} />
            <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
              Belum ada lagu di playlist ini.
            </Text>
          </View>
        ) : (
          <FlatList
            data={selectedSongs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SongListItem
                item={item}
                isNowPlaying={currentSong?.id === item.id}
                isFavorite={isFavorite(item.id)}
                colors={colors}
                onPress={handleSongPress}
                onToggleFavorite={toggleFavorite}
              />
            )}
          />
        )}
      </View>
    );
  }

  // ── Render Playlist List ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* U-P2-49: daftar playlist dulu tanpa judul layar yang terlihat dan
          tanpa affordance buka drawer — hanya edge-swipe / hardware back.
          Detail playlist tetap memakai header kembali-nya sendiri. */}
      <View style={styles.listHeader}>
        <DrawerMenuButton />
        <Text style={[styles.listTitle, { color: colors.text.primary }]}>
          Playlist
        </Text>
      </View>
      <PlaylistList
        playlists={playlistItems}
        favoriteCount={favoriteCount || 0}
        onPlaylistPress={handlePlaylistPress}
        onCreateNew={handleCreateNew}
        onImportM3U={handleImportM3U}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // U-P2-49: header daftar playlist (hamburger + judul).
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: "700",
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
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
 