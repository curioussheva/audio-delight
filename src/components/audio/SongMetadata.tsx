// Di src/components/audio/SongMetadata.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { Song } from "@/types/audio";

interface SongMetadataProps {
  song: Song;
}

export const SongMetadata: React.FC<SongMetadataProps> = ({ song }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const getQualityBadge = () => {
    const bitrate = song.format?.bitrate || 0;

    if (bitrate > 800) return { label: "Hi-Res", color: colors.primary[500] };
    if (bitrate > 320)
      return { label: "CD Quality", color: colors.status.success };
    if (bitrate > 192) return { label: "High", color: colors.status.warning };
    return { label: "Standard", color: colors.text.secondary };
  };

  const quality = getQualityBadge();

  return (
    <View style={styles.container}>
      <Text
        style={[styles.title, { color: colors.text.primary }]}
        numberOfLines={1}
      >
        {song.title}
      </Text>

      <Text
        style={[styles.artist, { color: colors.text.secondary }]}
        numberOfLines={1}
      >
        {song.artist} • {song.album || "Unknown Album"}
      </Text>

      <View style={[styles.metaRow, { marginVertical: spacing.xs }]}>
        {song.year && (
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {song.year}
          </Text>
        )}
        {song.genre && (
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            {song.genre}
          </Text>
        )}
        <View style={[styles.badge, { backgroundColor: quality.color + "20" }]}>
          <Text style={[styles.badgeText, { color: quality.color }]}>
            {quality.label}
          </Text>
        </View>
      </View>

      <View style={[styles.formatRow, { marginBottom: spacing.sm }]}>
        <Text style={[styles.format, { color: colors.text.tertiary }]}>
          {song.format?.codec} • {song.format?.sampleRate / 1000}kHz
          {song.format?.bitDepth ? ` • ${song.format.bitDepth}bit` : ""}
        </Text>
        {song.format?.bitrate && (
          <Text style={[styles.bitrate, { color: colors.text.tertiary }]}>
            {song.format.bitrate}kbps
          </Text>
        )}
      </View>
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
  artist: {
    fontSize: 14,
    fontWeight: "400",
  },
  queueArtist: {
    fontSize: 12,
  },
  queueDuration: {
    fontSize: 12,
  },
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
