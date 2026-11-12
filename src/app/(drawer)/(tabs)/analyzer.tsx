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

// Hooks & Store
import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useAudioSessionRetry } from "@/features/player/hooks/useAudioSessionRetry";
import { FLOATING_PLAYER_CLEARANCE } from "@/features/player/layout";
import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { getOutputModeLabel } from "@/features/visualizer/api/outputModeLabel";

// Logic & Services
import {
  analyzeBitDepth,
  BitDepthAnalysis,
} from "@/features/audio/api/BitDepthVerifier";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import { cleanAnalyzerWarnings } from "@/features/visualizer/api/analyzerWarnings";
import { formatFileSize } from "@/shared/types/audio";
import SQLiteService from "@/shared/lib/sqlite";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";

const { width: screenWidth } = Dimensions.get("window");

type EnrichState = "idle" | "loading" | "success" | "error";

export default function AnalyzerScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;

  // Reaktif dari playerStore — session ID diset oleh playback.ts, bukan di sini
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const audioSessionId = usePlayerStore((state) => state.audioSessionId);
  const {
    currentDevice,
    status: outputStatus,
    pathKind,
    pathLossy,
    canBeBitPerfect,
  } = useAudioOutput();

  // C-LABEL (2026-11-12): label "Mode" di bawah butuh status exclusive
  // NYATA, bukan yang diminta. isExclusiveModeActive() sync, tapi false
  // mentah tidak membedakan "AAudio menolak" dari "native belum siap /
  // bacaan basi saat pause" — hook ini yang membedakannya (unavailable /
  // stale), dan INITIAL-nya "belum tahu", bukan exclusive. Dipanggil di
  // atas early return `if (!currentSong)` (Rules of Hooks, U-P0-4).
  const bpStatus = useBitPerfectStatus();

  // Local state
  const [bitDepthAnalysis, setBitDepthAnalysis] =
    useState<BitDepthAnalysis | null>(null);
  // Lagu yang dimiliki hasil analisis di atas — ditampilkan di kartu
  // verdict supaya tidak tertukar dengan lagu yang sedang diputar.
  const [analyzedSong, setAnalyzedSong] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [artistImageUrl, setArtistImageUrl] = useState<string | null>(null);
  const [artistBio, setArtistBio] = useState<string | null>(null);
  const [enrichState, setEnrichState] = useState<EnrichState>("idle");
  const [enrichSource, setEnrichSource] = useState<"db" | "musicbrainz" | null>(
    null,
  );
  const [waitingForSession, setWaitingForSession] = useState(false);

  // U-P2-24: pola "tidak ada audio session" disamakan dengan tab
  // Visualizer — pesan yang sama + tombol retry yang benar-benar
  // memulihkan sesi (hook yang sama). Sebelumnya Analyzer cuma
  // menunggu tanpa tombol aksi.
  const { isRetrying, retryAudioSession } = useAudioSessionRetry();

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Waiting indicator — tampilkan setelah 2 detik jika playing tapi belum ada session
  useEffect(() => {
    if (audioSessionId && audioSessionId > 0) {
      setWaitingForSession(false);
    } else if (isPlaying) {
      const timer = setTimeout(() => setWaitingForSession(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setWaitingForSession(false);
    }
  }, [audioSessionId, isPlaying]);

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
          [currentSong.id],
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
      setAnalyzedSong(null);
      return;
    }

    // Hasil lama dibersihkan saat lagu berganti — sebelumnya verdict lagu
    // lama tetap tampil sampai analisis baru selesai (atau selamanya kalau
    // analisis baru gagal), tanpa label file yang dianalisis.
    setBitDepthAnalysis(null);
    setAnalyzedSong(null);

    let cancelled = false;
    const song = currentSong;
    const runAnalysis = async () => {
      setIsAnalyzing(true);
      try {
        const result = await analyzeBitDepth(song);
        if (cancelled) return;
        setBitDepthAnalysis(result);
        setAnalyzedSong({ id: song.id, title: song.title });
      } catch (err) {
        console.warn("[Analyzer] Bit depth analysis failed:", err);
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    };

    runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const doFetch = useCallback(async (artistName: string) => {
    setEnrichState("loading");
    try {
      const enrichment =
        await OnlineMetadataService.getArtistEnrichment(artistName);
      if (enrichment.source === "fallback") {
        setEnrichState("error");
        Alert.alert(
          "Artist Tidak Ditemukan",
          `Tidak ada data untuk "${artistName}" di MusicBrainz.\nPeriksa ejaan nama artist di metadata lagu.`,
        );
        return;
      }

      setArtistImageUrl(enrichment.imageUrl);
      setArtistBio(enrichment.bio);
      setEnrichSource("musicbrainz");
      setEnrichState("success");
    } catch {
      setEnrichState("error");
      Alert.alert(
        "Gagal Mengambil Data",
        "Periksa koneksi internet dan coba lagi.",
      );
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
        ],
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

  // JANGAN pernah default ke AUTHENTIC (2026-11-11): kalau analisis
  // gagal / belum ada hasilnya, statusnya "TIDAK DAPAT DIVERIFIKASI" —
  // sebelumnya kegagalan tampil sebagai "STUDIO MASTER AUTHENTIC"
  // karena isFake=false adalah nilai default.
  const getQualityStatus = () => {
    if (isAnalyzing)
      return { text: "ANALYZING...", color: colors.text.tertiary };
    if (bitDepthAnalysis?.isFake) {
      // Label mengikuti JENIS temuan spektral — sebelumnya semua fake
      // tampil "UPSCALE DETECTED", termasuk padding (file 05).
      const v = bitDepthAnalysis.spectralVerdict;
      if (v === "padding")
        return { text: "PADDING DETECTED ⚠️", color: colors.status.error };
      if (v === "lossy-source")
        return { text: "LOSSY SOURCE ⚠️", color: colors.status.error };
      if (v === "upsample")
        return { text: "UPSCALE DETECTED ⚠️", color: colors.status.error };
      return { text: "TIDAK AUTENTIK ⚠️", color: colors.status.error };
    }
    if (!bitDepthAnalysis || bitDepthAnalysis.confidence === 0)
      return {
        text: "TIDAK DAPAT DIVERIFIKASI",
        color: colors.text.tertiary,
      };
    // AUTHENTIC hanya kalau BENAR-BENAR terukur dan konsisten (2026-11-11,
    // perbaikan U-P0-2): FFT native harus jalan dan verdict-nya konsisten,
    // dan metadata harus terbaca. Tanpa ukur — FFT gagal, atau metadata
    // gagal dibaca sehingga verdict cuma estimasi dari nama file & ukuran
    // — statusnya "TIDAK DAPAT DIVERIFIKASI", bukan AUTHENTIC.
    if (
      bitDepthAnalysis.spectralVerdict !== "consistent" ||
      bitDepthAnalysis.metadataFailed
    )
      return {
        text: "TIDAK DAPAT DIVERIFIKASI",
        color: colors.text.tertiary,
      };
    // "STUDIO MASTER" hanya untuk yang di atas CD-quality (U-P1-02):
    // file 16-bit/44,1 kHz yang terukur konsisten adalah CD quality,
    // bukan studio master. Nilai diambil mentah dari currentSong —
    // tanpa fallback 16/44100 (fallback itu yang membuat label palsu).
    const declaredDepth = currentSong?.bitDepth ?? 0;
    const declaredRate = currentSong?.sampleRate ?? 0;
    if (declaredDepth > 16 || declaredRate > 48000)
      return { text: "STUDIO MASTER AUTHENTIC", color: colors.status.success };
    return { text: "CD QUALITY AUTHENTIC", color: colors.status.success };
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
      <View
        style={[styles.center, { backgroundColor: colors.background.primary }]}
      >
        <Music size={48} color={colors.text.disabled} />
        <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
          Putar lagu untuk melihat analisis audio
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + FLOATING_PLAYER_CLEARANCE + 8,
      }}
    >
      {/* U-P2-53: header bersama. Judul 28/900 lama jadi 20/700 —
          perubahan visual kecil yang disengaja demi satu pola header.
          ScrollView sudah punya paddingHorizontal 16, jadi header ini
          tanpa padding horizontal sendiri; marginBottom 24 dipertahankan. */}
      <ScreenHeader
        title="Audio Analyzer"
        style={{ paddingHorizontal: 0, paddingVertical: 0, marginBottom: 24 }}
      />

      {/* 1. SPECTRUM VISUALIZER */}
      {audioSessionId && audioSessionId > 0 ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.secondary, padding: 16 },
          ]}
        >
          <View style={[styles.cardHeader, { marginBottom: 12 }]}>
            <BarChart3 size={16} color={colors.primary[500]} />
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              SPECTRUM ANALYZER
            </Text>
          </View>
          <SpectrumAnalyzer
            width={screenWidth - 64}
            height={160}
            barCount={48}
            color={colors.primary[500]}
            backgroundColor="transparent"
            sensitivity={2.2}
            isPlaying={isPlaying}
            audioSessionId={audioSessionId}
          />
        </View>
      ) : (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.visualizerPlaceholder}>
            {isPlaying ? (
              <>
                <ActivityIndicator color={colors.primary[500]} />
                {waitingForSession ? (
                  <>
                    <Text
                      style={{ color: colors.text.tertiary, marginTop: 12 }}
                    >
                      Audio session tidak tersedia. Coba restart lagu.
                    </Text>
                    <TouchableOpacity
                      onPress={retryAudioSession}
                      disabled={isRetrying}
                      style={[
                        styles.retryBtn,
                        {
                          backgroundColor: colors.background.tertiary,
                          opacity: isRetrying ? 0.4 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Coba pulihkan audio session"
                    >
                      <RefreshCw size={16} color={colors.primary[500]} />
                      <Text
                        style={[
                          styles.retryBtnText,
                          { color: colors.primary[500] },
                        ]}
                      >
                        Coba lagi
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={{ color: colors.text.tertiary, marginTop: 12 }}>
                    Mempersiapkan visualizer...
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ color: colors.text.disabled, fontSize: 13 }}>
                Putar lagu untuk melihat spektrum
              </Text>
            )}
          </View>
        </View>
      )}

      {/* 2. AUTHENTICITY STATUS */}
      <View
        style={[styles.card, { backgroundColor: colors.background.secondary }]}
      >
        <Text style={[styles.label, { color: colors.primary[500] }]}>
          STREAM AUTHENTICITY
        </Text>
        <Text style={[styles.statusValue, { color: status.color }]}>
          {status.text}
        </Text>
        {bitDepthAnalysis && analyzedSong && (
          <Text style={[styles.warningText, { color: colors.text.tertiary }]}>
            Hasil untuk: {analyzedSong.title}
          </Text>
        )}
        {bitDepthAnalysis?.isFake && (
          <Text style={[styles.warningText, { color: colors.status.error }]}>
            File declares {bitDepthAnalysis.declaredDepth}-bit, but real data is{" "}
            {bitDepthAnalysis.realDepth}-bit.
          </Text>
        )}
        {bitDepthAnalysis?.fakeReason && (
          <Text style={[styles.warningText, { color: colors.status.error }]}>
            {bitDepthAnalysis.fakeReason.replace(/^\[FFT\] /, "")}
          </Text>
        )}
        {/* U-P2-21: warnings dibersihkan dari prefix "[FFT] " dan
            didedup terhadap fakeReason — temuan spektral yang sama
            jangan tampil dua kali (sekali bersih, sekali ber-tag). */}
        {cleanAnalyzerWarnings(
          bitDepthAnalysis?.warnings,
          bitDepthAnalysis?.fakeReason,
        ).map((w, i) => (
          <Text
            key={i}
            style={[styles.warningText, { color: colors.text.tertiary }]}
          >
            {w}
          </Text>
        ))}
      </View>

      {/* 2b. SPEKTRUM TERUKUR (FFT) — hanya kalau native berhasil */}
      {bitDepthAnalysis?.spectral && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.cardHeader}>
            <BarChart3 size={16} color={colors.primary[500]} />
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              SPEKTRUM TERUKUR (FFT)
            </Text>
          </View>
          <InfoRow
            label="Cutoff terukur"
            value={`${(bitDepthAnalysis.spectral.measuredCutoffHz / 1000).toFixed(1)} kHz`}
            colors={colors}
          />
          {/* U-P2-26: baris LSB hanya bermakna bila file mengaku 24-bit —
              untuk file 16-bit asli nilainya selalu ~100% menurut definisi
              (trivial, bukan temuan), jadi disembunyikan. */}
          {bitDepthAnalysis.declaredDepth === 24 && (
            <InfoRow
              label="LSB 16-bit"
              value={`${(bitDepthAnalysis.spectral.lsbZeroRatio16 * 100).toFixed(0)}% sampel di grid 16-bit`}
              colors={colors}
            />
          )}
          <InfoRow
            label="Peak / RMS"
            value={`${bitDepthAnalysis.spectral.peakDbfs.toFixed(1)} / ${bitDepthAnalysis.spectral.rmsDbfs.toFixed(1)} dBFS`}
            colors={colors}
          />
          <InfoRow
            label="Jendela FFT"
            value={`${bitDepthAnalysis.spectral.windowsUsed} × 8192 frame`}
            colors={colors}
          />
          {bitDepthAnalysis.spectralVerdict === "consistent" && (
            <Text style={[styles.warningText, { color: colors.text.tertiary }]}>
              Konten terukur konsisten dengan klaim file.
            </Text>
          )}
        </View>
      )}

      {/* 3. SONG INFORMATION */}
      <View
        style={[styles.card, { backgroundColor: colors.background.secondary }]}
      >
        <View style={styles.cardHeader}>
          <Info size={16} color={colors.primary[500]} />
          <Text style={[styles.label, { color: colors.primary[500] }]}>
            SONG INFORMATION
          </Text>
        </View>
        <InfoRow label="Title" value={currentSong.title} colors={colors} />
        <InfoRow label="Artist" value={currentSong.artist} colors={colors} />
        <InfoRow label="Album" value={currentSong.album} colors={colors} />
        <View
          style={[styles.divider, { backgroundColor: colors.border.light }]}
        />
        <InfoRow
          label="Filename"
          value={currentSong.filename}
          colors={colors}
        />
        <InfoRow
          label="Path"
          value={getReadablePath(currentSong.folder)}
          colors={colors}
          isPath
        />
      </View>

      {/* 4. TECHNICAL DETAILS */}
      <View
        style={[styles.card, { backgroundColor: colors.background.secondary }]}
      >
        <View style={styles.cardHeader}>
          <FileAudio size={16} color={colors.primary[500]} />
          <Text style={[styles.label, { color: colors.primary[500] }]}>
            TECHNICAL DETAILS
          </Text>
        </View>
        <InfoRow
          label="Format"
          value={currentSong.codec?.toUpperCase()}
          colors={colors}
        />
        <InfoRow
          label="Sample Rate"
          value={sampleRateDisplay}
          colors={colors}
        />
        <InfoRow
          label="Bit Depth"
          value={`${currentSong.bitDepth ?? 16}-bit`}
          colors={colors}
        />
        <InfoRow label="Bitrate" value={bitrateDisplay} colors={colors} />
        <InfoRow
          label="Size"
          value={formatFileSize(currentSong.fileSize ?? 0)}
          colors={colors}
        />
      </View>

      {/* 5. OUTPUT AKTIF - dari useAudioOutput (data NYATA)
          Sebelumnya blok ini memakai useUSBDAC, yang membaca modul stub
          (USBDACModule.kt tanpa JNI) sehingga nilainya karangan: perangkatnya
          bisa null, dan "Bit-Perfect (Direct)" muncul dari state lokal yang
          tidak pernah mencerminkan stream sebenarnya. */}
      {currentDevice && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.cardHeader}>
            <Cpu size={16} color={colors.primary[500]} />
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              OUTPUT AKTIF
            </Text>
          </View>
          <InfoRow
            label="Device"
            value={currentDevice.name || "Tidak diketahui"}
            colors={colors}
          />
          <InfoRow
            label="Jenis"
            value={currentDevice.type}
            colors={colors}
          />
          <InfoRow
            label="Laju"
            value={
              currentDevice.sampleRate
                ? `${(currentDevice.sampleRate / 1000).toFixed(1)} kHz`
                : "Tidak dilaporkan"
            }
            colors={colors}
          />
          <InfoRow
            label="Mode"
            value={getOutputModeLabel({
              canBeBitPerfect,
              rateHonored: outputStatus?.rateHonored ?? false,
              pathLossy,
              honored: outputStatus?.honored ?? false,
              streamExclusive: bpStatus.streamExclusive,
              // Belum terkonfirmasi = native belum siap ATAU bacaan bisa
              // basi (pause) — label jatuh ke "Tidak dapat diverifikasi",
              // bukan mengklaim Bit-Perfect (C-LABEL).
              exclusiveUnknown: bpStatus.unavailable || bpStatus.stale,
            })}
            colors={colors}
          />
          <InfoRow
            label="Jalur"
            value={
              pathKind === "direct"
                ? "Langsung ke perangkat"
                : pathKind === "audioflinger"
                  ? "Lewat mixer sistem"
                  : "Tidak diketahui"
            }
            colors={colors}
          />
        </View>
      )}

      {/* 6. ARTIST BIOGRAPHY */}
      <View
        style={[styles.card, { backgroundColor: colors.background.secondary }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.primary[500] }]}>
              ARTIST BIOGRAPHY
            </Text>
            {enrichSource && (
              <Text style={[styles.sourceTag, { color: colors.text.disabled }]}>
                {enrichSource === "db"
                  ? "dari cache lokal"
                  : "MusicBrainz + Wikipedia"}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleFetchOnlineMetadata}
            disabled={enrichState === "loading"}
            accessibilityRole="button"
            accessibilityLabel="Muat ulang biografi artis"
            style={[
              styles.miniBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
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

        {/* U-P2-25: error fetch TIDAK BOLEH menutupi bio yang sudah ada
            dari DB. Bila bio tersedia, error tampil sebagai banner
            kecil DI ATAS bio yang dipertahankan; tampilan error penuh
            hanya bila memang belum ada bio sama sekali. */}
        {artistBio ? (
          <>
            {enrichState === "error" && (
              <View style={styles.errorBanner}>
                <WifiOff size={14} color={colors.status.error} />
                <Text
                  style={[
                    styles.errorBannerText,
                    { color: colors.status.error },
                  ]}
                >
                  Gagal memperbarui data online — menampilkan biografi
                  tersimpan.
                </Text>
              </View>
            )}
            <Text style={[styles.bioText, { color: colors.text.secondary }]}>
              {artistBio}
            </Text>
          </>
        ) : enrichState === "error" ? (
          <View style={styles.errorState}>
            <WifiOff size={20} color={colors.status.error} />
            <Text style={[styles.errorText, { color: colors.status.error }]}>
              Gagal mengambil data. Cek koneksi internet.
            </Text>
          </View>
        ) : (
          <Text style={[styles.bioText, { color: colors.text.disabled }]}>
            Belum ada biografi. Tekan tombol refresh untuk mengambil data dari
            MusicBrainz.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const InfoRow = ({ label, value, colors, isPath }: any) => (
  <View style={[styles.infoRow, { borderBottomColor: colors.border.light }]}>
    <Text style={[styles.infoLabel, { color: colors.text.tertiary }]}>
      {label}
    </Text>
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
    lineHeight: 24,
  },
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 15,
  },
  // U-P2-53: `screenHeaderRow` dihapus — header layar sekarang
  // ScreenHeader (lihat di atas). `headerRow` yang tersisa adalah baris
  // kartu (space-between), bukan header layar.
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
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
  visualizerPlaceholder: {
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  retryBtnText: { fontSize: 14, fontWeight: "600" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  sourceTag: { fontSize: 10, marginTop: 2, fontStyle: "italic" },
  // U-P2-01: padding 8 + ikon 14 lama = ±30×32px, di bawah 44dp.
  miniBtn: {
    padding: 8,
    borderRadius: 10,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  artistImageWrapper: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  artistImage: { width: "100%", height: "100%" },
  bioText: { fontSize: 14, lineHeight: 22, textAlign: "justify" },
  errorState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(240,128,112,0.1)",
    marginBottom: 12,
  },
  errorBannerText: { fontSize: 12, fontWeight: "600", flex: 1 },
  errorText: { fontSize: 13, fontWeight: "600", flex: 1 },
});
