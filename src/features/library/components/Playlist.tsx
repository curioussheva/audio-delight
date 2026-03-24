//src/features/library/components/PlaylistList.tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

export const PlaylistList: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md }}>
      <Ionicons name="list-outline" size={48} color={colors.text.tertiary} />
      <Text style={{ color: colors.text.secondary, fontSize: 15 }}>Belum ada playlist</Text>
      <TouchableOpacity
        style={{
          backgroundColor: colors.primary[500],
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: 20,
        }}
      >
        <Text style={{ color: colors.background.primary, fontWeight: "700" }}>
          + Buat Playlist
        </Text>
      </TouchableOpacity>
    </View>
  );
};