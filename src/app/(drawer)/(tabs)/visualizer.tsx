// src/app/(drawer)/visualizer.tsx
import React, { useCallback, useEffect, useState } from "react";
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
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { audioEngine } from "@/features/player/api/engine";
import NativeDSPModule from "@/features/equalizer/api/nativeInterface";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";
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

  const { currentSong, isPlaying, audioSessionId, setAudioSessionId } =
    usePlayerStore();
  const [hasValidSession, setHasValidSession] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Cek apakah session ID valid (> 0)
  useEffect(() => {
    setHasValidSession(!!audioSessionId && audioSessionId > 0);
  }, [audioSessionId]);

  // U-P1-27: retry benar-benar memulihkan session, bukan cuma menaikkan
  // counter. Jalur pemulihan (sama dengan syncAudioSession di
  // useAudioPlayer): (1) pakai ID yang sudah dibuat audioEngine saat
  // startup — store bisa ketinggalan karena init race; (2) bila engine pun
  // belum punya sesi, minta lewat createAudioSession (mengembalikan sesi
  // yang sudah ada bila ada, bukan sesi baru tiap panggil). ID yang pulih
  // ditulis ke kedua store supaya hasValidSession menyala dan
  // SpectrumAnalyzer men-start visualizerService; start() dipanggil juga
  // langsung supaya tidak menunggu re-render. Bila tidak ada sesi yang
  // bisa dipulihkan, warning tetap tampil — tidak ada klaim sukses palsu.
  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      let id = audioEngine.getSessionId();
      if (!id || id <= 0) {
        try {
          const res = await NativeDSPModule?.createAudioSession?.();
          id = res?.sessionId ?? null;
        } catch (e) {
          console.warn("[Visualizer] createAudioSession gagal:", e);
        }
      }
      if (id && id > 0) {
        setAudioSessionId(id);
        useEqualizerStore.getState().setAudioSessionId(id);
        const ok = await visualizerService.start(id);
        if (!ok) {
          console.warn(
            "[Visualizer] visualizerService.start gagal untuk sesi",
            id,
          );
        }
      } else {
        console.warn(
          "[Visualizer] Retry: tidak ada audio session yang bisa dipulihkan",
        );
      }
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, setAudioSessionId]);

  if (!currentSong) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background.primary,
            paddingTop: safePadding.paddingTop,
          },
        ]}
      >
        <View style={styles.emptyState}>
          <AlertCircle size={48} color={colors.text.tertiary} />
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
            Tidak ada lagu yang diputar
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary[500] }]}
            onPress={() => router.back()}
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
            mode="bars"
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
        <View style={styles.debugInfo}>
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
    bottom: 20,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 4,
  },
});
