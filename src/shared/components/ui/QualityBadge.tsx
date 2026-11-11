import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/context/ThemeContext";

export interface QualityBadgeProps {
  isHiRes?: boolean;
  sampleRate?: number;
  bitDepth?: number;
  codec?: string;
}

export default function QualityBadge({
  sampleRate,
  bitDepth,
  codec,
}: QualityBadgeProps) {
  const { theme } = useTheme();

  // Skema badge (2026-11-11, perbaikan U-P0-1): LOSSLESS ditentukan
  // codec SAJA — jangan pernah dari bitDepth. MediaStore memberi
  // bitDepth default 16 ke file yang tidak melaporkan BITS_PER_SAMPLE
  // (MediaStoreModule.kt:33), jadi `bitDepth >= 16` melabeli MP3/AAC/
  // OPUS sebagai LOSSLESS. "M4A" sengaja TIDAK masuk: wadah itu bisa
  // berisi ALAC (lossless) atau AAC (lossy) — dari namanya saja tidak
  // bisa dibedakan, jadi jangan klaim. Daftar ini harus tetap sinkron
  // dengan LOSSLESS_CODECS di analyzer.ts dan selectors.ts (unifikasi
  // jadi satu sumber kebenaran dicatat sebagai U-P1-01, sesi berikut).
  const LOSSLESS_CODECS = new Set([
    "FLAC",
    "ALAC",
    "WAV",
    "AIFF",
    "APE",
    "WAVPACK",
    "TTA",
    "DSD",
    "DSF",
    "DFF",
  ]);

  const codecKey = codec?.toUpperCase() ?? "";
  const isLossless = LOSSLESS_CODECS.has(codecKey);

  // HI-RES = lossless DAN benar-benar melebihi CD (rate > 48 kHz atau
  // depth > 16 bit). AAC 96 kHz bukan HI-RES — codec-nya lossy, apa pun
  // sample ratenya.
  const isActuallyHiRes =
    isLossless &&
    ((sampleRate ? sampleRate > 48000 : false) ||
      (bitDepth ? bitDepth > 16 : false));

  if (!isLossless && !isActuallyHiRes) return null;

  // Warna dinamis berdasarkan kualitas
  const accentColor = isActuallyHiRes ? "#D4AF37" : theme.colors.primary[500];

  return (
    <View
      style={[
        styles.container,
        { borderColor: accentColor + "40" }, // Tambah transparansi pada border
        isActuallyHiRes ? styles.hiResShadow : null,
      ]}
    >
      {/* Perbaikan: Ganti styles.badge yang tidak ada menjadi styles.text */}
      <Text style={[styles.text, { color: accentColor }]}>
        {isActuallyHiRes ? "HI-RES" : "LOSSLESS"}
      </Text>

      {sampleRate ? (
        <Text style={[styles.infoText, { color: theme.colors.text.secondary }]}>
          {(sampleRate / 1000).toFixed(1)}kHz
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  hiResShadow: {
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 8,
    fontWeight: "600",
  },
});
