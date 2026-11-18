import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";
import { isLosslessCodec, isHiRes } from "@/shared/utils/audioQuality";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";

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

  // Warna dinamis berdasarkan kualitas. HI-RES memakai emas — tapi
  // emas terang #D4AF37 hanya terbaca di tema gelap (1,93:1 di
  // Porcelain, 2,00:1 di Hearth, diukur 2026-11-18). accentOn memilih
  // emas gelap #7A5C14 di tema terang (5,72/5,94:1) dan mempertahankan
  // emas terang di tema gelap (8,62/8,68:1) — identitas emas tetap,
  // teks lolos AA di semua tema.
  const accentColor = isActuallyHiRes
    ? accentOn(
        ["#D4AF37", "#7A5C14"],
        theme.colors.background.primary,
        [theme.colors.text.primary],
      )
    : theme.colors.primary[500];

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
    borderRadius: BASE_RADIUS.sm,
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
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 8,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
