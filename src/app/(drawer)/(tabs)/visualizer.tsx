// src/app/(drawer)/visualizer.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useAudioSessionRetry } from "@/features/player/hooks/useAudioSessionRetry";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { useSafePadding } from "@/shared/hooks/useSafePadding";
import { RefreshCw, AlertCircle } from "lucide-react-native";

export default function VisualizerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  const safePadding = useSafePadding();
  const router = useRouter();

  const { currentSong, isPlaying, audioSessionId } = usePlayerStore();
  const [hasValidSession, setHasValidSession] = useState(false);

  // U-P2-24: pemulihan sesi diekstrak ke useAudioSessionRetry supaya
  // polanya SAMA dengan tab Analyzer (pesan + tombol retry yang
  // benar-benar memulihkan). Logikanya identik dengan handleRetry
  // U-P1-27 — hanya pindah rumah, bukan diubah.
  const { isRetrying, retryAudioSession: handleRetry } =
    useAudioSessionRetry();

  // Cek apakah session ID valid (> 0)
  useEffect(() => {
    setHasValidSession(!!audioSessionId && audioSessionId > 0);
  }, [audioSessionId]);

  if (!currentSong) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background.primary,
            paddingTop: safePadding.paddingTop,
            // U-P2-23: paddingBottom dari useSafePadding (110 saat
            // floating player ada) — sebelumnya area bawah duduk di
            // belakang floating player/tab bar.
            paddingBottom: safePadding.paddingBottom,
          },
        ]}
      >
        {/* U-P2-53: header + empty state bersama. Tombol "Kembali" lama
            diganti aksi EmptyState — tujuan sama (ke Library, U-P1-28),
            labelnya sekarang jujur ("Kembali ke Library"). */}
        <ScreenHeader title="Visualizer" />
        <View style={styles.emptyState}>
          <EmptyState
            title="Tidak ada lagu yang diputar"
            icon={<AlertCircle size={48} color={colors.text.tertiary} />}
            actionLabel="Kembali ke Library"
            onActionPress={() => router.replace("/(drawer)/(tabs)/library")}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.primary,
          paddingTop: safePadding.paddingTop,
          // U-P2-23: lihat komentar di atas — paddingBottom dipakai
          // supaya area bawah tidak tertutup floating player/tab bar.
          paddingBottom: safePadding.paddingBottom,
        },
      ]}
    >
      {/* Header — U-P2-53: header bersama; tombol retry pindah ke slot
          `actions`, perilakunya tidak berubah. */}
      <ScreenHeader
        title="Visualizer"
        actions={
          !hasValidSession ? (
            <TouchableOpacity
              onPress={handleRetry}
              style={[styles.retryButton, isRetrying && { opacity: 0.4 }]}
              disabled={isRetrying}
              accessibilityRole="button"
              accessibilityLabel="Coba pulihkan audio session"
            >
              <RefreshCw size={20} color={colors.primary[500]} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Info Lagu */}
      <View style={styles.songInfo}>
        <Text style={[styles.songTitle, { color: colors.text.primary }]}>
          {currentSong.title}
        </Text>
        <Text style={[styles.artistName, { color: colors.text.secondary }]}>
          {currentSong.artist}
        </Text>
      </View>

      {/* Visualizer Area */}
      <View style={styles.visualizerContainer}>
        {isPlaying ? (
          <SpectrumAnalyzer
            width={Dimensions.get("window").width - 32}
            height={280}
            barCount={64}
            color={colors.primary[500]}
            backgroundColor={colors.background.secondary}
            sensitivity={2.2}
            isPlaying={isPlaying}
            audioSessionId={audioSessionId || 0}
          />
        ) : (
          <View style={styles.pausedOverlay}>
            <Text style={[styles.pausedText, { color: colors.text.tertiary }]}>
              ⏸️ Playback dijeda
            </Text>
          </View>
        )}

        {/* Fallback message jika session tidak valid */}
        {!hasValidSession && isPlaying && (
          <View style={styles.sessionWarning}>
            <AlertCircle size={16} color={colors.status.warning} />
            <Text
              style={[styles.warningText, { color: colors.status.warning }]}
            >
              Audio session tidak tersedia. Coba restart lagu.
            </Text>
          </View>
        )}
      </View>

      {/* Debug Info (opsional, bisa dihapus nanti) */}
      {__DEV__ && (
        <View
          style={[
            styles.debugInfo,
            // U-P2-23: bottom: 20 lama menaruh debug tepat di zona
            // floating player — duduk di atas clearance yang sama.
            { bottom: safePadding.paddingBottom },
          ]}
        >
          <Text style={{ color: colors.text.tertiary, fontSize: 10 }}>
            Session ID: {audioSessionId || "null"} | Playing:{" "}
            {isPlaying ? "Yes" : "No"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // U-P2-01: padding 8 + ikon 20 lama = ±36×36px, di bawah 44dp.
  retryButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  songInfo: {
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  artistName: {
    fontSize: 14,
    marginTop: 4,
  },
  visualizerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  pausedOverlay: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  pausedText: {
    fontSize: 16,
    fontWeight: "500",
  },
  sessionWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 8,
  },
  warningText: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  debugInfo: {
    position: "absolute",
    left: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 4,
  },
});
