import React, { memo } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Song } from "@/shared/types/audio";
import { formatTime } from "@/shared/utils/time";

// Komponen internal UI Anda
import QualityBadge from "@/shared/components/ui/QualityBadge";

// Icons - Menggunakan Music2 dan AudioLines untuk kesan lebih "Pro"
import { Music2, AudioLines, Heart, MoreVertical } from "lucide-react-native";

interface SongListItemProps {
  item: Song;
  isNowPlaying: boolean;
  isFavorite: boolean;
  colors: any;
  onPress: (song: Song) => void;
  onToggleFavorite: (id: string) => void;
  onMorePress?: (song: Song) => void; // Tambahan untuk menu context
}

export const SongListItem = memo(
  ({
    item,
    isNowPlaying,
    isFavorite,
    colors,
    onPress,
    onToggleFavorite,
    onMorePress,
  }: SongListItemProps) => {
    const handlePress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress(item);
    };

    return (
      <TouchableOpacity
        style={[
          styles.container,
          isNowPlaying && { backgroundColor: `${colors.primary[500]}10` }, // Soft highlight
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* 1. Artwork / Status Indicator */}
        <View
          style={[
            styles.artworkContainer,
            {
              backgroundColor: isNowPlaying
                ? colors.primary[500]
                : colors.background.secondary,
            },
          ]}
        >
          {isNowPlaying ? (
            <AudioLines
              size={20}
              color={colors.background.primary}
              strokeWidth={2.5}
            />
          ) : (
            <Music2 size={20} color={colors.text.tertiary} strokeWidth={1.5} />
          )}
        </View>

        {/* 2. Main Info Section */}
        <View style={styles.infoContent}>
          <View style={styles.topRow}>
            <Text
              style={[
                styles.title,
                {
                  color: isNowPlaying
                    ? colors.primary[500]
                    : colors.text.primary,
                },
              ]}
              numberOfLines={1}
            >
              {item.title || item.filename}
            </Text>

            {/* Badge diletakkan di kanan judul dengan ukuran proporsional */}
            <QualityBadge
              sampleRate={item.sampleRate}
              codec={item.codec}
              isHiRes={item.isHiRes}
            />
          </View>

          <View style={styles.bottomRow}>
            <Text
              style={[styles.subText, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {item.artist} <Text style={{ opacity: 0.5 }}>•</Text> {item.album}
            </Text>
          </View>

          {/* Technical Data Row - Sangat disukai Audiophile */}
          <View style={styles.techRow}>
            <Text style={[styles.techInfo, { color: colors.text.tertiary }]}>
              {item.codec?.toUpperCase()} |{" "}
              {item.bitDepth ? `${item.bitDepth}bit` : "16bit"} |{" "}
              {Math.round(item.sampleRate / 1000)}kHz
            </Text>
          </View>
        </View>

        {/* 3. Right Action Section */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onToggleFavorite(item.id)}
            style={styles.iconButton}
          >
            <Heart
              size={18}
              color={isFavorite ? colors.status.error : colors.text.tertiary}
              fill={isFavorite ? colors.status.error : "transparent"}
              strokeWidth={isFavorite ? 0 : 2}
            />
          </TouchableOpacity>

          <Text style={[styles.duration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.isNowPlaying === next.isNowPlaying &&
      prev.isFavorite === next.isFavorite &&
      prev.colors.primary[500] === next.colors.primary[500]
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12, // Tambah sedikit dari 8 atau 10
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 2, // Beri jarak antar baris agar tidak menempel
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "600", // Gunakan 600 untuk kesan semi-bold yang bersih
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.6,
    letterSpacing: 0.3,
  },
  // Tambahkan indikator resolusi (Hi-Res/Lossless) jika ada
  badge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 0.5,
    marginRight: 6,
  },
  // Di bagian StyleSheet, tambahkan:
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: "hidden",
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  subText: {
    fontSize: 12,
    flex: 1,
  },
  techRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  techInfo: {
    fontSize: 10,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    padding: 8,
  },
  duration: {
    fontSize: 12,
    marginLeft: 8,
  },
});
