import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { isLosslessCodec, isHiRes } from "@/shared/utils/audioQuality";

export interface QualityBadgeProps {
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

  // Skema badge (U-P0-1 + U-P1-01): definisi LOSSLESS / HI-RES tinggal di
  // src/shared/utils/audioQuality.ts — satu sumber kebenaran. Jangan
  // definisikan ulang di sini. Ringkasnya: LOSSLESS ditentukan codec
  // SAJA (jangan pernah dari bitDepth — MediaStore memberi bitDepth
  // default 16 ke file yang tidak melaporkan BITS_PER_SAMPLE, lihat
  // MediaStoreModule.kt:33); HI-RES = lossless DAN (rate > 48 kHz atau
  // depth > 16 bit). "M4A" sengaja bukan lossless: wadah itu bisa berisi
  // ALAC (lossless) atau AAC (lossy).
  const isLossless = isLosslessCodec(codec);
  const isActuallyHiRes = isHiRes({ codec, sampleRate, bitDepth });

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
