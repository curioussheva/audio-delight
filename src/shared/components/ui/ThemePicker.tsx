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
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { THEME_CATEGORIES } from "@/constants/themes";
import type { Theme } from "@/constants/themes/types";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = (width - 64) / 3;

const CATEGORIES: { label: string; key: keyof typeof THEME_CATEGORIES }[] = [
  { label: "🌙 Dark",    key: "dark"    },
  { label: "☀️ Light",   key: "light"   },
  { label: "👑 Premium", key: "premium" },
  { label: "🌿 Nature",  key: "nature"  },
  { label: "🤖 Cyber",   key: "cyber"   },
];

export const ThemePicker: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const { theme, themeId, setTheme, randomTheme } = useTheme();
  const { colors, spacing } = theme;

  const renderThemeCard = (t: Theme) => {
    const isSelected = t.id === themeId;
    return (
      <TouchableOpacity
        key={t.id}
        onPress={() => setTheme(t.id as any)}
        style={{ width: COLUMN_WIDTH, marginBottom: spacing.md, alignItems: "center" }}
      >
        <View
          style={{
            width: COLUMN_WIDTH - spacing.md,
            height: 80,
            backgroundColor: t.colors.background.primary,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected ? t.colors.primary[500] : t.colors.border.medium,
            overflow: "hidden",
            padding: spacing.xs,
          }}
        >
          <View
            style={{
              height: 8,
              width: "60%",
              backgroundColor: t.colors.primary[500],
              borderRadius: 4,
              marginBottom: spacing.xs,
            }}
          />
          <View
            style={{
              height: 4,
              width: "40%",
              backgroundColor: t.colors.text.secondary,
              borderRadius: 2,
              marginBottom: spacing.xs,
            }}
          />
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[t.colors.primary[500], t.colors.primary[300], t.colors.primary[700]].map(
              (bg, i) => (
                <View
                  key={i}
                  style={{ width: 10, height: 10, backgroundColor: bg, borderRadius: 2 }}
                />
              ),
            )}
          </View>
        </View>
        <Text
          style={{
            color: isSelected ? colors.primary[500] : colors.text.secondary,
            fontSize: 12,
            marginTop: spacing.xs,
            fontWeight: isSelected ? "600" : "400",
          }}
        >
          {t.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* ↓ height eksplisit agar ScrollView bisa flex: 1 */}
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.border.medium, padding: spacing.lg },
            ]}
          >
            <Text style={[styles.title, { color: colors.text.primary }]}>Pilih Tema</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Konten tema per kategori */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {CATEGORIES.map(({ label, key }) => (
              <View key={key}>
                <Text
                  style={[
                    styles.categoryTitle,
                    { color: colors.text.secondary, marginHorizontal: spacing.lg },
                  ]}
                >
                  {label}
                </Text>
                <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
                  {THEME_CATEGORIES[key].map(renderThemeCard)}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              { borderTopColor: colors.border.medium, padding: spacing.lg },
            ]}
          >
            <TouchableOpacity
              onPress={randomTheme}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Ionicons name="shuffle" size={20} color={colors.primary[500]} />
              <Text style={{ color: colors.primary[500] }}>Random Theme</Text>
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
    height: "80%", // ← bukan maxHeight, agar ScrollView bisa flex: 1
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
    flex: 1, // ← sekarang bekerja karena container punya tinggi eksplisit
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