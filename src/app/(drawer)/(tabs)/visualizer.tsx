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
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import { useSafePadding } from "@/shared/hooks/useSafePadding";
import { RefreshCw, AlertCircle } from "lucide-react-native";

export default function VisualizerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  // Teks di atas tombol primary[500] — dipilih dari luminansi primary
  // (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#FFF".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

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
        <View style={styles.emptyState}>
          <AlertCircle size={48} color={colors.text.tertiary} />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
            Tidak ada lagu yang diputar
          </Text>
          {/* U-P1-28: visualizer adalah tab root — tidak ada history untuk
              di-pop, router.back() no-op. Arahkan ke tab Library. */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary[500] }]}
            onPress={() => router.replace("/(drawer)/(tabs)/library")}
          >
            <Text style={[styles.buttonText, { color: onPrimary }]}>
              Kembali
            </Text>
          </TouchableOpacity>
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          Visualizer
        </Text>
        {!hasValidSession && (
          <TouchableOpacity
            onPress={handleRetry}
            style={[styles.retryButton, isRetrying && { opacity: 0.4 }]}
            disabled={isRetrying}
            accessibilityRole="button"
            accessibilityLabel="Coba pulihkan audio session"
          >
            <RefreshCw size={20} color={colors.primary[500]} />
          </TouchableOpacity>
        )}
      </View>

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  retryButton: {
    padding: 8,
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
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  debugInfo: {
    position: "absolute",
    left: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 4,
  },
});
