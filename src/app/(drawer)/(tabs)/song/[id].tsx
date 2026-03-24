import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useLibrary } from "@/features/library/hooks/useLibrary";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import { Song } from "@/shared/types/audio";

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const { songs } = useLibrary();
  const { isFavorite, toggleFavorite } = useFavorites(); // Gunakan tanpa argumen jika hook sudah mendukung context

  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    const found = songs.find((s: Song) => s.id === id);
    if (found) {
      setSong(found);
    }
  }, [id, songs]);

  if (!song) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: colors.background.primary },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const favorite = isFavorite(song.id);

  const formatBitrate = (br?: number) => {
    if (!br) return "---";
    return br > 1000 ? `${(br / 1000).toFixed(1)} Mbps` : `${br} kbps`;
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            padding: spacing.md,
            paddingTop: 60, // Sesuaikan dengan safe area
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          FILE INFORMATION
        </Text>
        <TouchableOpacity onPress={() => toggleFavorite(song.id)}>
          <Ionicons
            name={favorite ? "heart" : "heart-outline"}
            size={24}
            color={favorite ? colors.status.error : colors.text.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Song Info Header */}
      <View style={[styles.infoContainer, { padding: spacing.xl }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {song.title}
        </Text>
        <Text style={[styles.artist, { color: colors.text.secondary }]}>
          {song.artist}
        </Text>

        <View style={{ marginTop: spacing.md }}>
          <QualityBadge
            sampleRate={song.sampleRate}
            bitDepth={song.bitDepth}
            codec={song.codec}
            isHiRes={(song.sampleRate || 0) > 48000}
          />
        </View>
      </View>

      <View style={styles.sectionContainer}>
        {/* Technical Specs Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            AUDIO PROPERTIES
          </Text>

          <DetailRow
            label="Format"
            value={(song.codec || "Unknown").toUpperCase()}
            color={colors}
          />
          <DetailRow
            label="Sample Rate"
            value={
              song.sampleRate ? `${song.sampleRate / 1000} kHz` : "44.1 kHz"
            }
            color={colors}
          />
          <DetailRow
            label="Bit Depth"
            value={song.bitDepth ? `${song.bitDepth}-bit` : "16-bit"}
            color={colors}
          />
          <DetailRow
            label="Bitrate"
            value={formatBitrate(song.bitrate)}
            color={colors}
          />
          <DetailRow
            label="Duration"
            value={formatDuration(song.duration)}
            color={colors}
          />
          <DetailRow label="Channel Mode" value="Stereo" color={colors} />
        </View>

        {/* File Path Card (Sangat berguna untuk Audiophile) */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.background.secondary,
              marginTop: spacing.md,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            SOURCE PATH
          </Text>
          <Text
            style={{
              color: colors.text.tertiary,
              fontSize: 11,
              fontStyle: "italic",
            }}
          >
            {song.uri || "Local Storage"}
          </Text>
        </View>
      </View>

      {/* Action Bar */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: colors.primary[500] }]}
          onPress={() => {
            // Gunakan router untuk navigasi ke player atau panggil playback service
            router.push("/player");
          }}
        >
          <Ionicons name="play" size={20} color="#000" />
          <Text style={styles.playButtonText}>PLAY THIS FILE</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const DetailRow = ({ label, value, color }: any) => (
  <View style={styles.detailRow}>
    <Text style={{ color: color.text.secondary, fontSize: 13 }}>{label}</Text>
    <Text
      style={{ color: color.text.primary, fontWeight: "600", fontSize: 13 }}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  infoContainer: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  artist: { fontSize: 16, marginTop: 4, opacity: 0.8 },
  sectionContainer: { paddingHorizontal: 20 },
  card: { padding: 18, borderRadius: 16 },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 14,
    opacity: 0.5,
    letterSpacing: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  actionRow: { padding: 24 },
  playButton: {
    flexDirection: "row",
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 8,
    shadowColor: "#00D4AA",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  playButtonText: { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
});
