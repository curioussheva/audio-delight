// src/features/library/components/MetadataSyncModal.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Globe, X, Check, Database } from "lucide-react-native";
import { Image } from "expo-image";
import OnlineMetadataService from "../services/OnlineMetadataService";

export const MetadataSyncModal = ({
  visible,
  onClose,
  initialTitle,
  initialArtist,
  onSelect,
  colors,
}: any) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const data = await OnlineMetadataService.searchRecording(
      initialTitle,
      initialArtist,
    );
    setResults(data);
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.8)" }]}
      >
        <View
          style={[
            styles.modalContent,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
              MusicBrainz Sync
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {!results.length && !loading ? (
            <View style={styles.emptyState}>
              <Database size={48} color={colors.text.disabled} />
              <Text
                style={{
                  color: colors.text.secondary,
                  marginTop: 12,
                  textAlign: "center",
                }}
              >
                Cari metadata resmi untuk "{initialTitle}"
              </Text>
              <TouchableOpacity
                style={[
                  styles.searchBtn,
                  { backgroundColor: colors.primary[500] },
                ]}
                onPress={handleSearch}
              >
                <Globe size={18} color="#FFF" />
                <Text style={styles.btnText}>Cari Online</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary[500]}
              style={{ margin: 40 }}
            />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item: any) => item.mbid}
              renderItem={({ item }: any) => (
                <TouchableOpacity
                  style={[
                    styles.resultCard,
                    { borderColor: colors.border.light },
                  ]}
                  onPress={() => onSelect(item)}
                >
                  <Image
                    source={{
                      uri: OnlineMetadataService.getCoverArtUrl(item.releaseId),
                    }}
                    style={styles.resultArt}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{ color: colors.text.primary, fontWeight: "700" }}
                    >
                      {item.title}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                      {item.album} • {item.year}
                    </Text>
                    <Text
                      style={{
                        color: colors.primary[500],
                        fontSize: 11,
                        marginTop: 4,
                      }}
                    >
                      {item.label}
                    </Text>
                  </View>
                  <Check size={18} color={colors.primary[500]} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    height: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchBtn: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 10,
    marginTop: 20,
  },
  btnText: { color: "#FFF", fontWeight: "700" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
  },
  resultArt: { width: 50, height: 50, borderRadius: 8 },
});
