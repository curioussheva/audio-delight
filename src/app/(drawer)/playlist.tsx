// src/app/playlist.tsx
import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { useTheme } from "@/shared/context/ThemeContext";
import { usePlaylists } from "@/features/playlist/hooks/usePlaylists";
import { PlaylistList, PlaylistItem } from "@/features/library/components/PlaylistList";
import { parseM3U } from "@/features/library/api/m3u";

export default function PlaylistsScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  const { playlists, favoriteCount, createPlaylist, deletePlaylist, importM3UPaths } =
    usePlaylists();
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistItem | null>(null);

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
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {/* Implementasi Detail View Lagu di sini.
            Catatan: selectedPlaylist saat ini cuma { id, name, count }
            (bentuk PlaylistItem). Kalau detail view butuh daftar lagu
            lengkap, ambil ulang lewat playlists.find(p => p.id === selectedPlaylist.id)
            dari usePlaylists() — objek Playlist aslinya punya field
            `songs`/`songIds` lengkap yang tidak ada di PlaylistItem. */}
      </View>
    );
  }

  // ── Render Playlist List ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
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
});
 