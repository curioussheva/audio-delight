// shared/styles exports
// src/styles/premium.ts
import { StyleSheet } from "react-native";
const Platform = require("react-native").Platform;

export const premiumStyles = StyleSheet.create({
  // Kartu Utama yang terlihat melayang
  albumCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)", // Transparansi halus
    borderRadius: 24, // Lebih membulat agar cozy
    padding: 12,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  // Efek Glassmorphism untuk elemen kecil (seperti Badge Hi-Res)
  glassBadge: {
    backgroundColor: "rgba(212, 175, 55, 0.15)", // Warna emas transparan
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.3)",
  },
  // Teks Header yang berkelas
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", // Sedikit sentuhan serif agar mewah
  },
  badgeText: {
    color: "#D4AF37",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
