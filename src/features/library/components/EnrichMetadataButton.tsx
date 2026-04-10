/**
 * EnrichMetadataButton
 * Floating chip/button untuk quick access ke enrichment
 */

import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useScanManager } from "../hooks/useScanManager";

interface Props {
  onPress: () => void;
  variant?: "chip" | "button";
}

export function EnrichMetadataButton({ onPress, variant = "chip" }: Props) {
  const { unenrichedCount, isEnriching } = useScanManager();

  if (unenrichedCount === 0 || isEnriching) return null;

  if (variant === "button") {
    return (
      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>
          ✨ Enhance Metadata ({unenrichedCount})
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.chip} onPress={onPress}>
      <Text style={styles.chipIcon}>✨</Text>
      <Text style={styles.chipText}>{unenrichedCount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a4a3a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipText: {
    color: "#90ee90",
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#4a8a5a",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
