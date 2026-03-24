//src/features/library/components/FileTypeList.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";

const CODEC_COLORS: Record<string, string> = {
  FLAC: "#00D4AA", DSD: "#FFD700", WAV: "#4FC3F7",
  ALAC: "#CE93D8", MP3: "#A5D6A7", AAC: "#FFAB91",
};

interface FileType { codec: string; count: number }
interface Props { fileTypes: FileType[]; tracks: MediaTrack[] }

export const FileTypeList: React.FC<Props> = ({ fileTypes, tracks }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const total = tracks.length || 1;

  return (
    <FlatList
      data={fileTypes}
      keyExtractor={(f) => f.codec}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: spacing.md }}
      renderItem={({ item }) => {
        const pct = Math.round((item.count / total) * 100);
        const color = CODEC_COLORS[item.codec] ?? "#888";
        return (
          <TouchableOpacity
            style={{
              backgroundColor: colors.background.secondary,
              borderRadius: 12,
              padding: spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color, fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>
                {item.codec}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                {item.count} file • {pct}%
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.background.tertiary, borderRadius: 3, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
};

