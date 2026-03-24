//src/features/library/components/GenreList.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

interface Genre { name: string; count: number }
interface Props { genres: Genre[] }

export const GenreList: React.FC<Props> = ({ genres }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <FlatList
      data={genres}
      keyExtractor={(g) => g.name}
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
          <Ionicons name="musical-notes-outline" size={20} color={colors.primary[500]} />
          <Text style={{ flex: 1, color: colors.text.primary, fontSize: 15, fontWeight: "500" }}>
            {item.name}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{item.count} track</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: colors.border.light, marginLeft: spacing.md }} />
      )}
    />
  );
};

