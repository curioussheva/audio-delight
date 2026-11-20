// src/features/headphone/components/HeadphoneSection.tsx
//
// Seksi koreksi headphone untuk layar Equalizer.
//
// Diletakkan DI ATAS kontrol EQ 10-band karena urutan pemrosesannya begitu:
// koreksi menetralkan alat dulu, baru EQ menyetel selera. Menaruh kontrol EQ
// di atas akan menyesatkan tentang urutan yang sebenarnya.

import React, { memo, useMemo, useState } from "react";
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

import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { useToastStore } from "@/shared/store/toastStore";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import {
  BUILTIN_HEADPHONE_PRESETS,
  type BuiltinHeadphonePreset,
} from "../data/builtinPresets";
import { searchBuiltinPresets } from "../data/builtinPresetSearch";
import { useHeadphoneCorrection } from "../hooks/useHeadphoneCorrection";

interface Props {
  /** Warna aksen dari layar induk, supaya konsisten dengan tema aktif. */
  accent?: string;
  /** Bekukan seksi di mode non-DSP (B2): tombol impor/aktivasi nonaktif,
      seksi meredup seperti seksi lain — koreksi di-bypass di mode itu,
      jadi kartu tidak boleh tampil seolah aktif. */
  disabled?: boolean;
  /** Dirender di dalam kartu induk (Solfeggio): seksi tidak menambah
      padding sendiri (kartu yang memberi padding) dan judulnya disamakan
      dengan judul kartu (14 bold) — P2 audit BitPerfect/Solfeggio:
      judul 16 semibold di luar kartu membalik hierarki. */
  inCard?: boolean;
}

