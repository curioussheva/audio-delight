import React, { useState } from "react"; // tambah useState
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal, // tambah Modal
} from "react-native";
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItemList,
} from "@react-navigation/drawer";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/shared/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DevDBManager from "@/features/library/components/DevDBManager"; // tambah import

export default function CustomDrawer(props: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [showDB, setShowDB] = useState(false); // tambah state

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER — identitas drawer: banner Curious Sheva (1600×427,
            rasio 3,75). `contain` + aspectRatio supaya teks banner tidak
            terpotong; dulu logo.png kotak (1024×1024) di kotak 280×160.
            Badge PRISTINE AUDIO di bawahnya dipertahankan. */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 20,
              backgroundColor: colors.background.secondary,
            },
          ]}
        >
          <Image
            source={require("../../../../assets/images/curious-sheva-banner.png")}
            style={styles.banner}
            contentFit="contain"
            accessibilityLabel="Banner Curious Sheva"
          />
          <View style={styles.versionBadge}>
            <Text style={[styles.versionText, { color: colors.primary[500] }]}>
              PRISTINE AUDIO
              
            </Text>
          </View>
        </View>

        {/* DRAWER LIST */}
        <View style={styles.drawerListContainer}>
          <DrawerItemList {...props} />
        </View>

        <View
          style={[
            styles.divider,
            { backgroundColor: colors.background.tertiary },
          ]}
        />

        {/* SUPPORT */}
        <View style={styles.extraMenu}>
          <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
            SUPPORT
          </Text>
          <TouchableOpacity style={styles.extraItem}>
            <Ionicons
              name="star-outline"
              size={20}
              color={colors.text.secondary}
            />
            <Text style={[styles.extraText, { color: colors.text.primary }]}>
              Rate App
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraItem}>
            <Ionicons
              name="help-circle-outline"
              size={20}
              color={colors.text.secondary}
            />
            <Text style={[styles.extraText, { color: colors.text.primary }]}>
              Help Center
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── DEV TOOLS (hanya tampil di __DEV__) ── */}
        {__DEV__ && (
          <>
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.background.tertiary },
              ]}
            />
            <View style={styles.extraMenu}>
              <Text
                style={[styles.sectionLabel, { color: colors.text.tertiary }]}
              >
                DEV TOOLS
              </Text>
              <TouchableOpacity
                style={styles.extraItem}
                onPress={() => setShowDB(true)}
              >
                <Ionicons
                  name="server-outline"
                  size={20}
                  color={colors.primary[500]}
                />
                <Text
                  style={[styles.extraText, { color: colors.primary[400] }]}
                >
                  DB Manager
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </DrawerContentScrollView>

      {/* FOOTER */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 20,
            borderTopColor: colors.background.tertiary,
          },
        ]}
      >
        <TouchableOpacity style={styles.logoutButton}>
          <Ionicons
            name="log-out-outline"
            size={20}
            color={colors.status.error}
          />
          <Text style={[styles.logoutText, { color: colors.status.error }]}>
            Exit App
          </Text>
        </TouchableOpacity>
      </View>

      {/* DB MANAGER MODAL */}
      {__DEV__ && (
        <Modal
          visible={showDB}
          animationType="slide"
          onRequestClose={() => setShowDB(false)}
        >
          <DevDBManager onClose={() => setShowDB(false)} />
        </Modal>
      )}
    </View>
  );
}

// styles — banner menggantikan logo kotak (lihat HEADER di atas)
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  // Banner 1600×427 (rasio 3,75): lebar penuh header, tinggi mengikuti
  // aspectRatio (~70dp di drawer 304dp) — teks "Curious Sheva" utuh.
  banner: { width: "100%", aspectRatio: 1600 / 427 },
  versionBadge: {
    marginTop: 15,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "rgba(0, 212, 170, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 170, 0.2)",
  },
  versionText: { fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  drawerListContainer: { paddingHorizontal: 10, paddingTop: 20 },
  divider: { height: 1, marginHorizontal: 25, marginVertical: 20 },
  extraMenu: { paddingHorizontal: 25 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 15,
    letterSpacing: 2,
  },
  extraItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 15,
  },
  extraText: { fontSize: 15, fontWeight: "500" },
  footer: { paddingHorizontal: 25, paddingTop: 20, borderTopWidth: 1 },
  logoutButton: { flexDirection: "row", alignItems: "center", gap: 15 },
  logoutText: { fontSize: 15, fontWeight: "700" },
});
