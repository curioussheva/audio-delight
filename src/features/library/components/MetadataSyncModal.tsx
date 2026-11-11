// src/features/library/components/MetadataSyncModal.tsx
import React, { useEffect, useState } from "react";
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
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
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
  // U-P1-41: tiga keadaan dibedakan — belum dicari / tidak ditemukan /
  // error. Dulu ketiganya jatuh ke layar awal yang sama karena
  // searchRecording mengembalikan [] untuk error juga.
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Buka ulang untuk lagu lain mulai dari keadaan "belum dicari" — hasil
  // lagu sebelumnya tidak boleh tampil seolah milik lagu ini.
  useEffect(() => {
    if (visible) {
      setResults([]);
      setSearched(false);
      setSearchError(null);
    }
  }, [visible]);

  // Teks/ikon di atas tombol primary[500] — dipilih dari luminansi primary
  // (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#FFF".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  const handleSearch = async () => {
    setLoading(true);
    setSearchError(null);
    try {
      const data = await OnlineMetadataService.searchRecording(
        initialTitle,
        initialArtist,
      );
      setResults(data);
      setSearched(true);
    } catch (e: any) {
      // searchRecording melempar saat gagal jaringan / jawaban tak valid —
      // [] di sini hanya berarti "tidak ditemukan".
      setResults([]);
      setSearched(true);
      setSearchError(e?.message || "Gagal mencari metadata");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
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

          {!searched && !loading ? (
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
                <Globe size={18} color={onPrimary} />
                <Text style={[styles.btnText, { color: onPrimary }]}>
                  Cari Online
                </Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary[500]}
              style={{ margin: 40 }}
            />
          ) : searchError ? (
            <View style={styles.emptyState}>
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: 16,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                Gagal mencari metadata
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {searchError}
              </Text>
              <TouchableOpacity
                style={[
                  styles.searchBtn,
                  { backgroundColor: colors.primary[500] },
                ]}
                onPress={handleSearch}
                accessibilityRole="button"
                accessibilityLabel="Coba lagi mencari metadata"
              >
                <Globe size={18} color={onPrimary} />
                <Text style={[styles.btnText, { color: onPrimary }]}>
                  Coba lagi
                </Text>
              </TouchableOpacity>
            </View>
          ) : !results.length ? (
            <View style={styles.emptyState}>
              <Database size={48} color={colors.text.disabled} />
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: 16,
                  fontWeight: "700",
                  marginTop: 12,
                  textAlign: "center",
                }}
              >
                Tidak ditemukan
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                MusicBrainz tidak punya hasil untuk "{initialTitle}"
                {initialArtist ? ` — ${initialArtist}` : ""}
              </Text>
              <TouchableOpacity
                style={[
                  styles.searchBtn,
                  { backgroundColor: colors.primary[500] },
                ]}
                onPress={handleSearch}
                accessibilityRole="button"
                accessibilityLabel="Cari lagi metadata"
              >
                <Globe size={18} color={onPrimary} />
                <Text style={[styles.btnText, { color: onPrimary }]}>
                  Cari lagi
                </Text>
              </TouchableOpacity>
            </View>
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
  // U-P2-04: tanpa `color` — warna teks selalu di-overide inline dengan
  // onPrimary (pickReadable atas primary[500]) di pemakaian style ini.
  btnText: { fontWeight: "700" },
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
