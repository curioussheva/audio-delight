import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";

// Lucide Icons
import {
  X, // close
  Shuffle, // random theme
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { THEME_CATEGORIES } from "@/shared/constants/theme";
import type { Theme } from "@/shared/constants/themes/types";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = (width - 64) / 3;

// Hanya gunakan kategori yang ada di THEME_CATEGORIES
const CATEGORIES: { label: string; key: keyof typeof THEME_CATEGORIES }[] = [
  { label: "🌙 Dark", key: "dark" },
  { label: "☀️ Light", key: "light" },
  { label: "💎 Premium", key: "premium" },
  { label: "🌿 Nature", key: "nature" },
  // Hapus "cyber" karena tidak ada di THEME_CATEGORIES
];

export const ThemePicker: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const { theme, themeId, setTheme, randomTheme } = useTheme();
  const { colors, spacing } = theme;

  const renderThemeCard = (themeIdOrTheme: string | Theme) => {
    // Handle jika yang diterima adalah string ID atau Theme object
    const t =
      typeof themeIdOrTheme === "string"
        ? (THEME_CATEGORIES as any)[
            Object.keys(THEME_CATEGORIES).find((key) =>
              (THEME_CATEGORIES as any)[key].includes(themeIdOrTheme),
            )
          ]?.find((id: string) => id === themeIdOrTheme)
        : themeIdOrTheme;

    if (!t) return null;

    const isSelected = t.id === themeId;

    return (
      <TouchableOpacity
        key={t.id}
        onPress={() => setTheme(t.id)}
        style={{
          width: COLUMN_WIDTH,
          marginBottom: spacing?.md || 16,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: COLUMN_WIDTH - (spacing?.md || 16),
            height: 80,
            backgroundColor: t.colors.background.primary,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected
              ? t.colors.primary[500]
              : t.colors.border?.medium || "#334155",
            overflow: "hidden",
            padding: spacing?.xs || 4,
          }}
        >
          <View
            style={{
              height: 8,
              width: "60%",
              backgroundColor: t.colors.primary[500],
              borderRadius: 4,
              marginBottom: spacing?.xs || 4,
            }}
          />
          <View
            style={{
              height: 4,
              width: "40%",
              backgroundColor: t.colors.text.secondary,
              borderRadius: 2,
              marginBottom: spacing?.xs || 4,
            }}
          />
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[
              t.colors.primary[500],
              t.colors.primary[500],
              t.colors.primary[500],
            ].map((bg, i) => (
              <View
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: bg,
                  borderRadius: 2,
                }}
              />
            ))}
          </View>
        </View>

        <Text
          style={{
            color: isSelected ? colors.primary[500] : colors.text.secondary,
            fontSize: 12,
            marginTop: spacing?.xs || 4,
            fontWeight: isSelected ? "600" : "400",
          }}
        >
          {t.name}
        </Text>
      </TouchableOpacity>
    );
  };

  // Helper untuk mendapatkan theme object dari ID
  const getThemeById = (id: string): Theme | null => {
    // Ini perlu diimport dari theme constants
    // Untuk sementara, kita asumsikan ada function getThemeById
    // Atau kita bisa menggunakan ALL_THEMES jika diimport
    return null;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.background.primary },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: colors.border?.medium || "#334155",
                padding: spacing?.lg || 24,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Pilih Tema
            </Text>

            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={24} color={colors.text.secondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Konten Tema per Kategori */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: spacing?.lg || 24 }}
            showsVerticalScrollIndicator={false}
          >
            {CATEGORIES.map(({ label, key }) => (
              <View key={key}>
                <Text
                  style={[
                    styles.categoryTitle,
                    {
                      color: colors.text.secondary,
                      marginHorizontal: spacing?.lg || 24,
                    },
                  ]}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.grid,
                    { paddingHorizontal: spacing?.lg || 24 },
                  ]}
                >
                  {THEME_CATEGORIES[key].map((themeId) => {
                    // Kita perlu mengakses theme object dari themeId
                    // Cara termudah: import ALL_THEMES
                    return null; // Temporary
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer - Random Theme */}
          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border?.medium || "#334155",
                padding: spacing?.lg || 24,
              },
            ]}
          >
            <TouchableOpacity
              onPress={randomTheme}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing?.sm || 8,
              }}
            >
              <Shuffle
                size={20}
                color={colors.primary[500]}
                strokeWidth={2.5}
              />
              <Text style={{ color: colors.primary[500], fontWeight: "600" }}>
                Random Theme
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  container: {
    height: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  footer: {
    borderTopWidth: 1,
    alignItems: "center",
  },
}); 