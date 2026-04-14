// src/shared/components/ThemePicker.tsx
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
  X,
  Shuffle,
  Check,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { ALL_THEMES, THEME_CATEGORIES } from "@/shared/constants/theme";
import type { Theme } from "@/shared/constants/themes/types";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = (width - 64) / 3;
const CARD_WIDTH = COLUMN_WIDTH - 8;

// Kategori yang tersedia
const CATEGORIES: { label: string; key: keyof typeof THEME_CATEGORIES }[] = [
  { label: "🌙 Dark", key: "dark" },
  { label: "☀️ Light", key: "light" },
  { label: "💎 Premium", key: "premium" },
  { label: "🌿 Nature", key: "nature" },
];

export const ThemePicker: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const { theme, themeId, setTheme, randomTheme } = useTheme();
  const { colors, spacing } = theme;

  // Helper untuk mendapatkan tema dari ID
  const getThemeFromId = (id: string): Theme | undefined => {
    return ALL_THEMES[id as keyof typeof ALL_THEMES];
  };

  // Render satu kartu tema
  const renderThemeCard = (t: Theme) => {
    const isSelected = t.id === themeId;

    return (
      <TouchableOpacity
        key={t.id}
        onPress={() => {
          setTheme(t.id);
          // Optional: haptic feedback
        }}
        style={[
          styles.cardContainer,
          { marginBottom: spacing.md },
        ]}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.cardPreview,
            {
              backgroundColor: t.colors.background.primary,
              borderColor: isSelected
                ? t.colors.primary[500]
                : colors.border?.medium || "transparent",
            },
          ]}
        >
          {/* Preview bar - Primary color */}
          <View
            style={[
              styles.previewBar,
              {
                backgroundColor: t.colors.primary[500],
                marginBottom: spacing.xs,
              },
            ]}
          />
          
          {/* Preview text lines */}
          <View
            style={[
              styles.previewLine,
              {
                backgroundColor: t.colors.text.secondary,
                marginBottom: spacing.xs,
                width: "70%",
              },
            ]}
          />
          <View
            style={[
              styles.previewLine,
              {
                backgroundColor: t.colors.text.tertiary,
                marginBottom: spacing.sm,
                width: "40%",
              },
            ]}
          />

          {/* Color dots */}
          <View style={styles.colorDots}>
            {[
              t.colors.primary[500],
              t.colors.status?.success || "#10B981",
              t.colors.accent?.primary || t.colors.primary[300],
            ].map((bg, i) => (
              <View
                key={i}
                style={[
                  styles.colorDot,
                  { backgroundColor: bg },
                ]}
              />
            ))}
          </View>

          {/* Selected indicator */}
          {isSelected && (
            <View
              style={[
                styles.selectedBadge,
                { backgroundColor: t.colors.primary[500] },
              ]}
            >
              <Check size={10} color="#FFF" strokeWidth={3} />
            </View>
          )}
        </View>

        <Text
          style={[
            styles.cardTitle,
            {
              color: isSelected ? colors.primary[500] : colors.text.secondary,
              marginTop: spacing.xs,
            },
          ]}
          numberOfLines={1}
        >
          {t.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
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
                borderBottomColor: colors.border?.medium || colors.background.tertiary,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Pilih Tema
            </Text>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.closeButton}
            >
              <X size={24} color={colors.text.secondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Konten Tema per Kategori */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {CATEGORIES.map(({ label, key }) => {
              const themeIds = THEME_CATEGORIES[key];
              const themes = themeIds
                .map((id) => getThemeFromId(id))
                .filter((t): t is Theme => t !== undefined);

              if (themes.length === 0) return null;

              return (
                <View key={key} style={styles.categorySection}>
                  <Text
                    style={[
                      styles.categoryTitle,
                      {
                        color: colors.text.secondary,
                        marginHorizontal: spacing.lg,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                  
                  <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
                    {themes.map(renderThemeCard)}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer - Random Theme */}
          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border?.medium || colors.background.tertiary,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                randomTheme();
                // Optional: haptic feedback
              }}
              style={styles.randomButton}
              activeOpacity={0.7}
            >
              <Shuffle
                size={20}
                color={colors.primary[500]}
                strokeWidth={2.5}
              />
              <Text style={[styles.randomText, { color: colors.primary[500] }]}>
                Acak Tema
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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  container: {
    height: "75%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  categorySection: {
    marginBottom: 8,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: 12,
    alignItems: "center",
  },
  cardPreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 2.5,
    overflow: "hidden",
    padding: 8,
    position: "relative",
  },
  previewBar: {
    height: 8,
    width: "60%",
    borderRadius: 4,
  },
  previewLine: {
    height: 4,
    borderRadius: 2,
  },
  colorDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: "auto",
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  selectedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    width: "100%",
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  randomButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  randomText: {
    fontSize: 15,
    fontWeight: "600",
  },
}); 