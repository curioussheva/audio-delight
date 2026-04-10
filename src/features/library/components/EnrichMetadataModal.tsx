/**
 * EnrichMetadataModal
 * Modal untuk batch metadata enhancement
 */

import React, { useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useScanManager } from "../hooks/useScanManager";
import { useTheme } from "@/shared/context/ThemeContext";
import { Sparkles, X, CheckCircle } from "lucide-react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EnrichMetadataModal({ visible, onClose }: Props) {
  const { colors } = useTheme().theme;
  const {
    unenrichedCount,
    enrichMetadata,
    isEnriching,
    enrichmentProgress,
    cancelScan,
  } = useScanManager();

  const [result, setResult] = useState<{
    processed: number;
    success: number;
    failed: number;
  } | null>(null);

  const handleStart = useCallback(async () => {
    setResult(null);
    const res = await enrichMetadata({
      limit: 100, // Batch size per session
      onProgress: () => {}, // Progress di-handle oleh store
    });
    setResult(res);
  }, [enrichMetadata]);

  const handleClose = useCallback(() => {
    if (isEnriching) {
      cancelScan();
    }
    setResult(null);
    onClose();
  }, [isEnriching, cancelScan, onClose]);

  // Calculate progress percentage
  const progressPercent =
    enrichmentProgress && enrichmentProgress.total > 0
      ? Math.round(
          (enrichmentProgress.current / enrichmentProgress.total) * 100,
        )
      : 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
        <View
          style={[
            styles.content,
            { backgroundColor: colors.background.primary },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Enhance Metadata
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <X size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Initial State */}
          {!isEnriching && !result && (
            <>
              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: colors.background.secondary },
                ]}
              >
                <Sparkles size={48} color={colors.status.success} />
                <Text style={[styles.count, { color: colors.status.success }]}>
                  {unenrichedCount}
                </Text>
                <Text style={[styles.label, { color: colors.text.secondary }]}>
                  songs can be enhanced with rich metadata
                </Text>
                <Text style={[styles.detail, { color: colors.text.tertiary }]}>
                  Including artwork, lyrics, album info, and audio properties
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.status.success },
                  unenrichedCount === 0 && { opacity: 0.5 },
                ]}
                onPress={handleStart}
                disabled={unenrichedCount === 0}
              >
                <Text style={styles.primaryButtonText}>
                  {unenrichedCount > 0
                    ? `Enhance ${Math.min(100, unenrichedCount)} Songs`
                    : "All Songs Enriched ✓"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Progress State */}
          {isEnriching && enrichmentProgress && (
            <>
              <ActivityIndicator size="large" color={colors.status.success} />

              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { backgroundColor: colors.background.tertiary },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: colors.status.success,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.progressText,
                    { color: colors.text.secondary },
                  ]}
                >
                  {enrichmentProgress.current} of {enrichmentProgress.total}
                </Text>
              </View>

              {enrichmentProgress.currentSong && (
                <Text
                  style={[styles.songName, { color: colors.text.secondary }]}
                  numberOfLines={1}
                >
                  {enrichmentProgress.currentSong}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { borderColor: colors.status.error },
                ]}
                onPress={cancelScan}
              >
                <Text
                  style={[
                    styles.cancelButtonText,
                    { color: colors.status.error },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Result State */}
          {result && (
            <>
              <CheckCircle size={64} color={colors.status.success} />
              <Text
                style={[styles.successTitle, { color: colors.text.primary }]}
              >
                Enhancement Complete!
              </Text>

              <View style={styles.resultGrid}>
                <View
                  style={[
                    styles.resultItem,
                    { backgroundColor: colors.background.secondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.resultNumber,
                      { color: colors.text.primary },
                    ]}
                  >
                    {result.processed}
                  </Text>
                  <Text
                    style={[
                      styles.resultLabel,
                      { color: colors.text.secondary },
                    ]}
                  >
                    Processed
                  </Text>
                </View>
                <View
                  style={[
                    styles.resultItem,
                    { backgroundColor: colors.status.success + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.resultNumber,
                      { color: colors.status.success },
                    ]}
                  >
                    {result.success}
                  </Text>
                  <Text
                    style={[
                      styles.resultLabel,
                      { color: colors.status.success },
                    ]}
                  >
                    Success
                  </Text>
                </View>
                <View
                  style={[
                    styles.resultItem,
                    { backgroundColor: colors.status.error + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.resultNumber,
                      { color: colors.status.error },
                    ]}
                  >
                    {result.failed}
                  </Text>
                  <Text
                    style={[styles.resultLabel, { color: colors.status.error }]}
                  >
                    Failed
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.status.success },
                ]}
                onPress={handleClose}
              >
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  infoBox: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
  },
  count: {
    fontSize: 48,
    fontWeight: "bold",
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  detail: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  progressContainer: {
    width: "100%",
    marginVertical: 20,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  songName: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    fontStyle: "italic",
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "center",
  },
  cancelButtonText: {
    fontWeight: "600",
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  resultGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  resultItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 12,
  },
  resultNumber: {
    fontSize: 24,
    fontWeight: "bold",
  },
  resultLabel: {
    fontSize: 12,
    marginTop: 4,
  },
});
