// src/features/playlist/components/AddSongsModal.tsx
//
// Modal pilih lagu untuk ditambahkan ke playlist (item CRUD, entry B1).
//
// Pola mengikuti CreatePlaylistModal (Modal RN + overlay + SectionCard
// dari buildDialogStyles). Tiap lagu yang ditekan langsung ditambahkan
// lewat onAdd + toast di pemanggil; modal tetap terbuka sampai tombol
// "Selesai" supaya bisa tambah beberapa lagu sekaligus. Lagu yang sudah
// ada di playlist tampil bertanda centang dan tidak bisa ditekan lagi.
//
// Daftar lagu dibaca dari useLibraryStore (tracks ter-persist di
// AsyncStorage, jadi tersedia walau tab Library belum dibuka sesi ini).
// MediaTrack dipakai sebagai Song di sini: modal hanya membaca
// id/title/artist/album/duration, semua ada di kedua tipe.
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check, Music2, Plus } from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { buildDialogStyles } from "@/shared/utils/uiStyles";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { SearchInput } from "@/shared/components/ui/SearchInput";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { filterSongsByQuery } from "@/features/playlist/utils/filterSongs";
import { formatTime } from "@/shared/utils/time";
import type { Song } from "@/shared/types/audio";
import type { Theme } from "@/shared/constants/themes/types";

interface AddSongsModalProps {
  visible: boolean;
  playlistName: string;
  /** Id lagu yang sudah ada di playlist — tampil centang, tidak bisa ditekan. */
  existingSongIds: string[];
  /** Dipanggil tiap lagu ditekan (sudah termasuk toast di pemanggil). */
  onAdd: (song: Song) => void;
  onClose: () => void;
}

function PickerSongRow({
  song,
  added,
  onAdd,
}: {
  song: Song;
  added: boolean;
  onAdd: (song: Song) => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <TouchableOpacity
      onPress={() => onAdd(song)}
      disabled={added}
      activeOpacity={0.7}
      style={[styles.row, added && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={
        added
          ? `${song.title} sudah di playlist`
          : `Tambah ${song.title} ke playlist`
      }
    >
      <View style={styles.rowInfo}>
        <Text
          style={[styles.rowTitle, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {song.title || song.filename}
        </Text>
        <Text
          style={[styles.rowSub, { color: colors.text.secondary }]}
          numberOfLines={1}
        >
          {song.artist} • {formatTime(song.duration)}
        </Text>
      </View>
      {added ? (
        <Check size={20} color={colors.accent.primary} />
      ) : (
        <Plus size={20} color={colors.accent.primary} />
      )}
    </TouchableOpacity>
  );
}

// Per-node render (2026-11-22): memo — pemanggil (playlist.tsx) sudah
// menstabilkan onAdd/onClose, jadi modal tidak ikut render ulang layar.
// (Tanpa memo + callback stabil, tiap render induk membangunkan modal.)
export const AddSongsModal: React.FC<AddSongsModalProps> = memo(({
  visible,
  playlistName,
  existingSongIds,
  onAdd,
  onClose,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const dialogStyles = useThemedStyles(
    useCallback((t: Theme) => buildDialogStyles(t), []),
  );

  const tracks = useLibraryStore((s) => s.tracks) as unknown as Song[];
  const [query, setQuery] = useState("");

  // Reset pencarian setiap kali modal dibuka — query dari pemakaian
  // sebelumnya tidak boleh terbawa (pola yang sama dengan
  // CreatePlaylistModal).
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const existingIds = useMemo(
    () => new Set(existingSongIds),
    [existingSongIds],
  );
  const filtered = useMemo(
    () => filterSongsByQuery(tracks, query),
    [tracks, query],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={dialogStyles.overlay}>
        <SectionCard
          style={{
            borderRadius: theme.radius.lg,
            gap: theme.spacing.md,
            maxHeight: "85%",
          }}
        >
          <Text style={dialogStyles.title}>Tambah Lagu</Text>
          <Text style={dialogStyles.message}>Ke "{playlistName}"</Text>

          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cari lagu, artis, album..."
          />

          <View style={styles.listWrap}>
            <ScreenList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PickerSongRow
                  song={item}
                  added={existingIds.has(item.id)}
                  onAdd={onAdd}
                />
              )}
              ListEmptyComponent={
                <EmptyState
                  title={
                    tracks.length === 0
                      ? "Belum ada lagu di library."
                      : "Tidak ada lagu yang cocok."
                  }
                  icon={<Music2 size={40} color={colors.text.tertiary} />}
                />
              }
            />
          </View>

          <PristineButton
            label="Selesai"
            variant="secondary"
            fullWidth
            onPress={onClose}
            surface={theme.colors.background.elevated}
          />
        </SectionCard>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  // Daftar mengisi sisa kartu (min. 320 supaya ~6 lagu terlihat);
  // kartu dibatasi maxHeight 85% overlay, jadi daftar men-scroll
  // bila library panjang.
  listWrap: {
    flex: 1,
    minHeight: 320,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowSub: {
    fontSize: 12,
  },
});
