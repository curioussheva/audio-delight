// src/features/player/components/QueueManager.tsx
//
// Antrean pemutaran — LIHAT + KETUK UNTUK LOMPAT SAJA (A5, 2026-11-18).
//
// KENAPA TANPA REORDER/HAPUS: queue yang benar-benar diputar dipegang
// NATIVE (NativePlaybackService.setQueue hanya full-replace, tanpa API
// reorder/remove; playNext/playPrevious/auto-advance memanggil native
// next()/previous()). Store setQueue HANYA mengubah state JS — reorder
// di sini akan menampilkan satu urutan dan memutar urutan lain, lalu
// handleTrackChanged menyinkronkan ulang dari native. Jadi daftar ini
// hanya menampilkan + ketuk untuk lompat (playSong, jalur lompat standar
// yang me-sync ulang native). Reorder penuh butuh API native reorder /
// store applyQueueOrder yang me-sync ulang native + menjaga posisi —
// ronde lanjutan, perlu verifikasi device (lihat player-fix-report.md).
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/shared/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { Song } from "@/shared/types/audio";
import { formatTime } from "@/shared/utils/time";

interface QueueManagerProps {
  onClose: () => void;
  visible: boolean;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  onClose,
  visible,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  // Per-node render (2026-11-22): dulu `usePlayerStore()` tanpa selector —
  // seluruh store dilanggan (tick posisi ikut me-render ulang modal
  // antrean yang bahkan sedang tersembunyi). Sekarang per nilai.
  const queue = usePlayerStore((state) => state.queue);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playSong = usePlayerStore((state) => state.playSong);

  if (!visible) return null;

  const renderQueueItem = ({ item }: { item: Song }) => {
    const isCurrent = currentSong?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.queueItem,
          {
            backgroundColor: isCurrent
              ? colors.primary[500] + "20"
              : "transparent",
            padding: spacing.sm,
            borderRadius: 8,
            marginBottom: spacing.xs,
          },
        ]}
        // A5: lompat lewat playSong (jalur standar — me-sync ulang native).
        // Bukan skipToIndex: indeks JS bisa bergeser dari indeks native
        // bila ada lagu tanpa URI yang terbuang filter di playSong.
        onPress={() => void playSong(item, queue)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} — ${item.artist}`}
        accessibilityState={{ selected: isCurrent }}
      >
        <View
          style={[
            styles.queueItemContent,
            { flexDirection: "row", alignItems: "center" },
          ]}
        >
          <View style={{ width: 30, alignItems: "center" }}>
            {isCurrent && (
              <Ionicons
                name="volume-high"
                size={16}
                color={colors.primary[500]}
              />
            )}
          </View>

          <View
            style={[
              styles.queueInfo,
              { flex: 1, marginHorizontal: spacing.sm },
            ]}
          >
            <Text
              style={[
                styles.queueTitle,
                {
                  color: isCurrent ? colors.primary[500] : colors.text.primary,
                  fontWeight: isCurrent ? "600" : "400",
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[styles.queueArtist, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {item.artist}
            </Text>
          </View>

          <Text style={[styles.queueDuration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background.primary, flex: 1 },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: spacing.md,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Berikutnya ({queue.length})
        </Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tutup antrean"
        >
          <Ionicons name="close" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={queue}
        keyExtractor={(item) => item.id}
        renderItem={renderQueueItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // style di-inline via props
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  // QueueManager specific
  queueItem: {
    // style di-inline
  },
  queueItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  queueArtist: {
    fontSize: 12,
  },
  queueDuration: {
    fontSize: 12,
  },
  // PlaybackSpeed specific
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  preset: {
    borderRadius: 20,
  },
  currentSpeed: {
    fontSize: 14,
    fontWeight: "600",
  },
  // SleepTimer specific
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  option: {
    borderRadius: 20,
  },
  activeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // SongMetadata specific
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  meta: {
    fontSize: 12,
    marginRight: 8,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  formatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  format: {
    fontSize: 12,
  },
  bitrate: {
    fontSize: 12,
    fontWeight: "500",
  },
});
