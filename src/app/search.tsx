// src/app/search.tsx
import React, { useState, useMemo } from "react";
import { Song } from "@/types/audio";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useLibrary } from "@/hooks/useLibrary";
import { usePlayerStore } from "@/store/playerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatTime } from "@/utils/time";

export default function SearchScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const { songs } = useLibrary();
  const { setQueue } = usePlayerStore();
  const { loadSong } = useAudioPlayer();

  const [query, setQuery] = useState("");
  const _filteredSongs = songs.filter((song: Song) => {
    // Tambahkan tipe Song
    return song.title.toLowerCase().includes(query.toLowerCase());
  });

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
            padding: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
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

      {/* Results */}
      <FlatList
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
              setQueue([item]);
              loadSong(item);
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
          query ? (
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
                name="search-outline"
                size={48}
                color={colors.text.tertiary}
              />
              <Text
                style={[styles.emptyText, { color: colors.text.secondary }]}
              >
                Tidak ada hasil
              </Text>
            </View>
          ) : null
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
});
