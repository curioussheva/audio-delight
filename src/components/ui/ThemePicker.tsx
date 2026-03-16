import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { THEME_CATEGORIES } from '@/constants/themes';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 64) / 3;

export const ThemePicker: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { theme, themeId, setTheme, availableThemes } = useTheme();
  const { colors, spacing } = theme;

  const renderThemeCard = (t: typeof availableThemes[0]) => {
    const isSelected = t.id === themeId;
    
    return (
      <TouchableOpacity
        key={t.id}
        onPress={() => setTheme(t.id as any)}
        style={{
          width: COLUMN_WIDTH,
          marginBottom: spacing.md,
          alignItems: 'center',
        }}
      >
        <View style={{
          width: COLUMN_WIDTH - spacing.md,
          height: 80,
          backgroundColor: t.colors.background.primary,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: isSelected ? t.colors.primary[500] : t.colors.border.medium,
          overflow: 'hidden',
        }}>
          {/* Preview warna */}
          <View style={{ flex: 1, padding: spacing.xs }}>
            <View style={{
              height: 8,
              width: '60%',
              backgroundColor: t.colors.primary[500],
              borderRadius: 4,
              marginBottom: spacing.xs,
            }} />
            <View style={{
              height: 4,
              width: '40%',
              backgroundColor: t.colors.text.secondary,
              borderRadius: 2,
              marginBottom: spacing.xs,
            }} />
            <View style={{
              flexDirection: 'row',
              gap: 4,
            }}>
              <View style={{
                width: 10,
                height: 10,
                backgroundColor: t.colors.primary[500],
                borderRadius: 2,
              }} />
              <View style={{
                width: 10,
                height: 10,
                backgroundColor: t.colors.primary[300],
                borderRadius: 2,
              }} />
              <View style={{
                width: 10,
                height: 10,
                backgroundColor: t.colors.primary[700],
                borderRadius: 2,
              }} />
            </View>
          </View>
        </View>
        <Text style={{
          color: isSelected ? colors.primary[500] : colors.text.secondary,
          fontSize: 12,
          marginTop: spacing.xs,
          fontWeight: isSelected ? '600' : '400',
        }}>
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
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
          
          {/* Header */}
          <View style={[styles.header, { 
            borderBottomColor: colors.border.medium,
            padding: spacing.lg,
          }]}>
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Pilih Tema
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Dark Themes */}
            <Text style={[styles.categoryTitle, { 
              color: colors.text.secondary,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }]}>
              🌙 Dark
            </Text>
            <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
              {THEME_CATEGORIES.dark.map(renderThemeCard)}
            </View>

            {/* Light Themes */}
            <Text style={[styles.categoryTitle, { 
              color: colors.text.secondary,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }]}>
              ☀️ Light
            </Text>
            <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
              {THEME_CATEGORIES.light.map(renderThemeCard)}
            </View>

            {/* Premium Themes */}
            <Text style={[styles.categoryTitle, { 
              color: colors.text.secondary,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }]}>
              👑 Premium
            </Text>
            <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
              {THEME_CATEGORIES.premium.map(renderThemeCard)}
            </View>

            {/* Nature Themes */}
            <Text style={[styles.categoryTitle, { 
              color: colors.text.secondary,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }]}>
              🌿 Nature
            </Text>
            <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
              {THEME_CATEGORIES.nature.map(renderThemeCard)}
            </View>

            {/* Cyber Themes */}
            <Text style={[styles.categoryTitle, { 
              color: colors.text.secondary,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }]}>
              🤖 Cyber
            </Text>
            <View style={[styles.grid, { paddingHorizontal: spacing.lg }]}>
              {THEME_CATEGORIES.cyber.map(renderThemeCard)}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { 
            borderTopColor: colors.border.medium,
            padding: spacing.lg,
          }]}>
            <TouchableOpacity
              onPress={() => {
                const randomIndex = Math.floor(Math.random() * availableThemes.length);
                setTheme(availableThemes[randomIndex].id as any);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
              }}
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
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footer: {
    borderTopWidth: 1,
    alignItems: 'center',
  },
});