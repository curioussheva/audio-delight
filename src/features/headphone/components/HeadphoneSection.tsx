// src/features/headphone/components/HeadphoneSection.tsx
//
// Seksi koreksi headphone untuk layar Equalizer.
//
// Diletakkan DI ATAS kontrol EQ 10-band karena urutan pemrosesannya begitu:
// koreksi menetralkan alat dulu, baru EQ menyetel selera. Menaruh kontrol EQ
// di atas akan menyesatkan tentang urutan yang sebenarnya.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { useHeadphoneCorrection } from "../hooks/useHeadphoneCorrection";

interface Props {
  /** Warna aksen dari layar induk, supaya konsisten dengan tema aktif. */
  accent?: string;
}

export const HeadphoneSection: React.FC<Props> = ({ accent }) => {
  const { theme } = useTheme();

  const colors = theme.colors;
  const spacing = theme.spacing;
  const tint = accent ?? colors.primary[500];

  const {
    profiles,
    activeProfile,
    enabled,
    currentDevice,
    boundProfileId,
    importPreset,
    activate,
    deactivate,
    remove,
    bindCurrentDevice,
    hasBinding,
  } = useHeadphoneCorrection();

  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);

    const result = await importPreset(importName, importText);

    setImporting(false);

    if (!result.ok) {
      // Native menolak. Pesannya sengaja menyebut sebab yang paling sering:
      // format tidak dikenali, atau lebih dari 16 filter.
      setImportError(
        "Preset ditolak. Pastikan formatnya AutoEQ/Squiglink " +
          "(baris \"Preamp:\" dan \"Filter N: ON PK/LSC/HSC ...\"), " +
          "maksimal 16 filter.",
      );
      return;
    }

    setShowImport(false);
    setImportName("");
    setImportText("");
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xs,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Koreksi Headphone
        </Text>

        {activeProfile && (
          <TouchableOpacity
            onPress={() => void deactivate()}
            style={[styles.pill, { borderColor: colors.border.medium }]}
          >
            <Text style={[styles.pillText, { color: colors.text.secondary }]}>
              Matikan
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Perangkat aktif - ini yang menentukan profil mana yang otomatis
          dipasang, jadi harus terlihat jelas. */}
      <Text style={[styles.device, { color: colors.text.secondary }]}>
        {currentDevice
          ? `Perangkat: ${currentDevice.name}`
          : "Perangkat output belum terdeteksi"}
      </Text>

      {hasBinding && (
        <Text style={[styles.bound, { color: tint }]}>
          Terikat ke perangkat ini - profil dipasang otomatis
        </Text>
      )}

      {profiles.length === 0 ? (
        <Text style={[styles.empty, { color: colors.text.secondary }]}>
          Belum ada profil. Impor preset AutoEQ/Squiglink untuk memulai.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { gap: spacing.sm }]}
        >
          {profiles.map((p) => {
            const isActive = enabled && p.id === activeProfile?.id;
            const isBound = p.id === boundProfileId;

            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  if (isActive) {
                    void deactivate();
                  } else {
                    void activate(p.id);
                  }
                }}
                onLongPress={() => remove(p.id)}
                style={[
                  styles.card,
                  {
                    backgroundColor: isActive ? tint + "22" : colors.background.elevated,
                    borderColor: isActive ? tint : colors.border.medium,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.cardTitle,
                    { color: isActive ? tint : colors.text.primary },
                  ]}
                >
                  {p.name}
                </Text>

                <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>
                  {p.filterCount} filter
                </Text>

                {isBound && (
                  <Text style={[styles.cardMeta, { color: tint }]}>
                    terikat
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.actions, { gap: spacing.sm }]}>
        <TouchableOpacity
          onPress={() => setShowImport(true)}
          style={[styles.action, { borderColor: tint }]}
        >
          <Text style={[styles.actionText, { color: tint }]}>
            Impor preset
          </Text>
        </TouchableOpacity>

        {activeProfile && (
          <TouchableOpacity
            onPress={() =>
              bindCurrentDevice(hasBinding ? null : activeProfile.id)
            }
            disabled={!currentDevice}
            style={[
              styles.action,
              {
                borderColor: colors.border.medium,
                opacity: currentDevice ? 1 : 0.4,
              },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.text.primary }]}>
              {hasBinding ? "Lepas ikatan" : "Ikat ke perangkat ini"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showImport}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImport(false)}
      >
        <View
          style={[
            styles.modalBackdrop,
            { backgroundColor: colors.background.overlay ?? "rgba(0,0,0,0.55)" },
          ]}
        >
          <View
            style={[
              styles.modal,
              {
                backgroundColor: colors.background.elevated,
                marginHorizontal: spacing.lg,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
              Impor preset
            </Text>

            <TextInput
              value={importName}
              onChangeText={setImportName}
              placeholder="Nama (mis. Moondrop Chu)"
              placeholderTextColor={colors.text.secondary}
              style={[
                styles.input,
                { color: colors.text.primary, borderColor: colors.border.medium },
              ]}
            />

            <TextInput
              value={importText}
              onChangeText={setImportText}
              placeholder={
                "Preamp: -6.8 dB\nFilter 1: ON PK Fc 105 Hz Gain 5.5 dB Q 0.70"
              }
              placeholderTextColor={colors.text.secondary}
              multiline
              style={[
                styles.input,
                styles.inputMulti,
                { color: colors.text.primary, borderColor: colors.border.medium },
              ]}
            />

            {importError && (
              <Text style={[styles.error, { color: colors.status.error }]}>
                {importError}
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowImport(false);
                  setImportError(null);
                }}
                style={[styles.modalBtn, { borderColor: colors.border.medium }]}
              >
                <Text style={{ color: colors.text.primary }}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void handleImport()}
                disabled={importing || !importText.trim()}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: tint,
                    borderColor: tint,
                    opacity: importText.trim() ? 1 : 0.4,
                  },
                ]}
              >
                {importing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    Simpan
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // Angka spacing diambil dari token tema (`theme.spacing`), bukan literal -
  // layar lain memakai skala yang sama, jadi ritmenya konsisten.
  // Warna sengaja TIDAK di sini: semuanya dari `theme.colors` saat render.
  wrap: {},

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 16, fontWeight: "600" },
  pill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12 },
  device: { fontSize: 12, marginTop: 4 },
  bound: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  empty: { fontSize: 13, marginTop: 10 },
  list: { marginTop: 10 },
  listContent: {},

  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
  },
  cardTitle: { fontSize: 13, fontWeight: "600" },
  cardMeta: { fontSize: 11, marginTop: 2 },
  actions: { flexDirection: "row", marginTop: 12 },

  action: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionText: { fontSize: 13, fontWeight: "500" },
  modalBackdrop: { flex: 1, justifyContent: "center" },
  modal: { borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  inputMulti: { minHeight: 110, textAlignVertical: "top" },
  error: { fontSize: 12, marginBottom: 8 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
});

export default HeadphoneSection;
