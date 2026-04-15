// src/app/(drawer)/(tabs)/analyzer.tsx

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from '@react-navigation/native';
import {
  RefreshCw,
  FileAudio,
  Cpu,
  Info,
  Mic2,
  BarChart3,
  Music,
  WifiOff,
} from "lucide-react-native";
import { NativeModules } from "react-native";

// Hooks & Store
import { useTheme } from "@/shared/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";

// Logic & Services
import {
  analyzeBitDepth,
  BitDepthAnalysis,
} from "@/features/audio/api/BitDepthVerifier";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import { formatFileSize } from "@/shared/types/audio";
import SQLiteService from "@/shared/lib/sqlite";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";

const { width: screenWidth } = Dimensions.get("window");

type EnrichState = "idle" | "loading" | "success" | "error";

export default function AnalyzerScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;

  // ✅ Ambil langsung dari playerStore (reaktif)
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const audioSessionId = usePlayerStore((state) => state.audioSessionId);
  const setAudioSessionId = usePlayerStore((state) => state.setAudioSessionId);
  const { isExclusiveMode, currentDAC } = useUSBDAC();

  // Local state
  const [bitDepthAnalysis, setBitDepthAnalysis] = useState<BitDepthAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [artistImageUrl, setArtistImageUrl] = useState<string | null>(null);
  const [artistBio, setArtistBio] = useState<string | null>(null);
  const [enrichState, setEnrichState] = useState<EnrichState>("idle");
  const [enrichSource, setEnrichSource] = useState<"db" | "musicbrainz" | null>(null);

  // ✅ State untuk fallback visualizer
  const [waitingForSession, setWaitingForSession] = useState(false);

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Reset waiting timer saat session ID berubah
  useEffect(() => {
    if (audioSessionId && audioSessionId > 0) {
      setWaitingForSession(false);
    } else if (isPlaying) {
      // Tampilkan waiting setelah 2 detik
      const timer = setTimeout(() => setWaitingForSession(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setWaitingForSession(false);
    }
  }, [audioSessionId, isPlaying]);
useFocusEffect(
  useCallback(() => {
    // Selalu cek saat focus, tapi jangan re-create callback saat session berubah
    NativeModules.NativeDSPModule?.getActiveAudioSessionId?.()
      ?.then((id: number) => {
        if (id > 0 && id !== audioSessionId) {
          setAudioSessionId(id);
        }
      })
      ?.catch(() => {});
  }, []) // deps kosong — hanya run saat focus
);

  // Load artist metadata dari DB
  useEffect(() => {
    if (!currentSong?.id) {
      setArtistImageUrl(null);
      setArtistBio(null);
      setEnrichSource(null);
      setEnrichState("idle");
      return;
    }

    const loadFromDB = async () => {
      try {
        const result = SQLiteService.db.execute(
          `SELECT artist_image_url, artist_bio FROM songs WHERE id = ? LIMIT 1`,
          [currentSong.id]
        );
        const row = result.rows?.item?.(0);
        if (row?.artist_image_url || row?.artist_bio) {
          setArtistImageUrl(row.artist_image_url ?? null);
          setArtistBio(row.artist_bio ?? null);
          setEnrichSource("db");
        } else {
          setArtistImageUrl(null);
          setArtistBio(null);
          setEnrichSource(null);
        }
      } catch (e) {
        console.warn("[Analyzer] Failed to load artist metadata from DB:", e);
      }
    };

    loadFromDB();
  }, [currentSong?.id]);

  // Bit-depth analysis
  useEffect(() => {
    if (!currentSong) {
      setBitDepthAnalysis(null);
      return;
    }

    const runAnalysis = async () => {
      setIsAnalyzing(true);
      try {
        const result = await analyzeBitDepth(currentSong);
        setBitDepthAnalysis(result);
      } catch (err) {
        console.warn("[Analyzer] Bit depth analysis failed:", err);
      } finally {
        setIsAnalyzing(false);
      }
    };

    runAnalysis();
  }, [currentSong?.id]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const doFetch = useCallback(async (artistName: string) => {
    setEnrichState("loading");
    try {
      const enrichment = await OnlineMetadataService.getArtistEnrichment(artistName);
      if (enrichment.source === "fallback") {
        setEnrichState("error");
        Alert.alert(
          "Artist Tidak Ditemukan",
          `Tidak ada data untuk "${artistName}" di MusicBrainz.\nPeriksa ejaan nama artist di metadata lagu.`
        );
        return;
      }

      setArtistImageUrl(enrichment.imageUrl);
      setArtistBio(enrichment.bio);
      setEnrichSource("musicbrainz");
      setEnrichState("success");
    } catch {
      setEnrichState("error");
      Alert.alert("Gagal Mengambil Data", "Periksa koneksi internet dan coba lagi.");
    }
  }, []);

  const handleFetchOnlineMetadata = useCallback(async () => {
    if (!currentSong?.artist || enrichState === "loading") return;
    const artistName = currentSong.artist;

    if (enrichSource === "musicbrainz") {
      Alert.alert(
        "Perbarui Data?",
        `Data untuk "${artistName}" sudah ada dari MusicBrainz.\nFetch ulang?`,
        [
          { text: "Batal", style: "cancel" },
          { text: "Fetch Ulang", onPress: () => doFetch(artistName) },
        ]
      );
      return;
    }

    await doFetch(artistName);
  }, [currentSong?.artist, enrichState, enrichSource, doFetch]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const getReadablePath = (path?: string): string => {
    if (!path) return "Unknown";
    return path
      .replace(/^.*\/tree\/primary:|^\/storage\/emulated\/0\//, "")
      .replace(/\/$/, "");
  };

  const getQualityStatus = () => {
    if (isAnalyzing) return { text: "ANALYZING...", color: colors.text.tertiary };
    if (bitDepthAnalysis?.isFake)
      return { text: "UPSCALE DETECTED ⚠️", color: colors.status.error };
    return { text: "STUDIO MASTER AUTHENTIC", color: colors.status.success };
  };

  const bitrateDisplay = currentSong?.bitrate
    ? `${Math.round(currentSong.bitrate / 1000)} kbps`
    : "VBR";

  const sampleRateDisplay = currentSong?.sampleRate
    ? `${(currentSong.sampleRate / 1000).toFixed(1)} kHz`
    : "-";

  const status = getQualityStatus();

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!currentSong) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
        <BarChart3 size={64} color={colors.text.disabled} />
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
          Putar lagu untuk memulai analisa mendalam
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Audio Deep Analysis
      </Text>

      {/* 1. LIVE SPECTRUM */}
      {audioSessionId && audioSessionId > 0 ? (
  <SpectrumAnalyzer
    key={`spectrum-${audioSessionId}`}
    width={screenWidth - 72}
    height={160}
    mode="bars"
    barCount={42}
    isPlaying={isPlaying}
    audioSessionId={audioSessionId}
    sensitivity={1.5}
    color={colors.primary[500]}
    centerArt={currentSong?.artwork}
    showCenterArt={true}
  /> 
) : (
  <View style={styles.visualizerPlaceholder}>
    <ActivityIndicator color={colors.primary[500]} />
    <Text style={{ color: colors.text.tertiary, marginTop: 12 }}>
      {waitingForSession
        ? "Menunggu audio session..."
        : "Mempersiapkan visualizer..."}
    </Text>
    <Text style={{ color: colors.text.disabled, fontSize: 12, marginTop: 4 }}>
      Session ID: {audioSessionId || "none"}
    </Text>
  </View>
)}

      {/* 2. AUTHENTICITY STATUS */}
      <View style={[styles.card, { backgroundColor: colors.background.secondary }]}>
        <Text style={[styles.label, { color: colors.primary[500] }]}>
          STREAM AUTHENTICITY
        </Text>
        <Text style={[styles.statusValue, { color: status.color }]}>
          {status.text}
        </Text>
        {bitDepthAnalysis?.isFake && (
          <Text style={[styles.warningText, { color: colors.status.error }]}>
            File declares {bitDepthAnalysis.declaredDepth}-bit, but real data is{" "}
            {bitDepthAnalysis.realDepth}-bit.
          </Text>
        )}
      </View>

      {/* 3. SONG INFORMATION */}
      <View style={[styles.card, { backgroundColor: colors.background.secondary }]}>
        <View style={styles.cardHeader}>
          <Info size={16} color={colors.primary[500]} />
          <Text style={[styles.label, { color: colors.primary[500] }]}>
            SONG INFORMATION
          </Text>
        </View>
        <InfoRow label="Title" value={currentSong.title} colors={colors} />
        <InfoRow label="Artist" value={currentSong.artist} colors={colors} />
        <InfoRow label="Album" value={currentSong.album} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border.light }]} />
        <InfoRow label="Filename" value={currentSong.filename} colors={colors} />
        <InfoRow
          label="Path"
          value={getReadablePath(currentSong.folder)}
          colors={colors}
          isPath
        />
      </View>

      {/* 4. TECHNICAL DETAILS */}
      <View style={[styles.card, { backgroundColor: colors.background.secondary }]}>
        <View style={styles.cardHeader}>
          <FileAudio size={16} color={colors.primary[500]} />
          <Text style={[styles.label, { color: colors.primary[500] }]}>
            TECHNICAL DETAILS
          </Text>
        </View>
        <InfoRow label="Format" value={currentSong.codec?.toUpperCase()} colors={colors} />
        <InfoRow label="Sample Rate" value={sampleRateDisplay} colors={colors} />
        <InfoRow label="Bit Depth" value={`${currentSong.bitDepth ?? 16}-bit`} colors={colors} />
        <InfoRow label="Bitrate" value={bitrateDisplay} colors={colors} />
        <InfoRow label="Size" value={formatFileSize(currentSong.fileSize ?? 0)} colors={colors} />
      </View>

      {/* 5. DAC & HARDWARE */}
      {currentDAC && (
        <View style={[styles.card, { backgroundColor: colors.background.secondary }]}>
          <View style={styles.cardHeader}>
            <Cpu size={16} color={colors.primary[500]} />
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              DAC OUTPUT
            </Text>
          </View>
          <InfoRow label="Device" value={currentDAC.name} colors={colors} />
          <InfoRow label="Manufacturer" value={currentDAC.manufacturer} colors={colors} />
          <InfoRow
            label="Mode"
            value={isExclusiveMode ? "Bit-Perfect (Direct)" : "System Mixer"}
            colors={colors}
          />
          <InfoRow
            label="Output Rate"
            value={`${((currentDAC.currentSampleRate ?? 0) / 1000).toFixed(1)} kHz`}
            colors={colors}
          />
        </View>
      )}

      {/* 6. ARTIST BIOGRAPHY */}
      <View style={[styles.card, { backgroundColor: colors.background.secondary }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              ARTIST BIOGRAPHY
            </Text>
            {enrichSource && (
              <Text style={[styles.sourceTag, { color: colors.text.disabled }]}>
                {enrichSource === "db" ? "dari cache lokal" : "MusicBrainz + Wikipedia"}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleFetchOnlineMetadata}
            disabled={enrichState === "loading"}
            style={[styles.miniBtn, { backgroundColor: colors.background.tertiary }]}
          >
            {enrichState === "loading" ? (
              <ActivityIndicator size="small" color={colors.primary[500]} />
            ) : (
              <RefreshCw size={14} color={colors.primary[500]} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.artistImageWrapper}>
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: colors.background.tertiary,
                borderRadius: 16,
              },
            ]}
          >
            <Music size={48} color={colors.text.disabled} />
          </View>
          {artistImageUrl && (
            <Image
              source={{ uri: artistImageUrl }}
              style={styles.artistImage}
              contentFit="cover"
              transition={300}
            />
          )}
        </View>

        {enrichState === "error" ? (
          <View style={styles.errorState}>
            <WifiOff size={20} color={colors.status.error} />
            <Text style={[styles.errorText, { color: colors.status.error }]}>
              Gagal mengambil data. Cek koneksi internet.
            </Text>
          </View>
        ) : artistBio ? (
          <Text style={[styles.bioText, { color: colors.text.secondary }]}>
            {artistBio}
          </Text>
        ) : (
          <Text style={[styles.bioText, { color: colors.text.disabled }]}>
            Belum ada biografi. Tekan tombol refresh untuk mengambil data dari MusicBrainz.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const InfoRow = ({ label, value, colors, isPath }: any) => (
  <View style={[styles.infoRow, { borderBottomColor: colors.border.light }]}>
    <Text style={[styles.infoLabel, { color: colors.text.tertiary }]}>{label}</Text>
    <Text
      style={[styles.infoValue, { color: colors.text.primary }]}
      numberOfLines={isPath ? 2 : 1}
      ellipsizeMode={isPath ? "middle" : "tail"}
    >
      {value || "-"}
    </Text>
  </View>
);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  title: { fontSize: 28, fontWeight: "900", marginBottom: 24, letterSpacing: -0.5 },
  emptyText: { textAlign: "center", marginTop: 20, fontSize: 16, lineHeight: 24 },
  card: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 15 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  statusValue: { fontSize: 20, fontWeight: "800", marginVertical: 4 },
  warningText: { fontSize: 12, fontWeight: "600", marginTop: 8 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  infoLabel: { fontSize: 13, fontWeight: "500", flex: 0.4 },
  infoValue: { fontSize: 14, fontWeight: "600", flex: 0.6, textAlign: "right" },
  divider: { height: 1, marginVertical: 8, opacity: 0.3 },
  visualizerPlaceholder: { height: 160, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  sourceTag: { fontSize: 10, marginTop: 2, fontStyle: "italic" },
  miniBtn: { padding: 8, borderRadius: 10, minWidth: 32, alignItems: "center" },
  artistImageWrapper: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  artistImage: { width: "100%", height: "100%" },
  bioText: { fontSize: 14, lineHeight: 22, textAlign: "justify" },
  errorState: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  errorText: { fontSize: 13, fontWeight: "600", flex: 1 },
}); 

