import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CustomDrawer(props: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <DrawerContentScrollView 
        {...props} 
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER: Area Logo Premium */}
        <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.background.secondary }]}>
          <Image
  source={require('../../../assets/images/logo.png')}
  style={styles.logo}
  contentFit="contain"
/>
          <View style={styles.versionBadge}>
            <Text style={[styles.versionText, { color: colors.primary[500] }]}>v1.0.0 GOLD</Text>
          </View>
        </View>

        {/* LIST MENU: Menggunakan item default dari drawer navigation */}
        <View style={styles.drawerListContainer}>
          <DrawerItemList {...props} />
        </View>

        {/* DIVIDER */}
        <View style={[styles.divider, { backgroundColor: colors.background.tertiary }]} />

        {/* EXTRA MENU: Contoh Menu Tambahan */}
        <View style={styles.extraMenu}>
          <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>SUPPORT</Text>
          <TouchableOpacity style={styles.extraItem}>
            <Ionicons name="star-outline" size={20} color={colors.text.secondary} />
            <Text style={[styles.extraText, { color: colors.text.primary }]}>Rate App</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraItem}>
            <Ionicons name="help-circle-outline" size={20} color={colors.text.secondary} />
            <Text style={[styles.extraText, { color: colors.text.primary }]}>Help Center</Text>
          </TouchableOpacity>
        </View>
      </DrawerContentScrollView>

      {/* FOOTER: Tombol Logout atau Info Akun */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20, borderTopColor: colors.background.tertiary }]}>
        <TouchableOpacity style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={20} color={colors.status.error} />
          <Text style={[styles.logoutText, { color: colors.status.error }]}>Exit App</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  logo: {
    width: 140,
    height: 80,
  },
  versionBadge: {
    marginTop: 5,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
  },
  versionText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  drawerListContainer: {
    paddingHorizontal: 10,
    paddingTop: 20,
  },
  divider: {
    height: 1,
    marginHorizontal: 25,
    marginVertical: 20,
  },
  extraMenu: {
    paddingHorizontal: 25,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 15,
    letterSpacing: 2,
  },
  extraItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 15,
  },
  extraText: {
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 25,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
