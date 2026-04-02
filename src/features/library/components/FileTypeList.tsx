import React, { memo, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Binary,
  FileAudio,
  ChevronRight,
  ChevronLeft,
  Play,
  Activity,
  Heart,
  Music2,
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// ── Codec Metadata (Pristine Mapping) ─────────────────────────────────────────
const CODEC_CONFIG: Record<
  string,
  { color: string; label: string; isHiRes: boolean }
> = {
  FLAC: { color: "#3b82f6", label: "FLAC", isHiRes: true },
  WAV: { color: "#8b5cf6", label: "WAV", isHiRes: true },
  DSD: { color: "#f59e0b", label: "DSD", isHiRes: true },
  DSF: { color: "#f59e0b", label: "DSF", isHiRes: true },
  ALAC: { color: "#14b8a6", label: "ALAC", isHiRes: true },
  MP3: { color: "#94a3b8", label: "MP3", isHiRes: false },
  AAC: { color: "#94a3b8", label: "AAC", isHiRes: false },
};

const getMeta = (codec: string) => {
  const key = codec?.toUpperCase().replace(/\./g, "") || "???";
  return CODEC_CONFIG[key] ?? { color: "#64748b", label: key, isHiRes: false };
};

// ── FileTypeRow (Main List) ───────────────────────────────────────────────────
const FileTypeRow = memo(({ item, onPress, colors }: any) => {
  const meta = useMemo(() => getMeta(item.codec), [item.codec]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.formatRow}
    >
      <View
        style={[
          styles.codecBadge,
          {
            backgroundColor: `${meta.color}15`,
            borderColor: `${meta.color}40`,
          },
        ]}
      >
        <Text style={[styles.codecLabel, { color: meta.color }]}>
          {meta.label}
        </Text>
        {meta.isHiRes && (
          <Activity size={10} color={meta.color} strokeWidth={3} />
        )}
      </View>

      <View style={styles.formatInfo}>
        <Text style={[styles.formatTitle, { color: colors.text.primary }]}>
          {meta.label} Audio {meta.isHiRes ? "• Lossless" : ""}
        </Text>
        <Text style={[styles.formatMeta, { color: colors.text.tertiary }]}>
          {item.count} Tracks Collected
        </Text>
      </View>

      <ChevronRight size={18} color={colors.text.disabled} />
    </TouchableOpacity>
  );
});

// ── FileTypeSongRow (Inside Detail) ───────────────────────────────────────────
const FileTypeSongRow = memo(
  ({
    track,
    isNowPlaying,
    isFavorite,
    onPress,
    onToggleFavorite,
    colors,
  }: any) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.songRow,
        isNowPlaying && { backgroundColor: `${colors.primary[500]}10` },
      ]}
    >
      <View style={styles.songLeading}>
        <Music2
          size={18}
          color={isNowPlaying ? colors.primary[500] : colors.text.disabled}
        />
      </View>

      <View style={styles.songMain}>
        <View style={styles.songTitleRow}>
          <Text
            style={[
              styles.songTitle,
              {
                color: isNowPlaying ? colors.primary[500] : colors.text.primary,
              },
            ]}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
        </View>
        <Text style={[styles.songSub, { color: colors.text.tertiary }]}>
          {track.artist} •{" "}
          {track.sampleRate
            ? `${Math.round(track.sampleRate / 1000)}kHz`
            : "44.1kHz"}
        </Text>
      </View>

      <View style={styles.songTrailing}>
        <TouchableOpacity onPress={onToggleFavorite} style={{ padding: 4 }}>
          <Heart
            size={16}
            color={isFavorite ? colors.status.error : colors.text.disabled}
            fill={isFavorite ? colors.status.error : "transparent"}
          />
        </TouchableOpacity>
        <Text style={[styles.duration, { color: colors.text.disabled }]}>
          {formatTime(track.duration)}
        </Text>
      </View>
    </TouchableOpacity>
  ),
);

// ── FileTypeList Main Component ──────────────────────────────────────────────
export const FileTypeList: React.FC<any> = ({
  fileTypes,
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [selectedType, setSelectedType] = useState<any | null>(null);

  const filteredSongs = useMemo(() => {
    if (!selectedType) return [];
    return (tracks ?? []).filter(
      (t) => (t.codec || "").toUpperCase() === selectedType.codec.toUpperCase(),
    );
  }, [tracks, selectedType]);

  if (!selectedType) {
    return (
      <FlatList
        data={fileTypes}
        keyExtractor={(item) => item.codec}
        renderItem={({ item }) => (
          <FileTypeRow item={item} onPress={setSelectedType} colors={colors} />
        )}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
      />
    );
  }

  const meta = getMeta(selectedType.codec);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: colors.background.secondary },
        ]}
      >
        <TouchableOpacity
          onPress={() => setSelectedType(null)}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.primary[500]} />
          <Text style={[styles.backText, { color: colors.primary[500] }]}>
            Formats
          </Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View
            style={[
              styles.largeBadge,
              {
                backgroundColor: `${meta.color}15`,
                borderColor: `${meta.color}40`,
              },
            ]}
          >
            <Binary size={42} color={meta.color} strokeWidth={1.5} />
          </View>
          <View style={styles.heroContent}>
            <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
              {meta.label} Archive
            </Text>
            <Text style={[styles.heroSub, { color: colors.text.tertiary }]}>
              {filteredSongs.length} high-fidelity tracks found in this format.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.playAllBtn, { backgroundColor: colors.primary[500] }]}
          onPress={() => onSongPress(filteredSongs[0], filteredSongs)}
        >
          <Play size={18} color="#fff" fill="#fff" />
          <Text style={styles.playAllText}>Play All {meta.label}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FileTypeSongRow
            track={item}
            isNowPlaying={item.id === currentTrackId}
            isFavorite={favoriteIds.has(item.id)}
            onPress={() => onSongPress(item, filteredSongs)}
            onToggleFavorite={() => onToggleFavorite?.(item.id)}
            colors={colors}
          />
        )}
        contentContainerStyle={{ paddingBottom: 150 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  codecBadge: {
    width: 64,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  codecLabel: { fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  formatInfo: { flex: 1, marginLeft: 16 },
  formatTitle: { fontSize: 15, fontWeight: "600" },
  formatMeta: { fontSize: 11, marginTop: 4, fontWeight: "500" },

  header: {
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
  },
  backText: { fontSize: 16, fontWeight: "600", marginLeft: 4 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  largeBadge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  heroContent: { flex: 1 },
  heroTitle: { fontSize: 24, fontWeight: "800" },
  heroSub: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 24,
    marginTop: 24,
    height: 52,
    borderRadius: 16,
    gap: 8,
  },
  playAllText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  songLeading: { width: 32 },
  songMain: { flex: 1, paddingRight: 10 },
  songTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  songTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  songSub: { fontSize: 11, marginTop: 2 },
  songTrailing: { alignItems: "flex-end", gap: 4 },
  duration: {
    fontSize: 10,
    opacity: 0.6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
