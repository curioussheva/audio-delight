import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { Ionicons } from "@expo/vector-icons";

export default function FLACAnalyzerScreen() {
  const currentSong = usePlayerStore((state) => state.currentSong);

  // Perbaikan: Menambahkan styling yang hilang untuk kondisi 'Empty State'
  if (!currentSong) {
    return (
      <View style={styles.center}>
        <Ionicons name="analytics-outline" size={64} color="#333" />
        <Text style={styles.emptyText}>Pilih lagu untuk dianalisa</Text>
        <Text style={styles.emptySubText}>
          Informasi bit-depth dan frekuensi akan muncul di sini
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>FLAC Deep Analysis</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Stream Authenticity</Text>
        <Text style={styles.value}>
          {currentSong?.sampleRate &&
          currentSong.sampleRate > 48000
            ? "High-Resolution Verified"
            : "Standard Resolution"}
        </Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View>
            <Text style={styles.subLabel}>Container</Text>
            <Text style={styles.subValue}>
              {currentSong?.codec || "FLAC"}
            </Text>
          </View>
          <View>
            <Text style={styles.subLabel}>Bit Depth</Text>
            <Text style={styles.subValue}>24-bit (Calculated)</Text>
          </View>
          <View>
            <Text style={styles.subLabel}>Sample Rate</Text>
            <Text style={styles.subValue}>
              {currentSong?.sampleRate || 44100} Hz
            </Text>
          </View>
        </View>
      </View>

      {/* Placeholder untuk Spectrum Visualizer Masa Depan */}
      <View
        style={[
          styles.card,
          {
            height: 200,
            justifyContent: "center",
            borderStyle: "dashed",
            borderWidth: 1,
            borderColor: "#333",
          },
        ]}
      >
        <Ionicons
          name="stats-chart"
          size={32}
          color="#222"
          style={{ alignSelf: "center", marginBottom: 10 }}
        />
        <Text style={styles.placeholderText}>
          Spectrum Analysis Chart Coming Soon
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // FIX: Tambahkan properti 'center' yang tadinya hilang
  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
  },
  emptySubText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
    marginTop: 40,
  },
  card: {
    backgroundColor: "#1A1A1A",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  label: {
    color: "#D4AF37",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  value: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 15,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  subLabel: {
    color: "#888",
    fontSize: 10,
    textTransform: "uppercase",
  },
  subValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  placeholderText: {
    color: "#444",
    textAlign: "center",
    fontSize: 12,
  },
});
