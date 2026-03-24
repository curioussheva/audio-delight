// src/app/playlist.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { usePlaylists } from "@/features/playlist/hooks/usePlaylists";
import { Playlist } from "@/features/playlist/types";

export default function PlaylistsScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const { playlists, deletePlaylist } = usePlaylists();

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null,
  );

  // Detail view
  if (selectedPlaylist) {
    return (
      <View>
        <Text>Detail Playlist (to be implemented)</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            padding: spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Playlists
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.playlistItem,
              {
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.background.tertiary,
              },
            ]}
            onPress={() => setSelectedPlaylist(item)}
            onLongPress={() => {
              Alert.alert("Hapus Playlist", `Hapus "${item.name}"?`, [
                { text: "Batal" },
                {
                  text: "Hapus",
                  style: "destructive",
                  onPress: () => deletePlaylist(item.id),
                },
              ]);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={[
                  styles.playlistIcon,
                  {
                    backgroundColor: colors.primary[500] + "20",
                    width: 50,
                    height: 50,
                    borderRadius: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: spacing.md,
                  },
                ]}
              >
                <Ionicons name="list" size={24} color={colors.primary[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.playlistName, { color: colors.text.primary }]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.playlistMeta,
                    { color: colors.text.secondary },
                  ]}
                >
                  {item.songCount} lagu • {Math.floor(item.duration / 60)} menit
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.text.secondary}
              />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  playlistItem: {
    // style di-inline
  },
  playlistIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  playlistName: {
    fontSize: 16,
    fontWeight: "600",
  },
  playlistMeta: {
    fontSize: 12,
  },
});
