// components/library/EmptyLibrary.tsx
import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { FONT_FAMILY } from "@/shared/constants/themes/base";

interface EmptyLibraryProps {
  colors: any;
  onScan: () => void;
  isScanning?: boolean;
}

// Batas maks 2 animasi notif saat scanning (2026-11-22): saat library
// kosong dan scan berjalan, dulu ada TIGA animasi sekaligus yang
// menyampaikan status yang sama — (a) bar "Discovering files…" di
// LibraryTabBar, (b) spinner "Menemukan file…" + bar progres + % di
// sini, (c) chip "Scanning library… 0/0" di atas FloatingPlayer.
// Yang dipertahankan: (a) + (c) — (a) satu-satunya penampil progres
// rescan manual + enrichment, (c) satu-satunya yang terlihat di semua
// tab + satu-satunya penampil background enrichment. Yang dihilangkan:
// animasi (b) — komponen ini hanya menampilkan teks STATIS
// "Memindai library…" (tanpa spinner, tanpa bar, tanpa %) selama scan
// berjalan; angka progres hidup tetap ada di (a). Prop scanProgress /
// scanTotal dihapus — tidak ada lagi yang membacanya di sini.
export const EmptyLibrary: React.FC<EmptyLibraryProps> = memo(
  ({ colors, onScan, isScanning = false }) => {
    return (
      <View style={styles.container}>
        <Ionicons
          name="musical-notes-outline"
          size={80}
          color={colors.text.tertiary}
        />
        <Text style={[styles.title, { color: colors.text.secondary }]}>
          Library Anda masih kosong
        </Text>

        {isScanning ? (
          <Text style={[styles.scanText, { color: colors.text.secondary }]}>
            Memindai library…
          </Text>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>
              Pindai folder musik untuk menemukan lagu-lagu Anda
            </Text>
            {/* Fase 3 Library: tombol bersama (sekunder) — dulu
                TouchableOpacity + gaya lokal. */}
            <PristineButton
              label="SCAN PERANGKAT"
              onPress={onScan}
              variant="secondary"
              style={{ marginTop: 24 }}
            />
          </>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.displayBold,
    lineHeight: 24,
    marginTop: 20,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  // Teks status scan — STATIS, tanpa spinner (lihat komentar di atas).
  scanText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.semiBold,
    marginTop: 24,
    textAlign: "center",
  },
});