export const HeadphoneSection = memo(({
  accent,
  disabled,
  inCard,
}: Props) => {
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

  // FASE 3 EQ — hapus profil kini ConfirmDialog (bukan Alert.alert);
  // penolakan pasang preset/profil kini toast error (bukan Alert),
  // mengikuti migrasi impor M3U di Library. Pesan TIDAK berubah.
  const [deleteProfileTarget, setDeleteProfileTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const showToast = useToastStore((s) => s.showToast);

  // Picker preset bawaan — cari berdasarkan nama, bukan dropdown panjang.
  const [builtinQuery, setBuiltinQuery] = useState("");
  const [loadingBuiltinId, setLoadingBuiltinId] = useState<string | null>(
    null,
  );
  const builtinResults = useMemo(
    () => searchBuiltinPresets(builtinQuery),
    [builtinQuery],
  );

  // Muat preset bawaan lewat jalur impor yang sudah ada (validasi native +
  // addProfile), lalu aktifkan. Kalau profil dengan teks yang sama sudah ada,
  // aktifkan saja — jangan menduplikasi profil tiap ketukan.
  const handleLoadBuiltin = async (preset: BuiltinHeadphonePreset) => {
    if (disabled || loadingBuiltinId) return;
    const displayName = `${preset.brand} ${preset.model}`;
    setLoadingBuiltinId(preset.id);
    try {
      const existing = profiles.find(
        (p) => p.presetText.trim() === preset.presetText.trim(),
      );
      let id = existing?.id;
      if (!id) {
        const result = await importPreset(displayName, preset.presetText);
        if (!result.ok || !result.profileId) {
          showToast(
            `Preset "${displayName}" ditolak. Coba preset lain atau impor manual.`,
            "error",
          );
          return;
        }
        id = result.profileId;
      }
      const ok = await activate(id);
      if (!ok) {
        showToast(
          `Profil "${displayName}" ditolak. Coba profil lain atau impor ulang presetnya.`,
          "error",
        );
      } else {
        // FASE 4: profil diterapkan kini ber-toast sukses (dulu hanya
        // penolakan yang ber-toast; berhasil diam).
        showToast(`Profil "${displayName}" diterapkan.`, "success");
      }
    } finally {
      setLoadingBuiltinId(null);
    }
  };

  // Hapus profil lewat long-press — seperti hapus preset EQ, minta
  // konfirmasi dulu supaya profil tidak hilang karena sentuhan tak sengaja.
  const handleRemoveProfile = (id: string, name: string) => {
    setDeleteProfileTarget({ id, name });
  };

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
          // inCard: kartu induk yang memberi padding — padding seksi
          // sendiri di-nol-kan supaya tidak dobel.
          paddingHorizontal: inCard ? 0 : spacing.md,
          paddingTop: inCard ? 0 : spacing.md,
          paddingBottom: inCard ? 0 : spacing.xs,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text
          style={[
            styles.title,
            // inCard: samakan dengan judul kartu (14 bold); 16 semibold
            // di dalam kartu akan terlihat lebih penting daripada judul
            // kartu di sekelilingnya.
            inCard && styles.titleInCard,
            { color: colors.text.primary },
          ]}
        >
          Koreksi Headphone
        </Text>

        {activeProfile && (
          <TouchableOpacity
            onPress={() => void deactivate()}
            disabled={disabled}
            style={[styles.pill, { borderColor: colors.border.medium }]}
            accessibilityState={{ disabled: !!disabled }}
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
        <Text style={[styles.bound, { color: colors.text.secondary }]}>
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
                accessibilityRole="button"
                accessibilityLabel={
                  `${p.name}, ${p.filterCount} filter` +
                  (isActive ? ", aktif" : "") +
                  (isBound ? ", terikat ke perangkat ini" : "") +
                  ". Tekan lama untuk menghapus."
                }
                accessibilityState={{ selected: isActive, disabled: !!disabled }}
                disabled={disabled}
                onPress={async () => {
                  if (isActive) {
                    void deactivate();
                  } else {
                    // U-P2-34: nilai `ok` dari activate() DULU diabaikan
                    // (`void activate(p.id)`) — native menolak preset
                    // (mis. preset tidak lolos parse ulang) tanpa pesan
                    // apa pun. Sekarang penolakan disampaikan ke user.
                    const ok = await activate(p.id);
                    if (!ok) {
                      showToast(
                        `Profil "${p.name}" ditolak. Coba profil lain atau impor ulang presetnya.`,
                        "error",
                      );
                    } else {
                      // FASE 4: profil diterapkan kini ber-toast sukses.
                      showToast(`Profil "${p.name}" diterapkan.`, "success");
                    }
                  }
                }}
                onLongPress={() => handleRemoveProfile(p.id, p.name)}
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
                    {
                      color: colors.text.primary,
                      fontFamily: isActive
                        ? FONT_FAMILY.bold
                        : FONT_FAMILY.semiBold,
                    },
                  ]}
                >
                  {p.name}
                </Text>

                <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>
                  {p.filterCount} filter
                </Text>

                {isBound && (
                  <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>
                    terikat
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* U-P2-33: petunjuk long-press = hapus. Dulu tidak ada petunjuk apa
          pun di UI (maupun di accessibilityLabel) bahwa tekan lama menghapus
          profil — bandingkan hapus preset EQ yang juga tidak berpetunjuk
          (U-P2-45). */}
      {profiles.length > 0 && (
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          Tekan lama untuk menghapus.
        </Text>
      )}

      {/* Preset bawaan — picker pencarian, bukan dropdown panjang. Mengetuk
          model memuat preset AutoEq-nya lewat jalur impor yang sudah ada. */}
      <Text
        style={[
          styles.builtinTitle,
          { color: colors.text.primary, marginTop: spacing.md },
        ]}
      >
        Preset bawaan ({BUILTIN_HEADPHONE_PRESETS.length})
      </Text>

      <TextInput
        accessibilityLabel="Cari preset bawaan"
        value={builtinQuery}
        onChangeText={setBuiltinQuery}
        placeholder="Cari IEM… (mis. Chu, Aria, Zero)"
        placeholderTextColor={colors.text.secondary}
        editable={!disabled}
        style={[
          styles.input,
          styles.builtinSearch,
          { color: colors.text.primary, borderColor: colors.border.medium },
        ]}
      />

      {/* Catatan jujur: preset bawaan adalah perkiraan. Dihitung AutoEq dari
          SATU hasil pengukuran (satu rig, satu unit) ke SATU kurva target
          (Harman in-ear 2019) — unit, eartips, dan telinga tiap orang
          berbeda, jadi hasilnya bisa tidak sama persis di perangkatmu. */}
      <Text style={[styles.builtinNote, { color: colors.text.secondary }]}>
        Preset bawaan bersifat perkiraan: dihitung dari satu hasil pengukuran
        ke satu kurva target — unit, eartips, dan telingamu bisa memberi hasil
        yang berbeda.
      </Text>

      {builtinQuery.trim() === "" ? (
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          Ketik nama IEM untuk mencari dari {BUILTIN_HEADPHONE_PRESETS.length}{" "}
          preset bawaan.
        </Text>
      ) : builtinResults.length === 0 ? (
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          Tidak ada preset bawaan yang cocok dengan &quot;{builtinQuery.trim()}
          &quot;.
        </Text>
      ) : (
        <ScrollView
          style={[styles.builtinList, { borderColor: colors.border.medium }]}
          nestedScrollEnabled
        >
          {builtinResults.map((preset) => {
            const isLoading = loadingBuiltinId === preset.id;
            const alreadyAdded = profiles.some(
              (p) => p.presetText.trim() === preset.presetText.trim(),
            );
            const isActive =
              alreadyAdded &&
              enabled &&
              profiles.some(
                (p) =>
                  p.presetText.trim() === preset.presetText.trim() &&
                  p.id === activeProfile?.id,
              );
            return (
              <TouchableOpacity
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={
                  `${preset.brand} ${preset.model}, ${preset.filterCount} filter` +
                  `, pengukuran ${preset.database}` +
                  (isActive ? ", aktif" : "") +
                  (alreadyAdded ? ", sudah ditambahkan" : "")
                }
                accessibilityState={{ disabled: !!disabled }}
                disabled={disabled || isLoading}
                onPress={() => void handleLoadBuiltin(preset)}
                style={[
                  styles.builtinRow,
                  {
                    borderBottomColor: colors.border.medium,
                    opacity: disabled ? 0.4 : 1,
                  },
                ]}
              >
                <View style={styles.builtinRowText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.builtinRowTitle,
                      { color: colors.text.primary },
                    ]}
                  >
                    {preset.brand} {preset.model}
                  </Text>
                  <Text
                    style={[
                      styles.builtinRowMeta,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {preset.filterCount} filter • {preset.database} • Harman
                    IE 2019
                  </Text>
                </View>
                {isLoading ? (
                  <ActivityIndicator color={tint} />
                ) : isActive ? (
                  <Text
                    style={[styles.builtinRowState, { color: tint }]}
                  >
                    Aktif
                  </Text>
                ) : alreadyAdded ? (
                  <Text
                    style={[
                      styles.builtinRowState,
                      { color: colors.text.secondary },
                    ]}
                  >
                    Ditambahkan
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.actions, { gap: spacing.sm }]}>
        <TouchableOpacity
          onPress={() => setShowImport(true)}
          disabled={disabled}
          style={[styles.action, { borderColor: tint }]}
          accessibilityState={{ disabled: !!disabled }}
        >
          {/* Warna teks DIPILIH dari kandidat yang lulus AA di atas latar ini.
              `tint` (primary[500]) gagal di banyak tema gelap - mis. 1.30 pada
              midnight-blue - karena di tema gelap primary[500] justru gelap. */}
          <Text
            style={[
              styles.actionText,
              {
                color: pickReadable(
                  [tint, colors.text.primary],
                  colors.background.primary,
                  AA_NORMAL,
                ),
              },
            ]}
          >
            Impor preset
          </Text>
        </TouchableOpacity>

        {activeProfile && (
          <TouchableOpacity
            onPress={() =>
              bindCurrentDevice(hasBinding ? null : activeProfile.id)
            }
            disabled={disabled || !currentDevice}
            style={[
              styles.action,
              {
                borderColor: colors.border.medium,
                opacity: currentDevice && !disabled ? 1 : 0.4,
              },
            ]}
            accessibilityState={{ disabled: disabled || !currentDevice }}
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
              accessibilityLabel="Nama preset yang diimpor"
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
              accessibilityLabel="Teks preset AutoEq yang diimpor"
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
                <Text
                  style={{
                    color: colors.text.primary,
                    fontFamily: FONT_FAMILY.regular,
                  }}
                >
                  Batal
                </Text>
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
                  <ActivityIndicator
                    color={pickReadable(
                      [colors.text.inverse, colors.text.primary],
                      tint,
                      AA_NORMAL,
                    )}
                  />
                ) : (
                  <Text
                    style={{
                      color: pickReadable(
                        [colors.text.inverse, colors.text.primary],
                        tint,
                        AA_NORMAL,
                      ),
                      fontFamily: FONT_FAMILY.semiBold,
                    }}
                  >
                    Simpan
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FASE 3 EQ — dialog hapus profil (satu pola, bukan Alert.alert). */}
      <ConfirmDialog
        visible={deleteProfileTarget !== null}
        title="Hapus profil"
        message={
          deleteProfileTarget
            ? `Hapus profil "${deleteProfileTarget.name}"?`
            : undefined
        }
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleteProfileTarget) remove(deleteProfileTarget.id);
          setDeleteProfileTarget(null);
        }}
        onCancel={() => setDeleteProfileTarget(null)}
      />
    </View>
  );
});

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
  title: { fontSize: 16, fontFamily: FONT_FAMILY.semiBold },
  // Judul saat dirender di dalam kartu induk (Solfeggio): sama dengan
  // judul kartu lain (14 bold) supaya hierarki tidak terbalik.
  titleInCard: { fontSize: 14, fontFamily: FONT_FAMILY.bold },
  pill: {
    borderWidth: 1,
    borderRadius: BASE_RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontFamily: FONT_FAMILY.regular },
  device: { fontSize: 12, fontFamily: FONT_FAMILY.regular, marginTop: 4 },
  bound: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    marginTop: 2,
  },
  empty: { fontSize: 13, fontFamily: FONT_FAMILY.regular, marginTop: 10 },
  hint: { fontSize: 11, fontFamily: FONT_FAMILY.regular, marginTop: 8 },
  list: { marginTop: 10 },
  listContent: {},

  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
  },
  cardTitle: { fontSize: 13, fontFamily: FONT_FAMILY.semiBold },
  cardMeta: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 2,
  },
  actions: { flexDirection: "row", marginTop: 12 },

  // Picker preset bawaan (pencarian, bukan dropdown panjang). Daftar hasil
  // dibatasi tingginya supaya 24 model tidak mendorong layar ke bawah.
  builtinTitle: { fontSize: 14, fontFamily: FONT_FAMILY.semiBold },
  builtinSearch: { marginTop: 8, marginBottom: 0 },
  builtinNote: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 8,
    lineHeight: 15,
  },
  builtinList: {
    marginTop: 8,
    maxHeight: 240,
    borderWidth: 1,
    borderRadius: 10,
  },
  builtinRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  builtinRowText: { flex: 1 },
  builtinRowTitle: { fontSize: 13, fontFamily: FONT_FAMILY.semiBold },
  builtinRowMeta: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 2,
  },
  builtinRowState: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.semiBold,
    marginLeft: 8,
  },

  action: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BASE_RADIUS.sm,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionText: { fontSize: 13, fontFamily: FONT_FAMILY.medium },
  modalBackdrop: { flex: 1, justifyContent: "center" },
  modal: { borderRadius: 14, padding: 16 },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.semiBold,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: BASE_RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    marginBottom: 10,
  },
  inputMulti: { minHeight: 110, textAlignVertical: "top" },
  error: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    marginBottom: 8,
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BASE_RADIUS.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
});

export default HeadphoneSection;
