// components/library/EmptyLibrary.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyLibraryProps {
  colors: any;
  onScan: () => void;
  isScanning?: boolean;
  scanProgress?: number;
  scanTotal?: number;
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({
  colors,
  onScan,
  isScanning = false,
  scanProgress = 0,
  scanTotal = 0,
}) => {
  const percent =
    scanTotal > 0 ? Math.floor((scanProgress / scanTotal) * 100) : 0;

  return (
    <View style={styles.container}>
      <Ionicons
        name="musical-notes-outline"
        size={80}
        color={colors.text.tertiary}
      />
      <Text style={[styles.title, { color: colors.text.secondary }]}>
        Library Anda masih kosong
      </Text>

      {isScanning ? (
        <View style={styles.scanStatus}>
          <View style={styles.progressRow}>
            <ActivityIndicator
              size="small"
              color={colors.primary[500]}
              style={{ transform: [{ scale: 0.85 }] }}
            />
            <Text style={[styles.scanText, { color: colors.text.secondary }]}>
              {scanTotal > 0
                ? `Memindai ${scanProgress} / ${scanTotal} lagu`
                : "Menemukan file..."}
            </Text>
          </View>

          {scanTotal > 0 && (
            <>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: colors.background.tertiary },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary[500],
                      width: `${percent}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.pctText, { color: colors.primary[500] }]}>
                {percent}%
              </Text>
            </>
          )}
        </View>
      ) : (
        <>
          <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>
            Pindai folder musik untuk menemukan lagu-lagu Anda
          </Text>
          <TouchableOpacity
            style={[
              styles.scanBtn,
              {
                borderColor: colors.primary[500],
                backgroundColor: `${colors.primary[500]}10`,
              },
            ]}
            onPress={onScan}
            activeOpacity={0.8}
          >
            <Text style={{ color: colors.primary[500], fontWeight: "700" }}>
              SCAN PERANGKAT
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  scanBtn: {
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  scanStatus: {
    marginTop: 24,
    width: "100%",
    alignItems: "center",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  scanText: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  pctText: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
}); 