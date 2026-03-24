//src/features/library/components/FolderList.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";

interface Folder { path: string; name: string; count: number }
interface Props { folders: Folder[]; tracks: MediaTrack[] }

export const FolderList: React.FC<Props> = ({ folders }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <FlatList
      data={folders}
      keyExtractor={(f) => f.path}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            gap: 12,
          }}
        >
          <Ionicons name="folder" size={22} color="#FFD700" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>
              {item.name}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {item.path}
            </Text>
          </View>
          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{item.count}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: colors.border.light, marginLeft: spacing.md }} />
      )}
    />
  );
};

