// src/app/search.tsx
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import { ScreenLoading } from "@/shared/components/ui/ScreenLoading";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { useLibrary } from "@/features/library/hooks/useLibrary";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { formatTime } from "@/shared/utils/time";

export default function SearchScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Tombol kembali (2026-11-11, perbaikan U-P0-8): layar ini dulu tidak
  // punya affordance kembali sama sekali (headerShown: false global).
  // Kalau dibuka dari drawer tidak ada history untuk back() — jatuh ke
  // Library supaya tombolnya tidak pernah jadi no-op.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(drawer)/(tabs)/library");
  };

  // U-P1-40: loading/error dibaca — dulu "Tidak ada hasil" tampil padahal
  // library masih memuat, dan gagal muat sunyi total.
  const { songs, loading, error, reload } = useLibrary();
  // U-P1-16: putar lewat playerStore.playSong — sama seperti Library —
  // bukan setQueue + loadSong langsung. playSong memberi dedupe tap-cepat,
  // bookkeeping queue/index store, isPlaying store, dan play count;
  // loadSong (useAudioPlayer) melewati semuanya dan hanya menyetel
  // currentSong + isPlaying lokal hook.
  const { playSong } = usePlayerStore();

  const [query, setQuery] = useState("");

  const [filterBy, setFilterBy] = useState<
    "all" | "title" | "artist" | "album"
  >("all");

  const results = useMemo(() => {
    if (!query) return [];

    const q = query.toLowerCase();
    return songs.filter((song) => {
      switch (filterBy) {
        case "title":
          return song.title.toLowerCase().includes(q);
        case "artist":
          return song.artist.toLowerCase().includes(q);
        case "album":
          return song.album?.toLowerCase().includes(q);
        default:
          return (
            song.title.toLowerCase().includes(q) ||
            song.artist.toLowerCase().includes(q) ||
            song.album?.toLowerCase().includes(q)
          );
      }
    });
  }, [songs, query, filterBy]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      {/* Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.md,
            paddingTop: insets.top + spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
        {/* Header: tombol kembali + judul */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: spacing.sm,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={8}
            accessibilityLabel="Kembali"
            accessibilityRole="button"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.text.primary,
              marginLeft: spacing.xs,
            }}
          >
            Cari
          </Text>
        </View>
        <View
          style={[
            styles.searchInput,
            {
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.background.secondary,
              borderRadius: 8,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.text.secondary} />
          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                paddingVertical: spacing.sm,
                marginLeft: spacing.sm,
                color: colors.text.primary,
              },
            ]}
            placeholder="Cari lagu, artis, album..."
            placeholderTextColor={colors.text.tertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Chips */}
        <View
          style={[
            styles.filterRow,
            {
              flexDirection: "row",
              marginTop: spacing.sm,
              gap: spacing.xs,
            },
          ]}
        >
          {(["all", "title", "artist", "album"] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                {
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: 16,
                  backgroundColor:
                    filterBy === filter
                      ? colors.primary[500]
                      : colors.background.secondary,
                },
              ]}
              onPress={() => setFilterBy(filter)}
            >
              <Text
                style={{
                  color:
                    filterBy === filter
                      ? colors.background.primary
                      : colors.text.secondary,
                  fontSize: 12,
                }}
              >
                {filter === "all" ? "Semua" : filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Results — U-P2-53: daftar hasil lewat pola daftar bersama
          (jalur FlashList: daftar vertikal panjang, bukan bersarang). */}
      <ScreenList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.resultItem,
              {
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.background.tertiary,
              },
            ]}
            onPress={() => {
              // Antrean = hasil pencarian saat ini; playSong menaruh lagu
              // yang di-tap di index 0 (reorder internal) seperti di Library.
              playSong(item, results);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.resultTitle, { color: colors.text.primary }]}
              >
                {item.title}
              </Text>
              <Text
                style={[styles.resultSub, { color: colors.text.secondary }]}
              >
                {item.artist} • {item.album}
              </Text>
            </View>
            <Text
              style={[styles.resultDuration, { color: colors.text.tertiary }]}
            >
              {formatTime(item.duration)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !query ? null : loading ? (
            <View
              style={[
                styles.emptyContainer,
                {
                  padding: spacing.xl,
                  alignItems: "center",
                },
              ]}
            >
              {/* U-P2-53: pola loading bersama. Cabang error di bawah
                  sengaja tidak dimigrasikan (state error + retry). */}
              <ScreenLoading message="Memuat library…" />
            </View>
          ) : error ? (
            <View
              style={[
                styles.emptyContainer,
                {
                  padding: spacing.xl,
                  alignItems: "center",
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={colors.status.error}
              />
              <Text
                style={[styles.emptyText, { color: colors.text.secondary }]}
              >
                Gagal memuat library
              </Text>
              <Text
                style={[styles.emptySub, { color: colors.text.tertiary }]}
              >
                {error}
              </Text>
              <TouchableOpacity
                onPress={() => void reload()}
                style={[
                  styles.retryBtn,
                  { borderColor: colors.primary[500] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Coba lagi memuat library"
              >
                <Text
                  style={[styles.retryBtnText, { color: colors.primary[500] }]}
                >
                  Coba lagi
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={[
                styles.emptyContainer,
                {
                  padding: spacing.xl,
                  alignItems: "center",
                },
              ]}
            >
              {/* U-P2-53: empty state bersama. */}
              <EmptyState
                title="Tidak ada hasil"
                icon={
                  <Ionicons
                    name="search-outline"
                    size={48}
                    color={colors.text.tertiary}
                  />
                }
              />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    // style di-inline
  },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
  },
  filterRow: {
    flexDirection: "row",
  },
  filterChip: {
    borderRadius: 16,
  },
  resultItem: {
    // style di-inline
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  resultSub: {
    fontSize: 12,
  },
  resultDuration: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
